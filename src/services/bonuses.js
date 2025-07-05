const { format, startOfWeek } = require('date-fns');
const notionService = require('./notion');

class BonusService {
  // Check for workout bonuses earned today
  async checkWorkoutBonuses(date) {
    const workouts = await notionService.getTodaysWorkouts(date);
    const bonuses = [];

    for (const workout of workouts) {
      const workoutType = workout.properties['Workout Type'].select?.name;
      const weekOf = format(startOfWeek(new Date(date)), 'yyyy-MM-dd');

      switch (workoutType) {
        case 'Lifting':
          bonuses.push({
            type: 'Lifting',
            amount: 10,
            name: `Lifting Session - ${date}`,
            weekOf: weekOf,
            reason: 'Completed lifting workout'
          });
          break;
        
        case 'Yoga':
          // Check if this is extra yoga (beyond 3/week baseline)
          // For now, we'll award for all yoga and let weekly reconciliation handle baseline
          bonuses.push({
            type: 'Yoga',
            amount: 5,
            name: `Yoga Session - ${date}`,
            weekOf: weekOf,
            reason: 'Completed yoga session'
          });
          break;
        
        // Cardio doesn't earn bonuses unless it's punishment completion
        case 'Cardio':
          // Check if this was completing a punishment assignment
          // This would require cross-referencing with punishments database
          break;
      }
    }

    return bonuses;
  }

  // Create Uber earnings match bonus (if debt-free)
  async createUberMatchBonus(uberEarnings, date) {
    const weekOf = format(startOfWeek(new Date(date)), 'yyyy-MM-dd');
    
    return {
      type: 'Uber Match',
      amount: uberEarnings,
      name: `Uber Earnings Match - ${date}`,
      weekOf: weekOf,
      reason: `Earned $${uberEarnings} in Uber deliveries`
    };
  }

  // Create base weekly allowance bonus
  async createWeeklyAllowance(date) {
    const weekOf = format(startOfWeek(new Date(date)), 'yyyy-MM-dd');
    
    return {
      type: 'Base Allowance',
      amount: 50,
      name: `Weekly Allowance - Week of ${weekOf}`,
      weekOf: weekOf,
      reason: 'Weekly base allowance'
    };
  }

  // Create discretionary "good boy" bonus
  async createGoodBoyBonus(amount, reason, date) {
    const weekOf = format(startOfWeek(new Date(date)), 'yyyy-MM-dd');
    
    return {
      type: 'Good Boy',
      amount: amount,
      name: `Good Boy Bonus - ${date}`,
      weekOf: weekOf,
      reason: reason
    };
  }

  // Award bonuses by creating entries in Notion
  async awardBonuses(bonuses) {
    const awarded = [];

    for (const bonus of bonuses) {
      try {
        const createdBonus = await notionService.createBonus(bonus);
        awarded.push({
          bonus_id: createdBonus.id,
          type: bonus.type,
          amount: bonus.amount,
          reason: bonus.reason
        });
      } catch (error) {
        console.error('Error creating bonus:', error);
        // Continue with other bonuses even if one fails
      }
    }

    return awarded;
  }

  // Calculate total bonuses for today
  getTotalBonusAmount(bonuses) {
    return bonuses.reduce((total, bonus) => total + bonus.amount, 0);
  }

  // Check for weekly performance bonuses (end of week)
  async checkWeeklyBonuses(weekStart) {
    // This would check for:
    // - Perfect Week (3 yoga + 3 lifting): $50
    // - Job Applications (25+): $50  
    // - AlgoExpert (7 problems): $25
    // - Reading (finished book): $25
    // - Dating (actual date): $30
    
    // For now, returning empty array - this would need additional data sources
    // like job applications database, AlgoExpert tracking, etc.
    return [];
  }
}

module.exports = new BonusService();