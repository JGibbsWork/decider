const notionService = require('../../integrations/notion');
const { format, startOfWeek, endOfWeek, addWeeks } = require('date-fns');

const WEEKLY_HABITS_DB = process.env.WEEKLY_HABITS_DATABASE_ID;

class HabitsService {
  constructor() {
    this.notion = notionService.notion;
  }

  // Get the Monday and Sunday for a given date
  getWeekBounds(date = new Date()) {
    const targetDate = new Date(date);
    const monday = startOfWeek(targetDate, { weekStartsOn: 1 }); // 1 = Monday
    const sunday = endOfWeek(targetDate, { weekStartsOn: 1 });
    
    return {
      weekStart: format(monday, 'yyyy-MM-dd'),
      weekEnd: format(sunday, 'yyyy-MM-dd'),
      mondayDate: monday,
      sundayDate: sunday
    };
  }

  // Get current week's habit entry, create if doesn't exist
  async getCurrentWeekHabits() {
    try {
      const { weekStart, weekEnd } = this.getWeekBounds();
      
      console.log(`📊 Getting current week habits for ${weekStart} to ${weekEnd}`);

      // Check if entry already exists for this week
      const response = await this.notion.databases.query({
        database_id: WEEKLY_HABITS_DB,
        filter: {
          property: 'Week Start',
          date: {
            equals: weekStart
          }
        }
      });

      if (response.results.length > 0) {
        console.log('✅ Found existing week entry');
        return this.parseHabitsEntry(response.results[0]);
      }

      // Create new week entry if it doesn't exist
      console.log('🏗️ Creating new week entry');
      return await this.createWeekEntry(weekStart, weekEnd);

    } catch (error) {
      console.error('❌ Error getting current week habits:', error);
      throw error;
    }
  }

  // Create a new weekly habits entry
  async createWeekEntry(weekStart, weekEnd) {
    try {
      console.log(`🏗️ Creating weekly habits entry for ${weekStart} to ${weekEnd}`);

      const response = await this.notion.pages.create({
        parent: { database_id: WEEKLY_HABITS_DB },
        properties: {
          'Name': {
            title: [{ text: { content: `Week of ${weekStart}` } }]
          },
          'Week Start': {
            date: { start: weekStart }
          },
          'Week End': {
            date: { start: weekEnd }
          },
          'Yoga Sessions': {
            number: 0
          },
          'Lifting Sessions': {
            number: 0
          },
          'Job Applications': {
            number: 0
          },
          'Uber Earnings': {
            number: 0
          },
          'Office Days': {
            number: 0
          },
          'Cowork Sessions': {
            number: 0
          }
        }
      });

      console.log('✅ Successfully created weekly habits entry');
      return this.parseHabitsEntry(response);

    } catch (error) {
      console.error('❌ Error creating week entry:', error);
      throw error;
    }
  }

  // Parse a Notion habits entry into a clean object
  parseHabitsEntry(notionPage) {
    const props = notionPage.properties;
    
    return {
      id: notionPage.id,
      name: props.Name?.title?.[0]?.text?.content || '',
      weekStart: props['Week Start']?.date?.start || null,
      weekEnd: props['Week End']?.date?.start || null,
      yogaSessions: props['Yoga Sessions']?.number || 0,
      liftingSessions: props['Lifting Sessions']?.number || 0,
      jobApplications: props['Job Applications']?.number || 0,
      uberEarnings: props['Uber Earnings']?.number || 0,
      officeDays: props['Office Days']?.number || 0,
      coworkSessions: props['Cowork Sessions']?.number || 0,
      // Formula fields (calculated by Notion)
      complianceRate: props['Compliance Rate']?.formula?.number || 0,
      totalViolations: props['Total Violations']?.formula?.number || 0,
      violationDetails: props['Violation Details']?.formula?.string || '',
      createdAt: notionPage.created_time,
      lastModified: notionPage.last_edited_time
    };
  }

  // Update current week's progress for a specific habit
  async updateCurrentWeekProgress(habitType, incrementBy = 1) {
    try {
      const currentWeek = await this.getCurrentWeekHabits();
      const habitPropertyMap = {
        'yoga': 'Yoga Sessions',
        'lifting': 'Lifting Sessions',
        'job_applications': 'Job Applications',
        'uber_earnings': 'Uber Earnings',
        'office': 'Office Days',
        'cowork': 'Cowork Sessions'
      };

      const propertyName = habitPropertyMap[habitType];
      if (!propertyName) {
        throw new Error(`Unknown habit type: ${habitType}`);
      }

      const currentValue = currentWeek[habitType.replace('_', '') + (habitType.includes('earnings') ? '' : habitType.includes('applications') ? '' : habitType === 'office' ? 'Days' : habitType === 'cowork' ? 'Sessions' : 'Sessions')];
      const newValue = currentValue + incrementBy;

      console.log(`📈 Updating ${habitType}: ${currentValue} → ${newValue}`);

      await this.notion.pages.update({
        page_id: currentWeek.id,
        properties: {
          [propertyName]: {
            number: newValue
          }
        }
      });

      console.log(`✅ Successfully updated ${habitType} to ${newValue}`);
      
      // Return updated entry
      return await this.getCurrentWeekHabits();

    } catch (error) {
      console.error(`❌ Error updating ${habitType} progress:`, error);
      throw error;
    }
  }

  // Set absolute value for a habit (not increment)
  async setCurrentWeekProgress(habitType, absoluteValue) {
    try {
      const currentWeek = await this.getCurrentWeekHabits();
      const habitPropertyMap = {
        'yoga': 'Yoga Sessions',
        'lifting': 'Lifting Sessions',
        'job_applications': 'Job Applications',
        'uber_earnings': 'Uber Earnings',
        'office': 'Office Days',
        'cowork': 'Cowork Sessions'
      };

      const propertyName = habitPropertyMap[habitType];
      if (!propertyName) {
        throw new Error(`Unknown habit type: ${habitType}`);
      }

      console.log(`📊 Setting ${habitType} to absolute value: ${absoluteValue}`);

      await this.notion.pages.update({
        page_id: currentWeek.id,
        properties: {
          [propertyName]: {
            number: absoluteValue
          }
        }
      });

      console.log(`✅ Successfully set ${habitType} to ${absoluteValue}`);
      
      // Return updated entry
      return await this.getCurrentWeekHabits();

    } catch (error) {
      console.error(`❌ Error setting ${habitType} progress:`, error);
      throw error;
    }
  }

  // Get specific week's habits by week start date
  async getWeekHabits(weekStartDate) {
    try {
      const response = await this.notion.databases.query({
        database_id: WEEKLY_HABITS_DB,
        filter: {
          property: 'Week Start',
          date: {
            equals: weekStartDate
          }
        }
      });

      if (response.results.length === 0) {
        return null;
      }

      return this.parseHabitsEntry(response.results[0]);

    } catch (error) {
      console.error(`❌ Error getting week habits for ${weekStartDate}:`, error);
      throw error;
    }
  }

  // Get recent weeks of habit data
  async getRecentWeeks(numberOfWeeks = 4) {
    try {
      const response = await this.notion.databases.query({
        database_id: WEEKLY_HABITS_DB,
        sorts: [
          {
            property: 'Week Start',
            direction: 'descending'
          }
        ],
        page_size: numberOfWeeks
      });

      return response.results.map(page => this.parseHabitsEntry(page));

    } catch (error) {
      console.error(`❌ Error getting recent weeks:`, error);
      return [];
    }
  }

  // Finalize current week (typically called at end of week)
  async finalizeWeeklyHabits() {
    try {
      const currentWeek = await this.getCurrentWeekHabits();
      
      console.log('🏁 Finalizing weekly habits for week:', currentWeek.weekStart);
      
      // The formulas in Notion will automatically calculate compliance, violations, etc.
      // This method can be used for any end-of-week processing if needed
      
      return {
        weekStart: currentWeek.weekStart,
        weekEnd: currentWeek.weekEnd,
        finalCounts: {
          yoga: currentWeek.yogaSessions,
          lifting: currentWeek.liftingSessions,
          jobApplications: currentWeek.jobApplications,
          uberEarnings: currentWeek.uberEarnings,
          officeDays: currentWeek.officeDays,
          coworkSessions: currentWeek.coworkSessions
        },
        complianceRate: currentWeek.complianceRate,
        totalViolations: currentWeek.totalViolations,
        violationDetails: currentWeek.violationDetails
      };

    } catch (error) {
      console.error('❌ Error finalizing weekly habits:', error);
      throw error;
    }
  }

  // Create next week's entry (typically called on Sunday/Monday transition)
  async createNextWeekEntry() {
    try {
      const { weekStart: currentWeekStart } = this.getWeekBounds();
      const nextWeekBounds = this.getWeekBounds(addWeeks(new Date(), 1));
      
      console.log(`🔄 Creating next week entry: ${nextWeekBounds.weekStart} to ${nextWeekBounds.weekEnd}`);

      // Check if next week already exists
      const existingNext = await this.getWeekHabits(nextWeekBounds.weekStart);
      if (existingNext) {
        console.log('✅ Next week entry already exists');
        return existingNext;
      }

      return await this.createWeekEntry(nextWeekBounds.weekStart, nextWeekBounds.weekEnd);

    } catch (error) {
      console.error('❌ Error creating next week entry:', error);
      throw error;
    }
  }

  // Sync current week with actual data from other services
  async syncCurrentWeekWithActuals() {
    try {
      console.log('🔄 Syncing current week with actual data from other services');
      
      const { weekStart, weekEnd } = this.getWeekBounds();
      
      // Get actual data from other services
      const workoutService = require('../workouts');
      const jobAppsData = await notionService.getJobApplicationsCountSinceMonday();
      
      // Get workout data for the week
      const workouts = await workoutService.getWorkoutsForWeek(weekStart, weekEnd);
      const yogaCount = workouts.filter(w => w.type === 'Yoga').length;
      const liftingCount = workouts.filter(w => w.type === 'Lifting').length;
      
      // TODO: Get office/cowork data from Home Assistant location tracking
      // TODO: Get Uber earnings from Teller API
      
      // Update the current week with actual counts
      await this.setCurrentWeekProgress('yoga', yogaCount);
      await this.setCurrentWeekProgress('lifting', liftingCount);
      await this.setCurrentWeekProgress('job_applications', jobAppsData.count);
      
      console.log('✅ Successfully synced current week with actuals');
      
      return await this.getCurrentWeekHabits();

    } catch (error) {
      console.error('❌ Error syncing current week with actuals:', error);
      throw error;
    }
  }

  // Get current week progress summary for daily reconciliation
  async getCurrentWeekSummary() {
    try {
      const currentWeek = await this.getCurrentWeekHabits();
      const { weekStart, weekEnd } = this.getWeekBounds();
      
      // Calculate days elapsed in week (Monday = 1, Sunday = 7)
      const today = new Date();
      const dayOfWeek = today.getDay();
      const daysElapsed = dayOfWeek === 0 ? 7 : dayOfWeek; // Sunday = 7, Monday = 1, etc.
      
      return {
        weekStart: currentWeek.weekStart,
        weekEnd: currentWeek.weekEnd,
        daysElapsed: daysElapsed,
        daysRemaining: 7 - daysElapsed,
        progress: {
          yoga: {
            current: currentWeek.yogaSessions,
            target: 5, // Could come from rules service
            onTrack: currentWeek.yogaSessions >= Math.floor((5 * daysElapsed) / 7)
          },
          lifting: {
            current: currentWeek.liftingSessions,
            target: 3,
            onTrack: currentWeek.liftingSessions >= Math.floor((3 * daysElapsed) / 7)
          },
          jobApplications: {
            current: currentWeek.jobApplications,
            target: 25,
            onTrack: currentWeek.jobApplications >= Math.floor((25 * daysElapsed) / 7)
          },
          office: {
            current: currentWeek.officeDays,
            target: 3,
            onTrack: currentWeek.officeDays >= Math.floor((3 * daysElapsed) / 7)
          },
          cowork: {
            current: currentWeek.coworkSessions,
            target: 2, // Assuming 2 per week
            onTrack: currentWeek.coworkSessions >= Math.floor((2 * daysElapsed) / 7)
          }
        },
        complianceRate: currentWeek.complianceRate,
        totalViolations: currentWeek.totalViolations
      };

    } catch (error) {
      console.error('❌ Error getting current week summary:', error);
      throw error;
    }
  }

  // Health check method
  async healthCheck() {
    try {
      // Test connection by trying to retrieve the database
      const response = await this.notion.databases.retrieve({
        database_id: WEEKLY_HABITS_DB
      });
      
      return {
        status: 'healthy',
        connected: true,
        database_access: true,
        database_title: response.title?.[0]?.plain_text || 'Weekly Habits'
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        connected: false,
        database_access: false,
        error: error.message
      };
    }
  }
}

module.exports = new HabitsService();