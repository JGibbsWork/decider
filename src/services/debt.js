const { differenceInDays, format } = require('date-fns');
const notionService = require('./notion');

class DebtService {
  // Apply daily interest to all active debts
  async applyDailyInterest() {
    const activeDebts = await notionService.getActiveDebts();
    const updates = [];

    for (const debt of activeDebts) {
      const currentAmount = debt.properties['Current Amount'].number;
      const dateAssigned = debt.properties['Date Assigned '].date.start;
      const interestRate = debt.properties['Interest Rate'].number || 0.30;
      
      // Calculate days since assigned (for interest calculation)
      const daysSinceAssigned = differenceInDays(new Date(), new Date(dateAssigned));
      
      // Apply compound interest: amount * (1 + rate)^days
      const newAmount = Math.round(currentAmount * (1 + interestRate) * 100) / 100;
      
      if (newAmount !== currentAmount) {
        await notionService.updateDebtAmount(debt.id, newAmount);
        updates.push({
          debt_id: debt.id,
          name: debt.properties.Name.title[0]?.text?.content || 'Unnamed debt',
          old_amount: currentAmount,
          new_amount: newAmount,
          reason: 'daily_interest',
          days_outstanding: daysSinceAssigned
        });
      }
    }

    return updates;
  }

  // Process Uber earnings against debts (FIFO)
  async processUberEarnings(uberEarnings) {
    if (uberEarnings <= 0) return { payments: [], remaining: 0 };

    const activeDebts = await notionService.getActiveDebts();
    
    // Sort debts by date assigned (FIFO - oldest first)
    const sortedDebts = activeDebts.sort((a, b) => {
      const dateA = new Date(a.properties['Date Assigned '].date.start);
      const dateB = new Date(b.properties['Date Assigned '].date.start);
      return dateA - dateB;
    });

    const payments = [];
    let remainingEarnings = uberEarnings;

    for (const debt of sortedDebts) {
      if (remainingEarnings <= 0) break;

      const currentAmount = debt.properties['Current Amount'].number;
      const paymentAmount = Math.min(remainingEarnings, currentAmount);
      const newAmount = currentAmount - paymentAmount;

      // Update debt amount or mark as paid
      if (newAmount <= 0) {
        await notionService.updateDebtStatus(debt.id, 'paid');
      } else {
        await notionService.updateDebtAmount(debt.id, newAmount);
      }

      payments.push({
        debt_id: debt.id,
        name: debt.properties.Name.title[0]?.text?.content || 'Unnamed debt',
        payment_amount: paymentAmount,
        remaining_debt: Math.max(0, newAmount)
      });

      remainingEarnings -= paymentAmount;
    }

    return {
      payments,
      remaining: remainingEarnings
    };
  }

  // Create new debt for violations
  async createViolationDebt(reason, amount = 50) {
    const today = format(new Date(), 'yyyy-MM-dd');
    
    const debtData = {
      name: `Violation: ${reason}`,
      amount: amount,
      dateAssigned: today
    };

    const newDebt = await notionService.createDebt(debtData);
    
    return {
      debt_id: newDebt.id,
      name: debtData.name,
      amount: amount,
      reason: reason
    };
  }

  // Get total active debt amount
  async getTotalActiveDebt() {
    const activeDebts = await notionService.getActiveDebts();
    return activeDebts.reduce((total, debt) => {
      return total + (debt.properties['Current Amount'].number || 0);
    }, 0);
  }

  // Check if user is debt-free
  async isDebtFree() {
    const totalDebt = await this.getTotalActiveDebt();
    return totalDebt === 0;
  }
}

module.exports = new DebtService();