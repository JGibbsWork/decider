// src/services/core/debt/index.js

const { format, differenceInDays } = require('date-fns');
const notionClient = require('../../integrations/notion');

class DebtService {
  
  // Apply daily compound interest to all active debts
  async applyDailyInterest() {
    try {
      const activeDebts = await notionService.getActiveDebts();
      const updates = [];

      for (const debt of activeDebts) {
        const currentAmount = debt.properties['Current Amount'].number || 0;
        const interestRate = debt.properties['Interest Rate'].number || 0.30; // 30% default
        
        if (currentAmount > 0) {
          const newAmount = Math.round(currentAmount * (1 + interestRate) * 100) / 100;
          
          // Update debt in Notion
          await notionService.updateDebtAmount(debt.id, newAmount);
          
          updates.push({
            debt_id: debt.id,
            name: debt.properties.Name.title[0]?.text?.content || 'Unnamed debt',
            old_amount: currentAmount,
            new_amount: newAmount,
            interest_applied: newAmount - currentAmount,
            interest_rate: interestRate
          });
          
          console.log(`Applied ${(interestRate * 100)}% interest: $${currentAmount} → $${newAmount.toFixed(2)}`);
        }
      }

      return updates;

    } catch (error) {
      console.error('Error applying daily interest:', error);
      return [];
    }
  }

  // Update debt amount (used by interest application and payments)
  async updateDebtAmount(debtId, newAmount) {
    try {
      // Round to 2 decimal places
      const roundedAmount = Math.round(newAmount * 100) / 100;
      
      // If amount is zero or negative, mark debt as paid
      if (roundedAmount <= 0) {
        await notionService.updateDebtStatus(debtId, 'paid');
        await notionService.updateDebtAmount(debtId, 0);
        return { status: 'paid', amount: 0 };
      } else {
        await notionService.updateDebtAmount(debtId, roundedAmount);
        return { status: 'active', amount: roundedAmount };
      }

    } catch (error) {
      console.error('Error updating debt amount:', error);
      throw error;
    }
  }

  // Create new debt for violations
  async createViolationDebt(reason, amount = 50) {
    try {
      const today = format(new Date(), 'yyyy-MM-dd');
      
      const debtData = {
        name: `Violation: ${reason}`,
        amount: amount,
        dateAssigned: today
      };

      console.log(`Creating violation debt: ${debtData.name} - $${amount}`);
      const newDebt = await notionService.createDebt(debtData);
      
      return {
        debt_id: newDebt.id,
        name: debtData.name,
        amount: amount,
        reason: reason,
        date_assigned: today
      };

    } catch (error) {
      console.error('Error creating violation debt:', error);
      throw error;
    }
  }

  // Apply Uber earnings to debt payments (FIFO - oldest first)
  async applyEarningsToDebt(uberEarnings, activeDebts = null) {
    try {
      if (uberEarnings <= 0) {
        return { payments: [], remaining: 0 };
      }

      // Get active debts if not provided
      const debts = activeDebts || await notionService.getActiveDebts();
      
      // Sort debts by date assigned (FIFO - oldest first)
      const sortedDebts = debts.sort((a, b) => {
        const dateA = new Date(a.properties['Date Assigned '].date.start);
        const dateB = new Date(b.properties['Date Assigned '].date.start);
        return dateA - dateB;
      });

      const payments = [];
      let remainingEarnings = uberEarnings;

      for (const debt of sortedDebts) {
        if (remainingEarnings <= 0) break;

        const currentAmount = debt.properties['Current Amount'].number || 0;
        const paymentAmount = Math.min(remainingEarnings, currentAmount);
        const newAmount = currentAmount - paymentAmount;

        // Update debt amount (will handle marking as paid if amount is 0)
        const updateResult = await this.updateDebtAmount(debt.id, newAmount);

        payments.push({
          debt_id: debt.id,
          name: debt.properties.Name.title[0]?.text?.content || 'Unnamed debt',
          payment_amount: paymentAmount,
          remaining_debt: updateResult.amount,
          status: updateResult.status
        });

        remainingEarnings -= paymentAmount;
        console.log(`Applied $${paymentAmount} to debt: ${debt.properties.Name.title[0]?.text?.content}`);
      }

      return {
        payments,
        remaining: remainingEarnings
      };

    } catch (error) {
      console.error('Error applying earnings to debt:', error);
      return { payments: [], remaining: uberEarnings };
    }
  }

  // Get total active debt amount
  async getTotalActiveDebt() {
    try {
      const activeDebts = await notionService.getActiveDebts();
      return activeDebts.reduce((total, debt) => {
        return total + (debt.properties['Current Amount'].number || 0);
      }, 0);
    } catch (error) {
      console.error('Error getting total active debt:', error);
      return 0;
    }
  }

  // Check if user is debt-free
  async isDebtFree() {
    try {
      const totalDebt = await this.getTotalActiveDebt();
      return totalDebt === 0;
    } catch (error) {
      console.error('Error checking debt-free status:', error);
      return false;
    }
  }

  // Get debt summary for reporting
  async getDebtSummary() {
    try {
      const activeDebts = await notionService.getActiveDebts();
      
      if (activeDebts.length === 0) {
        return {
          total_debt: 0,
          debt_count: 0,
          oldest_debt_days: 0,
          highest_debt: 0,
          debt_free: true
        };
      }

      const totalDebt = activeDebts.reduce((sum, debt) => 
        sum + (debt.properties['Current Amount'].number || 0), 0
      );

      const highestDebt = Math.max(...activeDebts.map(debt => 
        debt.properties['Current Amount'].number || 0
      ));

      // Find oldest debt
      const oldestDebt = activeDebts.reduce((oldest, debt) => {
        const debtDate = new Date(debt.properties['Date Assigned '].date.start);
        const oldestDate = new Date(oldest.properties['Date Assigned '].date.start);
        return debtDate < oldestDate ? debt : oldest;
      });

      const oldestDebtDays = differenceInDays(
        new Date(), 
        new Date(oldestDebt.properties['Date Assigned '].date.start)
      );

      return {
        total_debt: Math.round(totalDebt * 100) / 100,
        debt_count: activeDebts.length,
        oldest_debt_days: oldestDebtDays,
        highest_debt: Math.round(highestDebt * 100) / 100,
        debt_free: false
      };

    } catch (error) {
      console.error('Error getting debt summary:', error);
      return {
        total_debt: 0,
        debt_count: 0,
        oldest_debt_days: 0,
        highest_debt: 0,
        debt_free: true
      };
    }
  }

  // Cardio buyout option (2 hours cardio = $50 debt forgiveness)
  async processCardioBuyout(debtId, cardioMinutes) {
    try {
      const BUYOUT_RATE = 50 / 120; // $50 per 120 minutes (2 hours)
      const forgivenesAmount = Math.round(cardioMinutes * BUYOUT_RATE * 100) / 100;

      const debt = await notionService.getDebtById(debtId);
      if (!debt) {
        throw new Error('Debt not found');
      }

      const currentAmount = debt.properties['Current Amount'].number || 0;
      const newAmount = Math.max(0, currentAmount - forgivenesAmount);

      const updateResult = await this.updateDebtAmount(debtId, newAmount);

      return {
        debt_id: debtId,
        cardio_minutes: cardioMinutes,
        forgiveness_amount: forgivenesAmount,
        old_amount: currentAmount,
        new_amount: updateResult.amount,
        status: updateResult.status
      };

    } catch (error) {
      console.error('Error processing cardio buyout:', error);
      throw error;
    }
  }

  // Get debt aging analysis
  async getDebtAging() {
    try {
      const activeDebts = await notionService.getActiveDebts();
      
      const aging = {
        new_debt: [], // 0-3 days
        medium_debt: [], // 4-7 days  
        old_debt: [], // 8+ days
        critical_debt: [] // 14+ days
      };

      for (const debt of activeDebts) {
        const assignedDate = new Date(debt.properties['Date Assigned '].date.start);
        const daysOld = differenceInDays(new Date(), assignedDate);
        const amount = debt.properties['Current Amount'].number || 0;
        
        const debtInfo = {
          id: debt.id,
          name: debt.properties.Name.title[0]?.text?.content || 'Unnamed',
          amount: amount,
          days_old: daysOld,
          assigned_date: debt.properties['Date Assigned '].date.start
        };

        if (daysOld >= 14) {
          aging.critical_debt.push(debtInfo);
        } else if (daysOld >= 8) {
          aging.old_debt.push(debtInfo);
        } else if (daysOld >= 4) {
          aging.medium_debt.push(debtInfo);
        } else {
          aging.new_debt.push(debtInfo);
        }
      }

      return aging;

    } catch (error) {
      console.error('Error getting debt aging:', error);
      return {
        new_debt: [],
        medium_debt: [],
        old_debt: [],
        critical_debt: []
      };
    }
  }
}

module.exports = new DebtService();