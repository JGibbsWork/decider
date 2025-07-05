// Create new file: src/services/processors/financialProcessor.js

const { format } = require('date-fns');
const notionService = require('../notion');
const debtService = require('../debt');
const bonusService = require('../bonuses');

class FinancialProcessor {

  // Apply daily financial rules (compound interest)
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

  // Calculate Uber earnings by comparing account balances
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

  // Process Uber earnings: pay debts first, then create match bonus
  async processUberEarnings() {
    try {
      const earnings = await this.calculateUberEarnings();
      
      const results = {
        earnings: earnings,
        payments: [],
        matchBonus: null,
        remaining: 0
      };

      if (earnings <= 0) {
        return results;
      }

      console.log(`Processing $${earnings} in Uber earnings...`);

      // First, apply earnings toward debt payments
      const paymentResults = await debtService.processUberEarnings(earnings);
      results.payments = paymentResults.payments;
      results.remaining = paymentResults.remaining;

      // If there are remaining earnings after debt payment, create match bonus
      if (paymentResults.remaining > 0) {
        const today = format(new Date(), 'yyyy-MM-dd');
        results.matchBonus = await bonusService.createUberMatchBonus(paymentResults.remaining, today);
        console.log(`Created $${paymentResults.remaining} Uber match bonus`);
      }

      return results;

    } catch (error) {
      console.error('Error processing Uber earnings:', error);
      return { earnings: 0, payments: [], matchBonus: null, remaining: 0 };
    }
  }

  // Get financial summary for a date
  async getFinancialSummary(date = null) {
    try {
      const targetDate = date || format(new Date(), 'yyyy-MM-dd');
      
      const summary = {
        date: targetDate,
        active_debts: 0,
        total_debt_amount: 0,
        account_balances: {},
        recent_uber_earnings: 0
      };

      // Get active debts
      const debts = await notionService.getActiveDebts();
      summary.active_debts = debts.length;
      summary.total_debt_amount = debts.reduce((sum, debt) => {
        return sum + (debt.properties['Current Amount'].number || 0);
      }, 0);

      // Get latest account balances
      const balances = await notionService.getLatestBalances(1);
      if (balances.length > 0) {
        const latestBalance = balances[0];
        summary.account_balances = {
          account_a: latestBalance.properties['Account A Balance'].number || 0,
          account_b: latestBalance.properties['Account B Balance'].number || 0,
          checking: latestBalance.properties['Checking Balance'].number || 0
        };
      }

      // Calculate recent Uber earnings
      summary.recent_uber_earnings = await this.calculateUberEarnings();

      return summary;

    } catch (error) {
      console.error('Error getting financial summary:', error);
      return null;
    }
  }

}

module.exports = new FinancialProcessor();