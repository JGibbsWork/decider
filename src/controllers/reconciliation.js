const { format } = require('date-fns');
const notionService = require('../services/notion');
const debtService = require('../services/debt');
const bonusService = require('../services/bonuses');
const punishmentService = require('../services/punishments');

// Calculate Uber earnings by comparing today's balance to yesterday's
async function calculateUberEarnings() {
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

// Generate human-readable summary of reconciliation results
function generateSummary(results) {
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

async function runReconciliation(req, res) {
  try {
    const today = format(new Date(), 'yyyy-MM-dd');
    console.log(`Running reconciliation for ${today}`);

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

    // Step 1: Apply daily interest to existing debts
    console.log('Applying daily interest to debts...');
    results.debt_updates = await debtService.applyDailyInterest();

    // Step 2: Check for overdue punishments and create debt
    console.log('Checking for overdue punishments...');
    const overduePunishments = await punishmentService.checkOverduePunishments(today);
    
    for (const overdue of overduePunishments) {
      if (overdue.debt_created) {
        const newDebt = await debtService.createViolationDebt(
          `Missed punishment: ${overdue.name}`,
          50
        );
        results.new_debt_assigned.push(newDebt);
      }
    }

    // Step 3: Check if today's punishments were completed
    console.log('Checking punishment completions...');
    results.completed_punishments = await punishmentService.checkTodaysPunishmentCompletion(today);

    // Step 4: Check for new violations and assign punishments
    console.log('Checking for new violations...');
    const violations = await punishmentService.checkForViolations(today);
    const newPunishments = await punishmentService.processViolations(violations);
    results.new_punishments = newPunishments;

    // Step 5: Calculate Uber earnings and process debt payments
    console.log('Processing Uber earnings...');
    const uberEarnings = await calculateUberEarnings();
    results.uber_earnings_processed = uberEarnings;

    if (uberEarnings > 0) {
      const paymentResults = await debtService.processUberEarnings(uberEarnings);
      results.debt_payments_made = paymentResults.payments;
      
      // If there are remaining earnings after debt payment, create match bonus
      if (paymentResults.remaining > 0) {
        const uberBonus = await bonusService.createUberMatchBonus(paymentResults.remaining, today);
        results.new_bonuses.push(uberBonus);
      }
    }

    // Step 6: Check for workout bonuses
    console.log('Checking workout bonuses...');
    const workoutBonuses = await bonusService.checkWorkoutBonuses(today);
    results.new_bonuses.push(...workoutBonuses);

    // Step 7: Award all bonuses in Notion
    if (results.new_bonuses.length > 0) {
      console.log('Awarding bonuses...');
      const awardedBonuses = await bonusService.awardBonuses(results.new_bonuses);
      results.total_bonus_amount = bonusService.getTotalBonusAmount(results.new_bonuses);
      
      // Replace bonus objects with awarded results
      results.new_bonuses = awardedBonuses;
    }

    // Step 8: Generate summary
    results.summary = generateSummary(results);

    console.log('Reconciliation complete');
    res.json({
      success: true,
      results
    });

  } catch (error) {
    console.error('Reconciliation error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}

// Health check endpoint for the reconciliation system
async function healthCheck(req, res) {
  try {
    // Test Notion connection
    await notionService.getLatestBalances(1);
    
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      services: {
        notion: 'connected',
        debt: 'ready',
        bonuses: 'ready',
        punishments: 'ready'
      }
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
}

module.exports = {
  runReconciliation,
  healthCheck
};