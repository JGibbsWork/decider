const { format } = require('date-fns');

// Import domain services
const punishmentService = require('../core/punishments');
const bonusService = require('../core/bonuses');
const workoutService = require('../core/workouts');
const debtService = require('../core/debt');
const notionService = require('../integrations/notion');

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

      // Step 2: Process daily financial rules (debt interest) - DIRECT IMPLEMENTATION
      console.log('💰 Processing financial rules...');
      results.financial.debt_updates = await this.processDailyFinancialRules();

      // Step 3: Process all punishment workflows
      console.log('⚖️ Processing punishments...');
      const punishmentResults = await this.processPunishments(today);
      results.punishments = punishmentResults;

      // Step 4: Process Uber earnings and debt payments - DIRECT IMPLEMENTATION
      console.log('🚗 Processing Uber earnings...');
      const uberResults = await this.processUberEarnings();
      results.financial.uber_earnings = uberResults.earnings;
      results.financial.debt_payments = uberResults.payments;
      results.financial.match_bonus = uberResults.matchBonus;

      // Step 5: Process daily bonuses
      console.log('🎁 Processing bonuses...');
      const bonusResults = await this.processDailyBonuses(today, results.workouts.bonus_eligible, uberResults.remaining);
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

  // DIRECT FINANCIAL IMPLEMENTATION (no processor dependency)
  async processDailyFinancialRules() {
    try {
      console.log('Applying daily interest to debts...');
      
      const activeDebts = await notionService.getActiveDebts();
      const debtUpdates = [];

      for (const debt of activeDebts) {
        const currentAmount = debt.properties['Current Amount'].number || 0;
        const interestRate = debt.properties['Interest Rate'].number || 0.30; // 30% default
        
        const newAmount = currentAmount * (1 + interestRate);
        
        // Update debt in Notion
        await debtService.updateDebtAmount(debt.id, newAmount);
        
        debtUpdates.push({
          debt_id: debt.id,
          old_amount: currentAmount,
          new_amount: newAmount,
          interest_applied: newAmount - currentAmount
        });
        
        console.log(`Applied ${interestRate * 100}% interest: $${currentAmount} → $${newAmount.toFixed(2)}`);
      }

      return debtUpdates;

    } catch (error) {
      console.error('Error processing daily financial rules:', error);
      return [];
    }
  }

  // DIRECT UBER EARNINGS IMPLEMENTATION (no processor dependency)
  async processUberEarnings() {
    try {
      const balances = await notionService.getLatestBalances(2);
      
      if (balances.length < 2) {
        console.log('Insufficient balance history for Uber earnings calculation');
        return { earnings: 0, payments: [], remaining: 0, matchBonus: null };
      }

      const [today, yesterday] = balances;
      const uberEarnings = (today.properties['Account B Balance'].number || 0) - 
                          (yesterday.properties['Account B Balance'].number || 0);

      if (uberEarnings <= 0) {
        console.log('No Uber earnings today');
        return { earnings: 0, payments: [], remaining: 0, matchBonus: null };
      }

      console.log(`Found $${uberEarnings} in Uber earnings`);

      // Check if there's active debt
      const activeDebts = await notionService.getActiveDebts();
      
      if (activeDebts.length > 0) {
        // Pay toward debt (oldest first)
        console.log('Active debt found, applying earnings to debt...');
        const payments = await debtService.applyEarningsToDebt(uberEarnings, activeDebts);
        
        return {
          earnings: uberEarnings,
          payments: payments,
          remaining: 0, // All goes to debt
          matchBonus: null
        };
      } else {
        // Debt-free: earnings stay, can create match bonus
        console.log('Debt-free! Uber earnings available for matching.');
        
        return {
          earnings: uberEarnings,
          payments: [],
          remaining: uberEarnings,
          matchBonus: {
            type: 'uber_match',
            amount: uberEarnings,
            description: `Uber Eats match bonus: $${uberEarnings}`
          }
        };
      }

    } catch (error) {
      console.error('Error processing Uber earnings:', error);
      return { earnings: 0, payments: [], remaining: 0, matchBonus: null };
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
      
      // Calculate debt created from overdue
      results.debt_created = results.overdue_processed.reduce((sum, overdue) => {
        return sum + (overdue.debt_amount || 0);
      }, 0);

      // Check completions
      results.completions = await punishmentService.processCompletions(date);

      // Process new violations
      results.new_violations = await punishmentService.processNewViolations(date);

      console.log(`Punishment processing: ${results.overdue_processed.length} overdue, ${results.completions.length} completed, ${results.new_violations.length} new`);

      return results;

    } catch (error) {
      console.error('Error in punishment processing:', error);
      throw error;
    }
  }

  async processDailyBonuses(date, workoutsEligible, uberEarnings = 0) {
    try {
      const allBonuses = [];
      
      // Workout bonuses (per occurrence)
      for (const workout of workoutsEligible) {
        const bonus = await bonusService.createWorkoutBonus(workout, date);
        if (bonus) allBonuses.push(bonus);
      }

      // Uber match bonus (if debt-free and has earnings)
      if (uberEarnings > 0) {
        const uberMatchBonus = await bonusService.createUberMatchBonus(uberEarnings, date);
        if (uberMatchBonus) {
          allBonuses.push(uberMatchBonus);
          console.log(`Created Uber match bonus: $${uberEarnings}`);
        }
      }

      // Award all bonuses
      if (allBonuses.length > 0) {
        const awardedBonuses = await bonusService.awardBonuses(allBonuses);
        const totalAmount = awardedBonuses.reduce((sum, bonus) => sum + bonus.amount, 0);
        
        console.log(`Awarded ${awardedBonuses.length} bonuses totaling $${totalAmount}`);
        return {
          bonuses_awarded: awardedBonuses,
          total_amount: totalAmount
        };
      }

      return {
        bonuses_awarded: [],
        total_amount: 0
      };

    } catch (error) {
      console.error('Error processing daily bonuses:', error);
      return { bonuses_awarded: [], total_amount: 0 };
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
        financial: await this.getFinancialSummary(targetDate),
        punishments: await this.getPunishmentSummary(targetDate),
        bonuses: await this.getBonusSummary(targetDate),
        last_reconciliation: null
      };

      return status;

    } catch (error) {
      console.error('Error getting daily status:', error);
      return null;
    }
  }

  async getFinancialSummary(date) {
    const activeDebts = await notionService.getActiveDebts();
    const totalDebt = activeDebts.reduce((sum, debt) => 
      sum + (debt.properties['Current Amount'].number || 0), 0
    );
    
    return {
      total_debt: totalDebt,
      active_contracts: activeDebts.length,
      debt_free: activeDebts.length === 0
    };
  }

  async getPunishmentSummary(date) {
    const pendingPunishments = await notionService.getPendingPunishments();
    
    return {
      pending_count: pendingPunishments.length,
      total_minutes: pendingPunishments.reduce((sum, p) => 
        sum + (p.properties['Minutes'].number || 0), 0
      )
    };
  }

  async getBonusSummary(date) {
    // This would need implementation based on your bonus tracking
    return {
      todays_bonuses: 0,
      total_amount: 0
    };
  }

}

module.exports = new DailyReconciliationOrchestrator();