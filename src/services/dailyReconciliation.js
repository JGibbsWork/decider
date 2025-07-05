const { format } = require('date-fns');
const notionService = require('./notion');
const debtService = require('./debt');
const bonusService = require('./bonuses');
const punishmentService = require('./punishments');
const rulesService = require('./rules');

class DailyReconciliationService {

  // Run complete daily reconciliation
  async runDailyReconciliation(targetDate = null) {
    try {
      const today = targetDate || format(new Date(), 'yyyy-MM-dd');
      console.log(`Running daily reconciliation for ${today}`);

      // Initialize results object
      const results = {
        date: today,
        debt_updates: [],
        new_bonuses: [],
        new_punishments: [],
        completed_punishments: [],
        debt_payments_made: [],
        new_debt_assigned: [],
        uber_earnings_processed: 0,
        total_bonus_amount: 0,
        summary: ''
      };

      // Step 1: Apply daily financial rules (interest)
      console.log('Processing daily financial rules...');
      results.debt_updates = await this.processDailyFinancialRules();

      // Step 2: Check for overdue punishments and create debt
      console.log('Checking overdue punishments...');
      const overduePunishments = await this.processOverduePunishments(today);
      for (const overdue of overduePunishments) {
        if (overdue.debt_created) {
          const newDebt = await debtService.createViolationDebt(
            `Missed punishment: ${overdue.name}`
          );
          results.new_debt_assigned.push(newDebt);
        }
      }

      // Step 3: Check if today's punishments were completed
      console.log('Checking punishment completions...');
      results.completed_punishments = await this.processPunishmentCompletions(today);

      // Step 4: Check for new daily violations and assign punishments
      console.log('Checking for daily violations...');
      const violations = await this.checkDailyViolations(today);
      const newPunishments = await this.processViolations(violations);
      results.new_punishments = newPunishments;

      // Step 5: Calculate and process Uber earnings
      console.log('Processing Uber earnings...');
      const uberResults = await this.processUberEarnings();
      results.uber_earnings_processed = uberResults.earnings;
      results.debt_payments_made = uberResults.payments;
      
      // Add Uber match bonus if debt-free
      if (uberResults.matchBonus) {
        results.new_bonuses.push(uberResults.matchBonus);
      }

      // Step 6: Check for daily workout bonuses (per occurrence)
      console.log('Checking daily workout bonuses...');
      const workoutBonuses = await this.checkDailyWorkoutBonuses(today);
      results.new_bonuses.push(...workoutBonuses);

      // Step 7: Award all bonuses in Notion
      if (results.new_bonuses.length > 0) {
        console.log('Awarding daily bonuses...');
        const awardedBonuses = await bonusService.awardBonuses(results.new_bonuses);
        results.total_bonus_amount = bonusService.getTotalBonusAmount(results.new_bonuses);
        results.new_bonuses = awardedBonuses;
      }

      // Step 8: Generate summary
      results.summary = this.generateDailySummary(results);

      console.log('Daily reconciliation complete');
      return results;

    } catch (error) {
      console.error('Daily reconciliation error:', error);
      throw error;
    }
  }

  // Process daily financial rules (interest application)
  async processDailyFinancialRules() {
    const dailyRules = await rulesService.getDailyRules();
    const updates = [];

    // Apply debt interest if it's a daily rule
    if (dailyRules['debt_interest_rate']) {
      const interestUpdates = await debtService.applyDailyInterest();
      updates.push(...interestUpdates);
    }

    return updates;
  }

  // Process overdue punishments
  async processOverduePunishments(date) {
    return await punishmentService.checkOverduePunishments(date);
  }

  // Process punishment completions
  async processPunishmentCompletions(date) {
    return await punishmentService.checkTodaysPunishmentCompletion(date);
  }

  // Check for daily violations
  async checkDailyViolations(date) {
    return await punishmentService.checkForViolations(date);
  }

  // Process violations into punishments
  async processViolations(violations) {
    return await punishmentService.processViolations(violations);
  }

  // Process Uber earnings and debt payments
  async processUberEarnings() {
    const earnings = await this.calculateUberEarnings();
    const results = {
      earnings: earnings,
      payments: [],
      matchBonus: null
    };

    if (earnings > 0) {
      const paymentResults = await debtService.processUberEarnings(earnings);
      results.payments = paymentResults.payments;
      
      // If there are remaining earnings after debt payment, create match bonus
      if (paymentResults.remaining > 0) {
        const today = format(new Date(), 'yyyy-MM-dd');
        results.matchBonus = await bonusService.createUberMatchBonus(paymentResults.remaining, today);
      }
    }

    return results;
  }

  // Calculate Uber earnings by comparing today's balance to yesterday's
  async calculateUberEarnings() {
    try {
      const balances = await notionService.getLatestBalances(2);
      
      if (balances.length < 2) {
        console.log('Not enough balance history to calculate Uber earnings');
        return 0;
      }

      const todayBalance = balances[0].properties['Account B Balance'].number || 0;
      const yesterdayBalance = balances[1].properties['Account B Balance'].number || 0;

      const earnings = Math.max(0, todayBalance - yesterdayBalance);
      console.log(`Uber earnings calculated: $${earnings} (Today: $${todayBalance}, Yesterday: $${yesterdayBalance})`);
      
      return earnings;
    } catch (error) {
      console.error('Error calculating Uber earnings:', error);
      return 0;
    }
  }

  // Check for daily workout bonuses (per occurrence rules)
  async checkDailyWorkoutBonuses(date) {
    return await bonusService.checkWorkoutBonuses(date);
  }

  // Generate human-readable summary of daily results
  generateDailySummary(results) {
    const summaryParts = [];

    // Debt updates
    if (results.debt_updates.length > 0) {
      const totalInterest = results.debt_updates.reduce((sum, debt) => 
        sum + (debt.new_amount - debt.old_amount), 0
      );
      summaryParts.push(`Applied $${totalInterest.toFixed(2)} in daily interest to existing debts.`);
    }

    // New debt assigned
    if (results.new_debt_assigned.length > 0) {
      const totalNewDebt = results.new_debt_assigned.reduce((sum, debt) => sum + debt.amount, 0);
      summaryParts.push(`Assigned $${totalNewDebt} in new debt for violations.`);
    }

    // Uber earnings and debt payments
    if (results.uber_earnings_processed > 0) {
      if (results.debt_payments_made.length > 0) {
        const totalPaid = results.debt_payments_made.reduce((sum, payment) => 
          sum + payment.payment_amount, 0
        );
        summaryParts.push(`Your $${results.uber_earnings_processed} Uber earnings paid $${totalPaid} toward debt.`);
      } else {
        summaryParts.push(`Your $${results.uber_earnings_processed} Uber earnings earned a matching bonus.`);
      }
    }

    // Bonuses earned
    if (results.total_bonus_amount > 0) {
      summaryParts.push(`Today's bonuses total $${results.total_bonus_amount}.`);
    } else {
      summaryParts.push(`No bonuses earned today.`);
    }

    // Punishments
    if (results.new_punishments.length > 0) {
      const punishmentCount = results.new_punishments.length;
      summaryParts.push(`Assigned ${punishmentCount} new punishment${punishmentCount > 1 ? 's' : ''}.`);
    }

    if (results.completed_punishments.length > 0) {
      const completedCount = results.completed_punishments.length;
      summaryParts.push(`Completed ${completedCount} punishment assignment${completedCount > 1 ? 's' : ''}.`);
    }

    return summaryParts.length > 0 ? summaryParts.join(' ') : 'No significant activity today.';
  }
}

module.exports = new DailyReconciliationService();