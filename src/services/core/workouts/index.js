const workoutRepo = require('./repository/WorkoutRepository');
const workoutAnalyzer = require('./services/WorkoutAnalyzer');
const stravaService = require('../../integrations/strava');
const notionService = require('../../integrations/notion');

class WorkoutService {

  // Daily workout queries with Strava → Notion sync
  async getTodaysWorkouts(date) {
    try {
      // Get workouts from both sources
      const [stravaWorkouts, notionWorkouts] = await Promise.all([
        this.getStravaWorkouts(date),
        this.getNotionWorkouts(date)
      ]);

      // Sync Strava workouts to Notion
      const syncedWorkouts = await this.syncStravaToNotion(stravaWorkouts, notionWorkouts, date);

      // Return combined results (Notion workouts + newly synced)
      return [...notionWorkouts, ...syncedWorkouts];
    } catch (error) {
      console.error(`Error getting today's workouts for ${date}:`, error);
      // Fallback to Strava-only
      return await workoutRepo.findByDate(date);
    }
  }

  // Get Strava workouts for a date
  async getStravaWorkouts(date) {
    if (!stravaService.isConfigured()) {
      return [];
    }
    try {
      return await stravaService.getActivitiesForDate(date);
    } catch (error) {
      console.error(`Failed to fetch Strava workouts for ${date}:`, error);
      return [];
    }
  }

  // Get Notion workouts for a date  
  async getNotionWorkouts(date) {
    try {
      const notionResults = await notionService.getTodaysWorkouts(date);
      // Convert Notion format to workout format
      return notionResults.map(page => ({
        id: `notion_${page.id}`,
        date: page.properties.Date?.date?.start || date,
        type: page.properties['Workout Type']?.select?.name || 'Other',
        duration: page.properties.Duration?.number || 0,
        calories: page.properties.Calories?.number || null,
        source: page.properties.Source?.select?.name || 'Notion',
        stravaId: page.properties['Strava ID']?.rich_text?.[0]?.text?.content || '',
        notes: '', // Notes field doesn't exist in Notion schema
        name: page.properties.Name?.title?.[0]?.text?.content || 'Workout'
      }));
    } catch (error) {
      console.error(`Failed to fetch Notion workouts for ${date}:`, error);
      return [];
    }
  }

  // Sync Strava workouts to Notion (avoid duplicates)
  async syncStravaToNotion(stravaWorkouts, notionWorkouts, date) {
    const syncedWorkouts = [];
    
    for (const stravaWorkout of stravaWorkouts) {
      // Check if this Strava workout already exists in Notion
      // Best match: Strava ID, fallback to duration + source/name matching
      const existsInNotion = notionWorkouts.some(notionWorkout => 
        (notionWorkout.stravaId && notionWorkout.stravaId === stravaWorkout.id) ||
        (notionWorkout.duration === stravaWorkout.duration &&
         (notionWorkout.source === 'Strava' || notionWorkout.name.includes(stravaWorkout.notes?.substring(0, 20) || '')))
      );

      if (!existsInNotion) {
        try {
          console.log(`Syncing Strava workout to Notion: ${stravaWorkout.notes}`);
          await notionService.createWorkout({
            name: stravaWorkout.notes || `${stravaWorkout.type} Workout`,
            date: date,
            type: stravaWorkout.type,
            duration: stravaWorkout.duration,
            calories: stravaWorkout.calories,
            source: 'Strava',
            stravaId: stravaWorkout.id,
            notes: stravaWorkout.notes || ''
          });
          syncedWorkouts.push(stravaWorkout);
        } catch (error) {
          console.error('Failed to sync workout to Notion:', error);
          // Continue with other workouts
        }
      }
    }

    console.log(`Synced ${syncedWorkouts.length} new workouts to Notion`);
    return syncedWorkouts;
  }

  // Weekly workout queries with Strava → Notion sync
  async getWorkoutsForWeek(weekStart, weekEnd) {
    try {
      console.log(`🔍 Getting workouts for week ${weekStart} to ${weekEnd}`);
      
      // Get workouts from both sources for the date range
      const [stravaWorkouts, notionWorkouts] = await Promise.all([
        this.getStravaWorkoutsForRange(weekStart, weekEnd),
        this.getNotionWorkoutsForRange(weekStart, weekEnd)
      ]);

      console.log(`📊 Found ${stravaWorkouts.length} Strava workouts, ${notionWorkouts.length} Notion workouts`);

      // Sync missing Strava workouts to Notion
      const syncedWorkouts = await this.syncStravaRangeToNotion(stravaWorkouts, notionWorkouts, weekStart, weekEnd);

      // Return combined results sorted by date
      const allWorkouts = [...notionWorkouts, ...syncedWorkouts];
      console.log(`✅ Returning ${allWorkouts.length} total workouts`);
      return allWorkouts.sort((a, b) => new Date(a.date) - new Date(b.date));
    } catch (error) {
      console.error(`❌ Error getting workouts for week ${weekStart} to ${weekEnd}:`, error);
      // Fallback to Strava-only
      return await workoutRepo.findByDateRange(weekStart, weekEnd);
    }
  }

  // Get Strava workouts for a date range
  async getStravaWorkoutsForRange(startDate, endDate) {
    if (!stravaService.isConfigured()) {
      return [];
    }
    try {
      return await stravaService.getActivitiesInDateRange(startDate, endDate);
    } catch (error) {
      console.error(`Failed to fetch Strava workouts for ${startDate} to ${endDate}:`, error);
      return [];
    }
  }

  // Get Notion workouts for a date range
  async getNotionWorkoutsForRange(startDate, endDate) {
    try {
      const notionResults = await notionService.getWorkoutsForDateRange(startDate, endDate);
      // Convert Notion format to workout format  
      return notionResults.map(page => ({
        id: `notion_${page.id}`,
        date: page.properties.Date?.date?.start || startDate,
        type: page.properties['Workout Type']?.select?.name || 'Other',
        duration: page.properties.Duration?.number || 0,
        calories: page.properties.Calories?.number || null,
        source: page.properties.Source?.select?.name || 'Notion',
        stravaId: page.properties['Strava ID']?.rich_text?.[0]?.text?.content || '',
        notes: '', // Notes field doesn't exist in Notion schema
        name: page.properties.Name?.title?.[0]?.text?.content || 'Workout'
      }));
    } catch (error) {
      console.error(`Failed to fetch Notion workouts for ${startDate} to ${endDate}:`, error);
      return [];
    }
  }

  // Sync Strava workouts to Notion for date range (avoid duplicates)
  async syncStravaRangeToNotion(stravaWorkouts, notionWorkouts, startDate, endDate) {
    const syncedWorkouts = [];
    
    for (const stravaWorkout of stravaWorkouts) {
      // Check if this Strava workout already exists in Notion
      // Best match: Strava ID, fallback to date + duration + source/name matching
      const existsInNotion = notionWorkouts.some(notionWorkout => 
        (notionWorkout.stravaId && notionWorkout.stravaId === stravaWorkout.id) ||
        (notionWorkout.date === stravaWorkout.date &&
         notionWorkout.duration === stravaWorkout.duration &&
         (notionWorkout.source === 'Strava' || notionWorkout.name.includes(stravaWorkout.notes?.substring(0, 20) || '')))
      );

      if (!existsInNotion) {
        try {
          console.log(`Syncing Strava workout to Notion: ${stravaWorkout.date} - ${stravaWorkout.notes}`);
          await notionService.createWorkout({
            name: stravaWorkout.notes || `${stravaWorkout.type} Workout`,
            date: stravaWorkout.date,
            type: stravaWorkout.type,
            duration: stravaWorkout.duration,
            calories: stravaWorkout.calories,
            source: 'Strava',
            stravaId: stravaWorkout.id,
            notes: stravaWorkout.notes || ''
          });
          syncedWorkouts.push(stravaWorkout);
        } catch (error) {
          console.error('Failed to sync workout to Notion:', error);
          // Continue with other workouts
        }
      }
    }

    console.log(`Synced ${syncedWorkouts.length} new workouts to Notion for week ${startDate} to ${endDate}`);
    return syncedWorkouts;
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

  // Streak-specific methods for potential future features
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

  // Strava specific methods
  async getStravaStatus() {
    if (!stravaService.isConfigured()) {
      return { configured: false, connected: false };
    }
    
    const testResult = await stravaService.testConnection();
    return {
      configured: true,
      ...testResult
    };
  }

  async getTodaysStravaWorkouts() {
    if (!stravaService.isConfigured()) {
      return [];
    }
    
    try {
      return await stravaService.getTodaysActivities();
    } catch (error) {
      console.error('Failed to fetch today\'s Strava workouts:', error.message);
      return [];
    }
  }
}

module.exports = new WorkoutService();