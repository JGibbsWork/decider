const { Client } = require('@notionhq/client');

const notion = new Client({
  auth: process.env.NOTION_TOKEN,
});

// Database IDs from your Notion workspace
const DATABASES = {
  WORKOUTS: process.env.WORKOUTS_DATABASE_ID,
  BALANCES: process.env.BALANCES_DATABASE_ID,
  PUNISHMENTS: process.env.PUNISHMENTS_DATABASE_ID,
  MORNING_CHECKINS: process.env.MORNING_CHECKINS_DATABASE_ID,
  SYSTEM_RULES: process.env.SYSTEM_RULES_DATABASE_ID,
  LOCATION_TRACKING: process.env.LOCATION_TRACKING_DATABASE_ID,
};

class NotionService {
  constructor() {
    this.notion = notion;
  }
  // Get today's workouts
  async getTodaysWorkouts(date) {
    const response = await notion.databases.query({
      database_id: DATABASES.WORKOUTS,
      filter: {
        property: 'Date',
        date: {
          equals: date
        }
      }
    });
    return response.results;
  }

  // Get workouts for a date range
  async getWorkoutsForDateRange(startDate, endDate) {
    const response = await notion.databases.query({
      database_id: DATABASES.WORKOUTS,
      filter: {
        and: [
          {
            property: 'Date',
            date: {
              on_or_after: startDate
            }
          },
          {
            property: 'Date',
            date: {
              on_or_before: endDate
            }
          }
        ]
      },
      sorts: [
        {
          property: 'Date',
          direction: 'ascending'
        }
      ]
    });
    return response.results;
  }


  // Get pending cardio assignments
  async getPendingPunishments() {
    const response = await notion.databases.query({
      database_id: DATABASES.PUNISHMENTS,
      filter: {
        property: 'Status',
        select: {
          equals: 'pending'
        }
      }
    });
    return response.results;
  }

  // Get latest account balances
  async getLatestBalances(limit = 2) {
    const response = await notion.databases.query({
      database_id: DATABASES.BALANCES,
      sorts: [
        {
          property: 'Date',
          direction: 'descending'
        }
      ],
      page_size: limit
    });
    return response.results;
  }

  // Get morning check-in for specific date
  async getMorningCheckin(date) {
    const response = await notion.databases.query({
      database_id: DATABASES.MORNING_CHECKINS,
      filter: {
        property: 'Date',
        title: {
          equals: date
        }
      }
    });
    return response.results[0] || null;
  }


  // Create new punishment assignment
  async createPunishment(punishmentData) {
    const properties = {
      Name: {
        title: [{ text: { content: punishmentData.name } }]
      },
      Type: {
        select: { name: punishmentData.type }
      },
      'Minutes Required': {
        number: punishmentData.minutes
      },
      'Date Assigned': {
        date: { start: punishmentData.dateAssigned }
      },
      Status: {
        select: { name: 'pending' }
      }
    };

    // Add Due Date if provided
    if (punishmentData.dueDate) {
      properties['Due Date'] = {
        date: { start: punishmentData.dueDate }
      };
    }

    const response = await notion.pages.create({
      parent: { database_id: DATABASES.PUNISHMENTS },
      properties
    });
    return response;
  }


  // Update punishment status
  async updatePunishmentStatus(punishmentId, status, completedDate = null) {
    const properties = {
      Status: {
        select: { name: status }
      }
    };

    if (completedDate) {
      properties['Date Completed'] = {
        date: { start: completedDate }
      };
    }

    const response = await notion.pages.update({
      page_id: punishmentId,
      properties
    });
    return response;
  }

  // Health check method
  async healthCheck() {
    try {
      // Test connection by trying to retrieve a database
      const response = await notion.databases.retrieve({
        database_id: DATABASES.WORKOUTS
      });
      
      return {
        status: 'healthy',
        connected: true,
        database_access: true,
        workspace_title: response.title?.[0]?.plain_text || 'Unknown'
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

  // Get system rules
  async getSystemRules() {
    try {
      const response = await notion.databases.query({
        database_id: DATABASES.SYSTEM_RULES
      });
      return response.results;
    } catch (error) {
      console.error('Error getting system rules:', error);
      return [];
    }
  }

  // Update rule modifier
  async updateRuleModifier(ruleId, modifierValue) {
    try {
      const response = await notion.pages.update({
        page_id: ruleId,
        properties: {
          'Modifier': {
            number: modifierValue
          }
        }
      });
      return response;
    } catch (error) {
      console.error('Error updating rule modifier:', error);
      throw error;
    }
  }

  // Create location tracking entry in Notion
  async createLocationTrackingEntry(locationData) {
    try {
      console.log('📍 Creating location tracking entry in Notion:', {
        date: locationData.date,
        coWork: locationData.coWork,
        gym: locationData.gym,
        office: locationData.office,
        allOn: locationData.allOn
      });
      
      // Calculate Monday of the current week for Week Start
      const currentDate = new Date(locationData.date + 'T00:00:00'); // Ensure we're working with local date
      const dayOfWeek = currentDate.getDay(); // 0 = Sunday, 1 = Monday, etc.
      const daysToSubtract = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // If Sunday, go back 6 days; otherwise go back to Monday
      const weekStart = new Date(currentDate);
      weekStart.setDate(currentDate.getDate() - daysToSubtract);
      const weekStartString = weekStart.toISOString().split('T')[0];
      
      console.log(`📅 Week Start calculation: Current day of week: ${dayOfWeek}, Days to subtract: ${daysToSubtract}, Week start: ${weekStartString}`);

      const response = await notion.pages.create({
        parent: { database_id: DATABASES.LOCATION_TRACKING },
        properties: {
          'Name': {
            title: [{ text: { content: `Location Check - ${locationData.date}` } }]
          },
          'Date': {
            date: { start: locationData.date }
          },
          'Week Start': {
            date: { start: weekStartString }
          },
          'CoWork': {
            checkbox: locationData.coWork || false
          },
          'Gym': {
            checkbox: locationData.gym || false
          },
          'Office': {
            checkbox: locationData.office || false
          },
          'Notes': {
            rich_text: [{ text: { content: `Checked on: ${locationData.date.slice(5)}` } }]
          }
        }
      });
      console.log('✅ Successfully created location tracking entry in Notion');
      return response;
    } catch (error) {
      console.error('❌ Error creating location tracking entry in Notion:', error);
      console.error('📋 Location data that failed:', locationData);
      throw error;
    }
  }

  // Create workout entry in Notion
  async createWorkout(workoutData) {
    try {
      console.log('🏗️ Creating workout in Notion:', {
        name: workoutData.name,
        date: workoutData.date,
        type: workoutData.type,
        duration: workoutData.duration,
        source: workoutData.source
      });
      
      const response = await notion.pages.create({
        parent: { database_id: DATABASES.WORKOUTS },
        properties: {
          Name: {
            title: [{ text: { content: workoutData.name || 'Workout' } }]
          },
          Date: {
            date: { start: workoutData.date }
          },
          'Workout Type': {
            select: { name: workoutData.type || 'Other' }
          },
          Duration: {
            number: workoutData.duration || 0
          },
          Calories: {
            number: workoutData.calories || null
          },
          Source: {
            select: { name: workoutData.source || 'Manual' }
          },
          'Strava ID': {
            rich_text: [{ text: { content: workoutData.stravaId || '' } }]
          }
        }
      });
      console.log('✅ Successfully created workout in Notion');
      return response;
    } catch (error) {
      console.error('❌ Error creating workout in Notion:', error);
      console.error('📋 Workout data that failed:', workoutData);
      throw error;
    }
  }

  // Get reconciliation history
  async getReconciliationHistory(days = 7) {
    try {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      
      // This would need to be implemented based on where you store reconciliation history
      // For now, return empty array
      console.log(`Getting reconciliation history for ${days} days`);
      return [];
    } catch (error) {
      console.error('Error getting reconciliation history:', error);
      return [];
    }
  }
}

module.exports = new NotionService();