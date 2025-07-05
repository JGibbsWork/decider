const { format, startOfWeek, endOfWeek, subDays } = require('date-fns');
const workoutRepo = require('../repository/WorkoutRepository');

class WorkoutAnalyzer {

  async analyzeWeeklyPerformance(weekStart, weekEnd) {
    try {
      const workouts = await workoutRepo.findByDateRange(weekStart, weekEnd);
      
      const performance = {
        week_start: weekStart,
        week_end: weekEnd,
        yoga_sessions: 0,
        lifting_sessions: 0,
        cardio_sessions: 0,
        total_sessions: workouts.length,
        total_duration: 0,
        total_calories: 0,
        workouts: workouts
      };

      // Analyze each workout
      for (const workout of workouts) {
        if (workout.isYoga()) {
          performance.yoga_sessions++;
        } else if (workout.isLifting()) {
          performance.lifting_sessions++;
        } else if (workout.isCardio()) {
          performance.cardio_sessions++;
        }

        performance.total_duration += workout.getDurationInMinutes();
        performance.total_calories += workout.calories || 0;
      }

      // Calculate averages
      performance.average_duration = performance.total_sessions > 0 
        ? Math.round(performance.total_duration / performance.total_sessions) 
        : 0;

      return performance;

    } catch (error) {
      console.error('Error analyzing weekly workout performance:', error);
      return {
        week_start: weekStart,
        week_end: weekEnd,
        yoga_sessions: 0,
        lifting_sessions: 0,
        cardio_sessions: 0,
        total_sessions: 0,
        workouts: []
      };
    }
  }

  async analyzeStreaks(date = null) {
    try {
      const endDate = date || format(new Date(), 'yyyy-MM-dd');
      let currentStreak = 0;
      let checkDate = endDate;

      // Look backwards to find current streak
      while (currentStreak < 30) { // Safety limit
        const workouts = await workoutRepo.findByDate(checkDate);
        
        if (workouts.length === 0) {
          break; // Streak broken
        }

        currentStreak++;
        const previousDay = subDays(new Date(checkDate), 1);
        checkDate = format(previousDay, 'yyyy-MM-dd');
      }

      return {
        current_streak: currentStreak,
        streak_end_date: endDate,
        streak_start_date: currentStreak > 0 
          ? format(subDays(new Date(endDate), currentStreak - 1), 'yyyy-MM-dd')
          : null
      };

    } catch (error) {
      console.error('Error analyzing workout streaks:', error);
      return { current_streak: 0, streak_end_date: date, streak_start_date: null };
    }
  }

  async getWorkoutFrequency(days = 30) {
    try {
      const endDate = new Date();
      const startDate = subDays(endDate, days);
      
      const workouts = await workoutRepo.findByDateRange(
        format(startDate, 'yyyy-MM-dd'),
        format(endDate, 'yyyy-MM-dd')
      );

      const frequency = {
        total_workouts: workouts.length,
        workouts_per_week: (workouts.length / days) * 7,
        by_type: {
          yoga: workouts.filter(w => w.isYoga()).length,
          lifting: workouts.filter(w => w.isLifting()).length,
          cardio: workouts.filter(w => w.isCardio()).length
        }
      };

      return frequency;

    } catch (error) {
      console.error('Error calculating workout frequency:', error);
      return null;
    }
  }

  async getWorkoutTrends(weeks = 4) {
    try {
      const trends = [];
      const endDate = new Date();

      for (let i = 0; i < weeks; i++) {
        const weekEnd = subDays(endDate, i * 7);
        const weekStart = subDays(weekEnd, 6);
        
        const performance = await this.analyzeWeeklyPerformance(
          format(weekStart, 'yyyy-MM-dd'),
          format(weekEnd, 'yyyy-MM-dd')
        );

        trends.unshift({
          week: i + 1,
          start_date: format(weekStart, 'yyyy-MM-dd'),
          end_date: format(weekEnd, 'yyyy-MM-dd'),
          total_sessions: performance.total_sessions,
          yoga: performance.yoga_sessions,
          lifting: performance.lifting_sessions,
          cardio: performance.cardio_sessions
        });
      }

      return {
        trends,
        summary: {
          improving: this.isWorkoutTrendImproving(trends),
          average_per_week: trends.reduce((sum, week) => sum + week.total_sessions, 0) / weeks
        }
      };

    } catch (error) {
      console.error('Error getting workout trends:', error);
      return null;
    }
  }

  isWorkoutTrendImproving(trends) {
    if (trends.length < 2) return false;
    
    const recent = trends.slice(-2);
    return recent[1].total_sessions > recent[0].total_sessions;
  }
}

module.exports = new WorkoutAnalyzer();