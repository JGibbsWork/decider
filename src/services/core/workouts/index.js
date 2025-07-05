const workoutRepo = require('./repository/WorkoutRepository');
const workoutAnalyzer = require('./services/WorkoutAnalyzer');

class WorkoutService {

  // Daily workout queries
  async getTodaysWorkouts(date) {
    return await workoutRepo.findByDate(date);
  }

  async getWorkoutsForWeek(weekStart, weekEnd) {
    return await workoutRepo.findByDateRange(weekStart, weekEnd);
  }

  async getRecentWorkouts(days = 7) {
    return await workoutRepo.findRecentWorkouts(days);
  }

  // Analysis methods
  async analyzeWeeklyPerformance(weekStart, weekEnd) {
    return await workoutAnalyzer.analyzeWeeklyPerformance(weekStart, weekEnd);
  }

  async getCurrentWorkoutStreak(date = null) {
    return await workoutAnalyzer.analyzeStreaks(date);
  }

  async getWorkoutFrequency(days = 30) {
    return await workoutAnalyzer.getWorkoutFrequency(days);
  }

  async getWorkoutTrends(weeks = 4) {
    return await workoutAnalyzer.getWorkoutTrends(weeks);
  }

  // Workout creation (for manual entries)
  async logWorkout(workoutData) {
    return await workoutRepo.create(workoutData);
  }

  // Business logic methods
  async checkWorkoutRequirements(date, requirements) {
    const workouts = await this.getTodaysWorkouts(date);
    
    const results = {
      date: date,
      requirements_met: true,
      missing_requirements: [],
      completed_workouts: workouts
    };

    // Check minimum requirements
    if (requirements.yoga_minimum) {
      const yogaCount = workouts.filter(w => w.isYoga()).length;
      if (yogaCount < requirements.yoga_minimum) {
        results.requirements_met = false;
        results.missing_requirements.push(`Yoga: ${yogaCount}/${requirements.yoga_minimum}`);
      }
    }

    if (requirements.lifting_minimum) {
      const liftingCount = workouts.filter(w => w.isLifting()).length;
      if (liftingCount < requirements.lifting_minimum) {
        results.requirements_met = false;
        results.missing_requirements.push(`Lifting: ${liftingCount}/${requirements.lifting_minimum}`);
      }
    }

    return results;
  }

  async getWorkoutsEligibleForBonus(date) {
    const workouts = await this.getTodaysWorkouts(date);
    return workouts.filter(workout => workout.isValidForBonus());
  }

  // Streak-specific methods for upcoming streak bonuses feature
  async getStreakMilestones(date = null) {
    const streak = await this.getCurrentWorkoutStreak(date);
    const milestones = [3, 5, 7, 10, 14, 21, 28];
    
    const nextMilestone = milestones.find(m => m > streak.current_streak);
    
    return {
      current_streak: streak.current_streak,
      next_milestone: nextMilestone,
      days_to_milestone: nextMilestone ? nextMilestone - streak.current_streak : null,
      recently_achieved: milestones.includes(streak.current_streak)
    };
  }
}

module.exports = new WorkoutService();