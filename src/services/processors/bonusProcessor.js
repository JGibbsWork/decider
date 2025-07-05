// Create new file: src/services/processors/bonusProcessor.js

const { format } = require('date-fns');
const bonusService = require('../bonuses');

class BonusProcessor {

  // Check for daily workout bonuses (per occurrence rules)
  async processWorkoutBonuses(date) {
    try {
      console.log(`Checking workout bonuses for ${date}...`);
      
      const workoutBonuses = await bonusService.checkWorkoutBonuses(date);
      
      if (workoutBonuses.length > 0) {
        const totalAmount = workoutBonuses.reduce((sum, bonus) => sum + bonus.amount, 0);
        console.log(`Found ${workoutBonuses.length} workout bonus(es) totaling $${totalAmount}`);
      } else {
        console.log('No workout bonuses earned today');
      }

      return workoutBonuses;

    } catch (error) {
      console.error('Error processing workout bonuses:', error);
      return [];
    }
  }

  // Process all daily bonuses for a date
  async processAllDailyBonuses(date, uberEarnings = 0) {
    try {
      console.log(`Processing all daily bonuses for ${date}...`);
      
      const allBonuses = [];
      
      // Workout bonuses (per occurrence)
      const workoutBonuses = await this.processWorkoutBonuses(date);
      allBonuses.push(...workoutBonuses);

      // Uber match bonus (if debt-free and has earnings)
      if (uberEarnings > 0) {
        const uberMatchBonus = await bonusService.createUberMatchBonus(uberEarnings, date);
        if (uberMatchBonus) {
          allBonuses.push(uberMatchBonus);
          console.log(`Created Uber match bonus: $${uberEarnings}`);
        }
      }

      // Award all bonuses in Notion
      if (allBonuses.length > 0) {
        const awardedBonuses = await bonusService.awardBonuses(allBonuses);
        const totalAmount = awardedBonuses.reduce((sum, bonus) => sum + bonus.amount, 0);
        
        console.log(`Awarded ${awardedBonuses.length} bonuses totaling $${totalAmount}`);
        return {
          bonuses: awardedBonuses,
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

  // Get bonus summary for a date
  async getBonusSummary(date = null) {
    try {
      const targetDate = date || format(new Date(), 'yyyy-MM-dd');
      
      // This would need to be implemented in bonusService
      // For now, return a basic structure
      const summary = {
        date: targetDate,
        daily_bonuses_earned: 0,
        total_amount_today: 0,
        workout_bonuses: 0,
        uber_match_bonuses: 0,
        other_bonuses: 0
      };

      // Could add logic here to query bonuses from Notion for the date
      // and categorize them by type

      return summary;

    } catch (error) {
      console.error('Error getting bonus summary:', error);
      return null;
    }
  }

  // Check eligibility for specific bonus types
  async checkBonusEligibility(date) {
    try {
      const eligibility = {
        date: date,
        workout_bonuses_available: false,
        uber_match_available: false,
        debt_free: false
      };

      // Check if workouts exist (makes workout bonuses available)
      const workoutBonuses = await this.processWorkoutBonuses(date);
      eligibility.workout_bonuses_available = workoutBonuses.length > 0;

      // Check debt status for Uber match eligibility
      // This would need to be implemented by checking active debts
      // For now, assume debt-free status needs to be checked elsewhere

      return eligibility;

    } catch (error) {
      console.error('Error checking bonus eligibility:', error);
      return null;
    }
  }

}

module.exports = new BonusProcessor();