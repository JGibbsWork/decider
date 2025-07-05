const debtRepo = require('../../debt/repository/DebtRepository'); // We'll create this

class FinancialBonusCalculator {
  
  async calculateUberMatchBonus(uberEarnings, date) {
    try {
      // Check if user is debt-free
      const activeDebts = await debtRepo.findActiveDebts();
      if (activeDebts.length > 0) {
        console.log('User has active debt, no Uber match bonus');
        return null;
      }

      if (uberEarnings <= 0) {
        return null;
      }

      const weekOf = format(startOfWeek(new Date(date)), 'yyyy-MM-dd');

      return {
        name: `Uber Match Bonus - ${date}`,
        type: 'Uber Match',
        amount: uberEarnings,
        date: date,
        weekOf: weekOf,
        reason: `Matched $${uberEarnings} Uber earnings (debt-free)`
      };

    } catch (error) {
      console.error('Error calculating Uber match bonus:', error);
      return null;
    }
  }

  async calculateWeeklyAllowance(weekStart) {
    try {
      const allowanceAmount = await rulesService.getNumericValue('weekly_base_allowance') || 50;

      return {
        name: `Weekly Allowance - ${weekStart}`,
        type: 'Base Allowance',
        amount: allowanceAmount,
        weekOf: weekStart,
        date: weekStart,
        reason: 'Weekly base allowance'
      };

    } catch (error) {
      console.error('Error calculating weekly allowance:', error);
      return null;
    }
  }
}

module.exports = new FinancialBonusCalculator();