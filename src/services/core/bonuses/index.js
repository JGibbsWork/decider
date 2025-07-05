const bonusRepo = require('./repository/BonusRepository');
const workoutBonusCalculator = require('./services/WorkoutBonusCalculator');
const financialBonusCalculator = require('./services/FinancialBonusCalculator');

class BonusService {
  
  // Daily bonus processing
  async processDailyBonuses(date, uberEarnings = 0) {
    try {
      const allBonuses = [];
      
      // Calculate workout bonuses
      const workoutBonuses = await workoutBonusCalculator.calculateDailyWorkoutBonuses(date);
      allBonuses.push(...workoutBonuses);

      // Calculate Uber match bonus (if debt-free)
      if (uberEarnings > 0) {
        const uberMatchBonus = await financialBonusCalculator.calculateUberMatchBonus(uberEarnings, date);
        if (uberMatchBonus) {
          allBonuses.push(uberMatchBonus);
        }
      }

      // Create bonuses in Notion
      if (allBonuses.length > 0) {
        const createdBonuses = await bonusRepo.createMany(allBonuses);
        
        // Mark as awarded
        for (const bonus of createdBonuses) {
          bonus.award();
          await bonusRepo.updateStatus(bonus.id, 'awarded');
        }

        const totalAmount = createdBonuses.reduce((sum, bonus) => sum + bonus.amount, 0);
        console.log(`Awarded ${createdBonuses.length} bonuses totaling $${totalAmount}`);
        
        return {
          bonuses: createdBonuses,
          total_amount: totalAmount
        };
      }

      return {
        bonuses: [],
        total_amount: 0
      };

    } catch (error) {
      console.error('Error processing daily bonuses:', error);
      return { bonuses: [], total_amount: 0 };
    }
  }

  // Weekly bonus processing
  async processWeeklyBonuses(weekStart, workoutPerformance) {
    try {
      const allBonuses = [];

      // Calculate weekly allowance
      const allowance = await financialBonusCalculator.calculateWeeklyAllowance(weekStart);
      if (allowance) {
        allBonuses.push(allowance);
      }

      // Calculate workout-based weekly bonuses
      const workoutBonuses = await workoutBonusCalculator.calculateWeeklyWorkoutBonuses(weekStart, workoutPerformance);
      allBonuses.push(...workoutBonuses);

      // Create and award bonuses
      if (allBonuses.length > 0) {
        const createdBonuses = await bonusRepo.createMany(allBonuses);
        return createdBonuses;
      }

      return [];

    } catch (error) {
      console.error('Error processing weekly bonuses:', error);
      return [];
    }
  }

  // Backward compatibility methods
  async checkWorkoutBonuses(date) {
    const result = await this.processDailyBonuses(date);
    return result.bonuses.filter(bonus => bonus.isWorkoutBonus());
  }

  async createUberMatchBonus(earnings, date) {
    return await financialBonusCalculator.calculateUberMatchBonus(earnings, date);
  }

  async awardBonuses(bonusDataArray) {
    return await bonusRepo.createMany(bonusDataArray);
  }
}

module.exports = new BonusService();