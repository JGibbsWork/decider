const notionService = require('./notion');
const { format } = require('date-fns');

const SYSTEM_RULES_DB = process.env.SYSTEM_RULES_DATABASE_ID;

class RulesService {
  constructor() {
    this.cache = new Map();
    this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
  }

  // Clear cache (useful after updates)
  clearCache() {
    this.cache.clear();
  }

  // Get cached value or fetch from Notion
  async getCachedValue(key, fetchFunction) {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.value;
    }

    const value = await fetchFunction();
    this.cache.set(key, { value, timestamp: Date.now() });
    return value;
  }

  // Get all rules from the system rules database
  async getAllRules() {
    return await this.getCachedValue('all_rules', async () => {
      try {
        const response = await notionService.notion.databases.query({
          database_id: SYSTEM_RULES_DB
        });

        const rules = {};
        
        for (const page of response.results) {
          const props = page.properties;
          
          const ruleName = props['Rule Name']?.title?.[0]?.plain_text;
          if (!ruleName) continue;

          const baseValue = props['Base Value']?.rich_text?.[0]?.plain_text || '';
          const calculatedValue = props['Calculated Value']?.rich_text?.[0]?.plain_text || baseValue;
          const modifier = props['Current Modifier']?.rich_text?.[0]?.plain_text || '0%';
          const ruleType = props['Type']?.select?.name || 'unknown';
          const frequency = props['Frequency']?.select?.name || 'unknown';
          const punishable = props['Punishable']?.checkbox || false;
          const description = props['Description']?.rich_text?.[0]?.plain_text || '';

          rules[ruleName] = {
            baseValue,
            calculatedValue,
            modifier,
            type: ruleType,
            frequency,
            punishable,
            description,
            pageId: page.id
          };
        }

        return rules;
      } catch (error) {
        console.error('Error fetching rules:', error);
        throw error;
      }
    });
  }

  // Get a specific rule by name
  async getRule(ruleName) {
    const rules = await this.getAllRules();
    return rules[ruleName];
  }

  // Get the numeric value from a rule (handles $, %, plain numbers)
  async getNumericValue(ruleName) {
    const rule = await this.getRule(ruleName);
    if (!rule) {
      throw new Error(`Rule ${ruleName} not found`);
    }

    // Use calculated value if it exists, otherwise use base value
    const value = rule.calculatedValue || rule.baseValue;
    
    if (value.includes('$')) {
      return parseFloat(value.replace('$', ''));
    } else if (value.includes('%')) {
      return parseFloat(value.replace('%', ''));
    } else {
      return parseFloat(value) || 0;
    }
  }

  // Get all bonuses
  async getAllBonuses() {
    const rules = await this.getAllRules();
    const bonuses = {};
    
    for (const [key, rule] of Object.entries(rules)) {
      if (rule.type === 'bonus') {
        bonuses[key] = await this.getNumericValue(key);
      }
    }
    
    return bonuses;
  }

  // Get rules by frequency (daily, weekly, per occurrence)
  async getRulesByFrequency(frequency) {
    const rules = await this.getAllRules();
    const filtered = {};
    
    for (const [key, rule] of Object.entries(rules)) {
      if (rule.frequency === frequency) {
        filtered[key] = rule;
      }
    }
    
    return filtered;
  }

  // Get daily rules (things processed every day)
  async getDailyRules() {
    return await this.getRulesByFrequency('daily');
  }

  // Get weekly rules (things processed at end of week)
  async getWeeklyRules() {
    return await this.getRulesByFrequency('weekly');
  }

  // Get per occurrence rules (things processed each time they happen)
  async getPerOccurrenceRules() {
    return await this.getRulesByFrequency('per occurrence');
  }

  // Get punishable expectations (things that trigger punishment if not met)
  async getPunishableExpectations() {
    const rules = await this.getAllRules();
    const punishable = {};
    
    for (const [key, rule] of Object.entries(rules)) {
      if (rule.punishable && rule.type === 'expectation') {
        punishable[key] = rule;
      }
    }
    
    return punishable;
  }

  // Get non-punishable expectations (things that just lose bonus if not met)
  async getNonPunishableExpectations() {
    const rules = await this.getAllRules();
    const nonPunishable = {};
    
    for (const [key, rule] of Object.entries(rules)) {
      if (!rule.punishable && rule.type === 'expectation') {
        nonPunishable[key] = rule;
      }
    }
    
    return nonPunishable;
  }

  // Get all expectations/minimums
  async getExpectations() {
    const rules = await this.getAllRules();
    const expectations = {};
    
    for (const [key, rule] of Object.entries(rules)) {
      if (rule.type === 'expectation') {
        expectations[key] = await this.getNumericValue(key);
      }
    }
    
    return expectations;
  }

  // Get all financial rules
  async getFinancialRules() {
    const rules = await this.getAllRules();
    const financial = {};
    
    for (const [key, rule] of Object.entries(rules)) {
      if (rule.type === 'financial') {
        financial[key] = await this.getNumericValue(key);
      }
    }
    
    return financial;
  }

  // Update rule modifier (for LLM dynamic adjustments)
  async updateRuleModifier(ruleName, modifierPercent, reason = null) {
    try {
      const rules = await this.getAllRules();
      const rule = rules[ruleName];
      
      if (!rule) {
        throw new Error(`Rule ${ruleName} not found`);
      }

      // Find the rule page in Notion
      const response = await notionService.notion.databases.query({
        database_id: SYSTEM_RULES_DB,
        filter: {
          property: 'Rule Name',
          title: {
            equals: ruleName
          }
        }
      });

      if (response.results.length === 0) {
        throw new Error(`Rule ${ruleName} not found in database`);
      }

      const rulePage = response.results[0];
      const baseValue = rule.baseValue;
      const modifier = modifierPercent / 100; // Convert percentage to decimal
      
      // Calculate new value
      let newCalculatedValue;
      if (baseValue.includes('$')) {
        // Handle money values
        const baseAmount = parseFloat(baseValue.replace('$', ''));
        const newAmount = Math.round(baseAmount * (1 + modifier) * 100) / 100;
        newCalculatedValue = `$${newAmount}`;
      } else if (baseValue.includes('%')) {
        // Handle percentage values
        const basePercent = parseFloat(baseValue.replace('%', ''));
        const newPercent = Math.round(basePercent * (1 + modifier) * 100) / 100;
        newCalculatedValue = `${newPercent}%`;
      } else {
        // Handle numeric values
        const baseNum = parseFloat(baseValue);
        const newNum = Math.round(baseNum * (1 + modifier));
        newCalculatedValue = newNum.toString();
      }

      // Update the rule in Notion
      await notionService.notion.pages.update({
        page_id: rulePage.id,
        properties: {
          'Current Modifier': {
            rich_text: [{ text: { content: `${modifierPercent}%` } }]
          },
          'Calculated Value': {
            rich_text: [{ text: { content: newCalculatedValue } }]
          },
          'Modified Date': {
            date: { start: format(new Date(), 'yyyy-MM-dd') }
          }
        }
      });

      // Clear cache to force refresh
      this.clearCache();

      return {
        rule_name: ruleName,
        base_value: baseValue,
        modifier_percent: modifierPercent,
        new_calculated_value: newCalculatedValue,
        reason: reason,
        updated_at: format(new Date(), 'yyyy-MM-dd HH:mm:ss')
      };

    } catch (error) {
      console.error('Error updating rule modifier:', error);
      throw error;
    }
  }

  // Reset rule modifier back to base value
  async resetRuleModifier(ruleName) {
    return await this.updateRuleModifier(ruleName, 0, 'Reset to base value');
  }

  // Get all modified rules (rules with non-zero modifiers)
  async getModifiedRules() {
    const rules = await this.getAllRules();
    const modified = {};
    
    for (const [key, rule] of Object.entries(rules)) {
      const modifier = rule.modifier || '0%';
      if (modifier !== '0%' && modifier !== '0') {
        modified[key] = {
          ...rule,
          modifier_percent: parseFloat(modifier.replace('%', '')) || 0
        };
      }
    }
    
    return modified;
  }

  // Bulk update multiple rules (for complex LLM adjustments)
  async updateMultipleRules(ruleUpdates) {
    const results = [];
    
    for (const update of ruleUpdates) {
      try {
        const result = await this.updateRuleModifier(
          update.rule_name, 
          update.modifier_percent, 
          update.reason
        );
        results.push({ success: true, ...result });
      } catch (error) {
        results.push({ 
          success: false, 
          rule_name: update.rule_name, 
          error: error.message 
        });
      }
    }
    
    return results;
  }

  // Specific getter methods for commonly used values
  async getLiftingBonus() {
    return await this.getNumericValue('lifting_bonus_amount');
  }

  async getExtraYogaBonus() {
    return await this.getNumericValue('extra_yoga_bonus_amount');
  }

  async getCardioPunishmentMinutes() {
    return await this.getNumericValue('cardio_punishment_minutes');
  }

  async getMissedCardioDebtAmount() {
    return await this.getNumericValue('missed_cardio_debt_amount');
  }

  async getWeeklyBaseAllowance() {
    return await this.getNumericValue('weekly_base_allowance');
  }

  async getDebtInterestRate() {
    return await this.getNumericValue('debt_interest_rate') / 100; // Convert percentage to decimal
  }

  async getWeeklyYogaMinimum() {
    return await this.getNumericValue('weekly_yoga_minimum');
  }

  async getPerfectWeekBonus() {
    return await this.getNumericValue('perfect_week_bonus');
  }

  async getJobApplicationsBonus() {
    return await this.getNumericValue('job_applications_bonus');
  }

  async getJobApplicationsMinimum() {
    return await this.getNumericValue('job_applications_minimum');
  }

  async getAlgoExpertBonus() {
    return await this.getNumericValue('algoexpert_problems_bonus');
  }

  async getAlgoExpertMinimum() {
    return await this.getNumericValue('algoexpert_problems_minimum');
  }

  async getReadingBonus() {
    return await this.getNumericValue('reading_bonus');
  }

  async getDatingBonus() {
    return await this.getNumericValue('dating_bonus');
  }

  async getOfficeAttendanceBonus() {
    return await this.getNumericValue('office_attendance_bonus');
  }

  async getOfficeAttendanceMinimum() {
    return await this.getNumericValue('office_attendance_minimum');
  }
}

module.exports = new RulesService();