const stravaService = require('../../../integrations/strava');
const Workout = require('../models/Workout');

class WorkoutRepository {
  constructor() {
    // No database ID needed for Strava
  }

  async findByDate(date) {
    if (!stravaService.isConfigured()) {
      return [];
    }
    
    try {
      const activities = await stravaService.getActivitiesForDate(date);
      return activities.map(activity => new Workout(activity));
    } catch (error) {
      console.error(`Failed to fetch workouts for ${date}:`, error.message);
      return [];
    }
  }

  async findByDateRange(startDate, endDate) {
    if (!stravaService.isConfigured()) {
      return [];
    }
    
    try {
      const activities = await stravaService.getActivitiesInDateRange(startDate, endDate);
      return activities.map(activity => new Workout(activity));
    } catch (error) {
      console.error(`Failed to fetch workouts for range ${startDate} to ${endDate}:`, error.message);
      return [];
    }
  }

  async findByTypeAndDateRange(workoutType, startDate, endDate) {
    if (!stravaService.isConfigured()) {
      return [];
    }
    
    try {
      const activities = await stravaService.getActivitiesInDateRange(startDate, endDate);
      
      // Filter by workout type
      const filteredActivities = activities.filter(activity => {
        const activityWorkout = new Workout(activity);
        return activityWorkout.type === workoutType;
      });
      
      return filteredActivities.map(activity => new Workout(activity));
    } catch (error) {
      console.error(`Failed to fetch ${workoutType} workouts for range ${startDate} to ${endDate}:`, error.message);
      return [];
    }
  }

  async findRecentWorkouts(days = 7) {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    return await this.findByDateRange(
      startDate.toISOString().split('T')[0],
      endDate.toISOString().split('T')[0]
    );
  }

  async create(workoutData) {
    // Strava doesn't support creating activities via API for most activity types
    // This would require manual entry in Strava app
    console.warn('Creating workouts directly via Strava API is not supported for most activity types');
    console.warn('Please log workout manually in Strava app');
    
    // Return a mock workout object for compatibility
    return new Workout({
      id: `manual_${Date.now()}`,
      date: workoutData.date,
      type: workoutData.type,
      duration: workoutData.duration,
      calories: workoutData.calories,
      source: 'Manual',
      notes: workoutData.notes || 'Manually logged workout'
    });
  }

  // Legacy methods for compatibility - no longer needed since we use Workout constructor directly
}

module.exports = new WorkoutRepository();