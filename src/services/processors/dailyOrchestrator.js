// Create new file: src/services/processors/dailyOrchestrator.js

const { format } = require('date-fns');
const financialProcessor = require('./financialProcessor');
const punishmentProcessor = require('./punishmentProcessor');
const bonusProcessor = require('./bonusProcessor');

class DailyOrchestrator {

  // Run complete daily reconciliation workflow
  async runDailyReconciliation(targetDate = null) {
    try {
      const today = targetDate || format(new Date(), 'yyyy-MM-dd');
      console.log(`🚀 Starting daily reconciliation for ${today}`);

      // Initialize results object
      const results = {
        date: today,
        financial: {
          debt_updates: [],
          uber_earnings: 0,
          debt_payments: [],
          match_bonus: null
        },
        punishments: {
          overdue_processed: [],
          completions: [],
          new_violations: [],
          debt_created: 0
        },
        bonuses: {
          bonuses_awarded: [],
          total_amount: 0
        },
        summary: ''
      };

      // Step 1: Process financial rules (debt interest)
      console.log('💰 Processing financial rules...');
      results.financial.debt_updates = await financialProcessor.processDailyFinancialRules();

      // Step 2: Process all punishment workflows
      console.log('⚖️ Processing punishments...');
      const punishmentResults = await punishmentProcessor.processAllPunishments(today);
      results.punishments = {
        overdue_processed: punishmentResults.overdue_processed,
        completions: punishmentResults.completions_processed,
        new_violations: punishmentResults.new_violations,
        debt_created: punishmentResults.summary.debt_created
      };

      // Step 3: Process Uber earnings and debt payments
      console.log('🚗 Processing Uber earnings...');
      const uberResults = await financialProcessor.processUberEarnings();
      results.financial.uber_earnings = uberResults.earnings;
      results.financial.debt_payments = uberResults.payments;
      results.financial.match_bonus = uberResults.matchBonus;

      // Step 4: Process daily bonuses (including potential Uber match)
      console.log('🎁 Processing bonuses...');
      const bonusResults = await bonusProcessor.processAllDailyBonuses(
        today, 
        uberResults.remaining // Only create match bonus if debt-free
      );
      results.bonuses = bonusResults;

      // Step 5: Generate summary
      results.summary = this.generateDailySummary(results);

      console.log(`✅ Daily reconciliation complete for ${today}`);
      console.log(`📊 Summary: ${results.summary}`);

      return results;

    } catch (error) {
      console.error('❌ Daily reconciliation failed:', error);
      throw error;
    }
  }

  // Generate human-readable summary
  generateDailySummary(results) {
    const summaryParts = [];

    // Financial updates
    if (results.financial.debt_updates.length > 0) {
      const totalInterest = results.financial.debt_updates.reduce((sum, debt) => 
        sum + debt.interest_applied, 0
      );
      summaryParts.push(`Applied $${totalInterest.toFixed(2)} in daily interest.`);
    }

    // Punishment debt
    if (results.punishments.debt_created > 0) {
      summaryParts.push(`Assigned $${results.punishments.debt_created} in new debt for violations.`);
    }

    // Uber earnings and payments
    if (results.financial.uber_earnings > 0) {
      if (results.financial.debt_payments.length > 0) {
        const totalPaid = results.financial.debt_payments.reduce((sum, payment) => 
          sum + payment.payment_amount, 0
        );
        summaryParts.push(`Your $${results.financial.uber_earnings} Uber earnings paid $${totalPaid} toward debt.`);
      } else if (results.financial.match_bonus) {
        summaryParts.push(`Your $${results.financial.uber_earnings} Uber earnings earned a matching bonus.`);
      }
    }

    // Bonuses
    if (results.bonuses.total_amount > 0) {
      summaryParts.push(`Today's bonuses total $${results.bonuses.total_amount}.`);
    } else {
      summaryParts.push(`No bonuses earned today.`);
    }

    // Punishments
    if (results.punishments.new_violations.length > 0) {
      summaryParts.push(`Assigned ${results.punishments.new_violations.length} new punishment(s).`);
    }

    if (results.punishments.completions.length > 0) {
      summaryParts.push(`Completed ${results.punishments.completions.length} punishment assignment(s).`);
    }

    return summaryParts.length > 0 ? summaryParts.join(' ') : 'No significant activity today.';
  }

  // Get comprehensive daily status
  async getDailyStatus(date = null) {
    try {
      const targetDate = date || format(new Date(), 'yyyy-MM-dd');
      
      const status = {
        date: targetDate,
        financial: await financialProcessor.getFinancialSummary(targetDate),
        punishments: await punishmentProcessor.getPunishmentSummary(targetDate),
        bonuses: await bonusProcessor.getBonusSummary(targetDate),
        last_reconciliation: null // Could track when last run
      };

      return status;

    } catch (error) {
      console.error('Error getting daily status:', error);
      return null;
    }
  }

}

module.exports = new DailyOrchestrator();