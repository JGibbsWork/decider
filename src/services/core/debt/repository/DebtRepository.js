const notionService = require('../../../integrations/notion');
const Debt = require('../models/Debt');

class DebtRepository {
  
  // Find all active debts
  async findActiveDebts() {
    try {
      const activeDebts = await notionService.getActiveDebts();
      return activeDebts.map(debtPage => new Debt(debtPage));
    } catch (error) {
      console.error('Error finding active debts:', error);
      return [];
    }
  }

  // Find debt by ID
  async findById(debtId) {
    try {
      const debt = await notionService.getDebtById(debtId);
      return debt ? new Debt(debt) : null;
    } catch (error) {
      console.error('Error finding debt by ID:', error);
      return null;
    }
  }

  // Create new debt
  async create(debtData) {
    try {
      const newDebt = await notionService.createDebt(debtData);
      return new Debt(newDebt);
    } catch (error) {
      console.error('Error creating debt:', error);
      throw error;
    }
  }

  // Update debt amount
  async updateAmount(debtId, newAmount) {
    try {
      await notionService.updateDebtAmount(debtId, newAmount);
      
      // If amount is zero or less, mark as paid
      if (newAmount <= 0) {
        await notionService.updateDebtStatus(debtId, 'paid');
      }
      
      return true;
    } catch (error) {
      console.error('Error updating debt amount:', error);
      throw error;
    }
  }

  // Update debt status
  async updateStatus(debtId, status) {
    try {
      await notionService.updateDebtStatus(debtId, status);
      return true;
    } catch (error) {
      console.error('Error updating debt status:', error);
      throw error;
    }
  }

  // Find debts created within a date range
  async findByDateRange(startDate, endDate) {
    try {
      const debts = await notionService.getDebtsForPeriod(startDate, endDate);
      return debts.map(debtPage => new Debt(debtPage));
    } catch (error) {
      console.error('Error finding debts by date range:', error);
      return [];
    }
  }

  // Find overdue debts (missed payments that should have interest applied)
  async findOverdue(currentDate) {
    try {
      const activeDebts = await this.findActiveDebts();
      
      return activeDebts.filter(debt => {
        // Debt is overdue if it's been active for more than 1 day
        return debt.daysOutstanding >= 1 && debt.isActive;
      });
    } catch (error) {
      console.error('Error finding overdue debts:', error);
      return [];
    }
  }

  // Get debt statistics
  async getStatistics() {
    try {
      const activeDebts = await this.findActiveDebts();
      
      if (activeDebts.length === 0) {
        return {
          total_debt: 0,
          debt_count: 0,
          average_debt: 0,
          oldest_debt_days: 0,
          newest_debt_days: 0
        };
      }

      const totalDebt = activeDebts.reduce((sum, debt) => sum + debt.currentAmount, 0);
      const averageDebt = totalDebt / activeDebts.length;
      const oldestDebtDays = Math.max(...activeDebts.map(debt => debt.daysOutstanding));
      const newestDebtDays = Math.min(...activeDebts.map(debt => debt.daysOutstanding));

      return {
        total_debt: Math.round(totalDebt * 100) / 100,
        debt_count: activeDebts.length,
        average_debt: Math.round(averageDebt * 100) / 100,
        oldest_debt_days: oldestDebtDays,
        newest_debt_days: newestDebtDays
      };
    } catch (error) {
      console.error('Error getting debt statistics:', error);
      return {
        total_debt: 0,
        debt_count: 0,
        average_debt: 0,
        oldest_debt_days: 0,
        newest_debt_days: 0
      };
    }
  }

  // Check if user is debt-free
  async isDebtFree() {
    try {
      const activeDebts = await this.findActiveDebts();
      return activeDebts.length === 0;
    } catch (error) {
      console.error('Error checking debt-free status:', error);
      return false;
    }
  }

  // Get total debt amount
  async getTotalDebt() {
    try {
      const activeDebts = await this.findActiveDebts();
      return activeDebts.reduce((sum, debt) => sum + debt.currentAmount, 0);
    } catch (error) {
      console.error('Error getting total debt:', error);
      return 0;
    }
  }
}

module.exports = new DebtRepository();