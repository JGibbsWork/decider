const { format } = require('date-fns');

// Import domain services
const punishmentService = require('../core/punishments');
const bonusService = require('../core/bonuses');
const workoutService = require('../core/workouts');

// Import legacy services (for now - can be converted later)
const financialProcessor = require('../processors/financialProcessor');

class DailyReconciliationOrchestrator {

  async runDailyReconciliation(targetDate = null) {
    try {
      const today = targetDate || format(new Date(), 'yyyy-MM-dd');
      console.log(`🚀 Starting daily reconciliation for ${today}`);

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
        workouts: {
          todays_workouts: [],
          bonus_eligible: []
        },
        summary: ''
      };

      // Step 1: Get today's workout data
      console.log('🏋️ Analyzing today\'s workouts...');
      results.workouts.todays_workouts = await workoutService.getTodaysWorkouts(today);
      results.workouts.bonus_eligible = await workoutService.getWorkoutsEligibleForBonus(today);
      console.log(`Found ${results.workouts.todays_workouts.length} workouts, ${results.workouts.bonus_eligible.length} eligible for bonus`);

      // Step 2: Process financial rules (debt interest)
      console.log('💰 Processing financial rules...');
      results.financial.debt_updates = await financialProcessor.processDailyFinancialRules();

      // Step 3: Process all punishment workflows
      console.log('⚖️ Processing punishments...');
      const punishmentResults = await this.processPunishments(today);
      results.punishments = punishmentResults;

      // Step 4: Process Uber earnings and debt payments
      console.log('🚗 Processing Uber earnings...');
      const uberResults = await financialProcessor.processUberEarnings();
      results.financial.uber_earnings = uberResults.earnings;
      results.financial.debt_payments = uberResults.payments;
      results.financial.match_bonus = uberResults.matchBonus;

      // Step 5: Process daily bonuses
      console.log('🎁 Processing bonuses...');
      const bonusResults = await bonusService.processDailyBonuses(
        today, 
        uberResults.remaining // Only create match bonus if debt-free
      );
      results.bonuses = bonusResults;

      // Step 6: Generate summary
      results.summary = this.generateDailySummary(results);

      console.log(`✅ Daily reconciliation complete for ${today}`);
      console.log(`📊 Summary: ${results.summary}`);

      return results;

    } catch (error) {
      console.error('❌ Daily reconciliation failed:', error);
      throw error;
    }
  }

  async processPunishments(date) {
    try {
      const results = {
        overdue_processed: [],
        completions: [],
        new_violations: [],
        debt_created: 0
      };

      // Process overdue punishments
      results.overdue_processed = await punishmentService.processOverduePunishments(date);
      
      // Check punishment completions
      results.completions = await punishmentService.processCompletions(date);
      
      // Process new violations
      results.new_violations = await punishmentService.processNewViolations(date);

      // Calculate total debt created
      results.debt_created = results.overdue_processed.reduce((sum, overdue) => {
        return sum + (overdue.debt_amount || 0);
      }, 0);

      console.log(`Punishment processing: ${results.overdue_processed.length} overdue, ${results.completions.length} completed, ${results.new_violations.length} new`);

      return results;

    } catch (error) {
      console.error('Error in punishment processing:', error);
      throw error;
    }
  }

  generateDailySummary(results) {
    const summaryParts = [];

    // Financial updates
    if (results.financial.debt_updates.length > 0) {
      const totalInterest = results.financial.debt_updates.reduce((sum, debt) => 
        sum + debt.interest_applied, 0
      );
      summaryParts.push(`Applied $${totalInterest.toFixed(2)} in daily interest.`);
    }

    // Workouts
    if (results.workouts.todays_workouts.length > 0) {
      summaryParts.push(`Completed ${results.workouts.todays_workouts.length} workout(s).`);
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
        punishments: await this.getPunishmentSummary(targetDate),
        bonuses: await this.getBonusSummary(targetDate),
        workouts: await this.getWorkoutSummary(targetDate)
      };

      return status;

    } catch (error) {
      console.error('Error getting daily status:', error);
      return null;
    }
  }

  async getPunishmentSummary(date) {
    const pending = await punishmentService.getPendingPunishments();
    const completedToday = await punishmentService.processCompletions(date);

    return {
      pending_count: pending.length,
      completed_today: completedToday.length,
      total_pending_minutes: pending.reduce((sum, p) => sum + (p.minutes || 0), 0)
    };
  }

  async getBonusSummary(date) {
    // This could be implemented in the bonus service
    return {
      earned_today: 0,
      workout_bonuses: 0,
      total_amount: 0
    };
  }

  async getWorkoutSummary(date) {
    const workouts = await workoutService.getTodaysWorkouts(date);
    const streak = await workoutService.getCurrentWorkoutStreak(date);

    return {
      todays_count: workouts.length,
      types_completed: [...new Set(workouts.map(w => w.type))],
      current_streak: streak.current_streak,
      bonus_eligible: workouts.filter(w => w.isValidForBonus()).length
    };
  }
}

module.exports = new DailyReconciliationOrchestrator();