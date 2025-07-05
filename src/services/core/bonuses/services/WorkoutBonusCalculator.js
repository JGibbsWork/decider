const { format, startOfWeek } = require('date-fns');
const rulesService = require('../../rules');
const workoutRepo = require('../../workouts/repository/WorkoutRepository'); // We'll create this

class WorkoutBonusCalculator {
  
  async calculateDailyWorkoutBonuses(date) {
    try {
      const bonuses = [];
      const weekOf = format(startOfWeek(new Date(date)), 'yyyy-MM-dd');
      
      // Get workouts for the date
      const workouts = await workoutRepo.findByDate(date);
      
      // Get per occurrence bonus rules
      const perOccurrenceRules = await rulesService.getPerOccurrenceRules();
      
      for (const workout of workouts) {
        const workoutType = workout.type;

        switch (workoutType) {
          case 'Lifting':
            if (perOccurrenceRules['lifting_bonus_amount']) {
              const amount = await rulesService.getNumericValue('lifting_bonus_amount');
              bonuses.push({
                name: `Lifting Session - ${date}`,
                type: 'Lifting',
                amount: amount,
                date: date,
                weekOf: weekOf,
                reason: 'Completed lifting workout'
              });
            }
            break;
        
          case 'Yoga':
            if (perOccurrenceRules['extra_yoga_bonus_amount']) {
              const amount = await rulesService.getNumericValue('extra_yoga_bonus_amount');
              bonuses.push({
                name: `Yoga Session - ${date}`,
                type: 'Yoga',
                amount: amount,
                date: date,
                weekOf: weekOf,
                reason: 'Completed yoga session'
              });
            }
            break;
            
          case 'Cardio':
            // Cardio doesn't typically earn bonuses unless it's punishment completion
            break;
        }
      }

      return bonuses;

    } catch (error) {
      console.error('Error calculating workout bonuses:', error);
      return [];
    }
  }

  async calculateWeeklyWorkoutBonuses(weekStart, workoutPerformance) {
    try {
      const bonuses = [];
      const weeklyRules = await rulesService.getWeeklyRules();

      // Perfect Week bonus (3 yoga + 3 lifting)
      if (weeklyRules['perfect_week_bonus']) {
        const yogaMinimum = await rulesService.getNumericValue('weekly_yoga_minimum') || 3;
        const liftingMinimum = 3; // Could be configurable
        
        if (workoutPerformance.yoga_sessions >= yogaMinimum && 
            workoutPerformance.lifting_sessions >= liftingMinimum) {
          const bonusAmount = await rulesService.getNumericValue('perfect_week_bonus');
          bonuses.push({
            name: `Perfect Week Bonus - ${weekStart}`,
            type: 'Perfect Week',
            amount: bonusAmount,
            weekOf: weekStart,
            date: weekStart,
            reason: `Completed ${workoutPerformance.yoga_sessions} yoga + ${workoutPerformance.lifting_sessions} lifting sessions`
          });
        }
      }

      return bonuses;

    } catch (error) {
      console.error('Error calculating weekly workout bonuses:', error);
      return [];
    }
  }
}

module.exports = new WorkoutBonusCalculator();