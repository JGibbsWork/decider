const notionService = require('../notion');
const { format, startOfWeek, endOfWeek } = require('date-fns');

const LOCATION_TRACKING_DB = process.env.LOCATION_TRACKING_DATABASE_ID;

class LocationTrackingService {
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

  // Parse a Notion location tracking entry into a clean object
  parseLocationEntry(notionPage) {
    const props = notionPage.properties;
    
    return {
      id: notionPage.id,
      date: props.Date?.date?.start || null,
      weekStart: props['Week Start']?.date?.start || null,
      office: props.Office?.checkbox || false,
      cowork: props.Cowork?.checkbox || props.CoWork?.checkbox || false, // Handle both spellings
      gym: props.Gym?.checkbox || false,
      createdAt: notionPage.created_time,
      lastModified: notionPage.last_edited_time
    };
  }

  // Count office days for a given week (where Office checkbox = true)
  async countOfficeDays(weekStartDate) {
    try {
      console.log(`🏢 Counting office days for week starting ${weekStartDate}`);

      // Query Location Tracking database for the specific week
      const response = await this.notion.databases.query({
        database_id: LOCATION_TRACKING_DB,
        filter: {
          and: [
            {
              property: 'Week Start',
              date: {
                equals: weekStartDate
              }
            },
            {
              property: 'Office',
              checkbox: {
                equals: true
              }
            }
          ]
        }
      });

      const officeDays = response.results.map(page => this.parseLocationEntry(page));
      
      console.log(`🏢 Found ${officeDays.length} office days for week ${weekStartDate}`);

      return {
        weekStart: weekStartDate,
        count: officeDays.length,
        dates: officeDays.map(entry => entry.date).filter(date => date),
        entries: officeDays
      };

    } catch (error) {
      console.error(`❌ Error counting office days for ${weekStartDate}:`, error);
      return {
        weekStart: weekStartDate,
        count: 0,
        dates: [],
        entries: [],
        error: error.message
      };
    }
  }

  // Count cowork days for a given week (where Cowork checkbox = true)
  async countCoworkDays(weekStartDate) {
    try {
      console.log(`🤝 Counting cowork days for week starting ${weekStartDate}`);

      // Query for both "Cowork" and "CoWork" properties (handle variations)
      const filters = [
        {
          and: [
            {
              property: 'Week Start',
              date: {
                equals: weekStartDate
              }
            },
            {
              property: 'Cowork',
              checkbox: {
                equals: true
              }
            }
          ]
        },
        {
          and: [
            {
              property: 'Week Start',
              date: {
                equals: weekStartDate
              }
            },
            {
              property: 'CoWork',
              checkbox: {
                equals: true
              }
            }
          ]
        }
      ];

      let allCoworkDays = [];
      
      // Try both filter variations to handle property name differences
      for (const filter of filters) {
        try {
          const response = await this.notion.databases.query({
            database_id: LOCATION_TRACKING_DB,
            filter: filter
          });
          
          const coworkDays = response.results.map(page => this.parseLocationEntry(page));
          allCoworkDays = allCoworkDays.concat(coworkDays);
        } catch (filterError) {
          // Ignore errors for individual filters (property might not exist)
          console.log(`Filter variation failed (expected): ${filterError.message}`);
        }
      }

      // Remove duplicates based on date
      const uniqueCoworkDays = allCoworkDays.filter((entry, index, self) => 
        index === self.findIndex(e => e.date === entry.date)
      );
      
      console.log(`🤝 Found ${uniqueCoworkDays.length} cowork days for week ${weekStartDate}`);

      return {
        weekStart: weekStartDate,
        count: uniqueCoworkDays.length,
        dates: uniqueCoworkDays.map(entry => entry.date).filter(date => date),
        entries: uniqueCoworkDays
      };

    } catch (error) {
      console.error(`❌ Error counting cowork days for ${weekStartDate}:`, error);
      return {
        weekStart: weekStartDate,
        count: 0,
        dates: [],
        entries: [],
        error: error.message
      };
    }
  }

  // Count gym days for a given week (where Gym checkbox = true)
  async countGymDays(weekStartDate) {
    try {
      console.log(`🏋️ Counting gym days for week starting ${weekStartDate}`);

      // Query Location Tracking database for the specific week
      const response = await this.notion.databases.query({
        database_id: LOCATION_TRACKING_DB,
        filter: {
          and: [
            {
              property: 'Week Start',
              date: {
                equals: weekStartDate
              }
            },
            {
              property: 'Gym',
              checkbox: {
                equals: true
              }
            }
          ]
        }
      });

      const gymDays = response.results.map(page => this.parseLocationEntry(page));
      
      console.log(`🏋️ Found ${gymDays.length} gym days for week ${weekStartDate}`);

      return {
        weekStart: weekStartDate,
        count: gymDays.length,
        dates: gymDays.map(entry => entry.date).filter(date => date),
        entries: gymDays
      };

    } catch (error) {
      console.error(`❌ Error counting gym days for ${weekStartDate}:`, error);
      return {
        weekStart: weekStartDate,
        count: 0,
        dates: [],
        entries: [],
        error: error.message
      };
    }
  }

  // Count all location-based habits for a given week (used by weekly reconciliation)
  async countAllLocationHabits(weekStartDate) {
    try {
      console.log(`📍 Counting all location habits for week starting ${weekStartDate}`);

      const [officeData, coworkData, gymData] = await Promise.all([
        this.countOfficeDays(weekStartDate),
        this.countCoworkDays(weekStartDate),
        this.countGymDays(weekStartDate)
      ]);

      const summary = {
        weekStart: weekStartDate,
        office: officeData,
        cowork: coworkData,
        gym: gymData,
        summary: `${officeData.count} office, ${coworkData.count} cowork, ${gymData.count} gym days`
      };

      console.log(`📍 Location habits summary: ${summary.summary}`);

      return summary;

    } catch (error) {
      console.error(`❌ Error counting all location habits for ${weekStartDate}:`, error);
      return {
        weekStart: weekStartDate,
        office: { count: 0, dates: [], entries: [] },
        cowork: { count: 0, dates: [], entries: [] },
        gym: { count: 0, dates: [], entries: [] },
        summary: 'Error retrieving location data',
        error: error.message
      };
    }
  }

  // Count location habits for a date range (used by weekly reconciliation)
  async countLocationHabitsForDateRange(weekStart, weekEnd) {
    try {
      console.log(`📍 Counting location habits for ${weekStart} to ${weekEnd}`);

      // Query Location Tracking database for the date range
      const response = await this.notion.databases.query({
        database_id: LOCATION_TRACKING_DB,
        filter: {
          and: [
            {
              property: 'Date',
              date: { on_or_after: weekStart }
            },
            {
              property: 'Date',
              date: { on_or_before: weekEnd }
            }
          ]
        }
      });

      let officeDays = 0;
      let coworkDays = 0;
      let gymDays = 0;
      const entries = [];

      for (const page of response.results) {
        const entry = this.parseLocationEntry(page);
        entries.push(entry);

        if (entry.office) officeDays++;
        if (entry.cowork) coworkDays++;
        if (entry.gym) gymDays++;
      }

      console.log(`📍 Location habits: Office: ${officeDays}, Cowork: ${coworkDays}, Gym: ${gymDays}`);

      return { 
        officeDays, 
        coworkDays, 
        gymDays,
        totalEntries: entries.length,
        entries: entries
      };

    } catch (error) {
      console.error('❌ Error counting location habits for date range:', error);
      return { 
        officeDays: 0, 
        coworkDays: 0, 
        gymDays: 0,
        totalEntries: 0,
        entries: [],
        error: error.message
      };
    }
  }

  // Get location entries for a specific week (for verification)
  async getWeeklyLocationEntries(weekStartDate) {
    try {
      console.log(`📅 Getting location entries for week starting ${weekStartDate}`);

      const response = await this.notion.databases.query({
        database_id: LOCATION_TRACKING_DB,
        filter: {
          property: 'Week Start',
          date: {
            equals: weekStartDate
          }
        },
        sorts: [
          {
            property: 'Date',
            direction: 'ascending'
          }
        ]
      });

      const entries = response.results.map(page => this.parseLocationEntry(page));
      
      // Group by date for easier verification
      const entriesByDate = {};
      for (const entry of entries) {
        const date = entry.date;
        if (!entriesByDate[date]) {
          entriesByDate[date] = {
            date: date,
            office: false,
            cowork: false,
            gym: false
          };
        }
        
        // Merge boolean values (could have multiple entries per day)
        entriesByDate[date].office = entriesByDate[date].office || entry.office;
        entriesByDate[date].cowork = entriesByDate[date].cowork || entry.cowork;
        entriesByDate[date].gym = entriesByDate[date].gym || entry.gym;
      }

      console.log(`📅 Found ${entries.length} entries across ${Object.keys(entriesByDate).length} days`);

      return {
        weekStart: weekStartDate,
        totalEntries: entries.length,
        uniqueDays: Object.keys(entriesByDate).length,
        entriesByDate: entriesByDate,
        allEntries: entries
      };

    } catch (error) {
      console.error(`❌ Error getting weekly location entries for ${weekStartDate}:`, error);
      return {
        weekStart: weekStartDate,
        totalEntries: 0,
        uniqueDays: 0,
        entriesByDate: {},
        allEntries: [],
        error: error.message
      };
    }
  }

  // Get current week's location data for habit tracking
  async getCurrentWeekLocationData() {
    try {
      const { weekStart } = this.getWeekBounds();
      return await this.countAllLocationHabits(weekStart);
    } catch (error) {
      console.error('❌ Error getting current week location data:', error);
      return {
        office: { count: 0 },
        cowork: { count: 0 },
        gym: { count: 0 },
        error: error.message
      };
    }
  }

  // Health check method
  async healthCheck() {
    try {
      // Test connection by trying to retrieve the database
      const response = await this.notion.databases.retrieve({
        database_id: LOCATION_TRACKING_DB
      });
      
      return {
        status: 'healthy',
        connected: true,
        database_access: true,
        database_title: response.title?.[0]?.plain_text || 'Location Tracking'
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

  // Get weekly summary for reporting
  async getWeeklySummary(weekStartDate = null) {
    try {
      const targetWeekStart = weekStartDate || this.getWeekBounds().weekStart;
      
      const locationData = await this.countAllLocationHabits(targetWeekStart);

      return {
        weekStart: targetWeekStart,
        location_habits: locationData,
        summary: locationData.summary
      };

    } catch (error) {
      console.error('❌ Error getting location tracking weekly summary:', error);
      return {
        weekStart: weekStartDate,
        location_habits: {
          office: { count: 0 },
          cowork: { count: 0 },
          gym: { count: 0 }
        },
        summary: 'No location data available',
        error: error.message
      };
    }
  }

  // Validate location data integrity (check for missing days, duplicate entries, etc.)
  async validateWeekData(weekStartDate) {
    try {
      console.log(`🔍 Validating location data for week starting ${weekStartDate}`);

      const weeklyEntries = await this.getWeeklyLocationEntries(weekStartDate);
      const expectedDays = 7; // Monday through Sunday
      const actualDays = weeklyEntries.uniqueDays;
      const missingDays = expectedDays - actualDays;

      // Check for data integrity issues
      const validation = {
        weekStart: weekStartDate,
        expectedDays: expectedDays,
        actualDays: actualDays,
        missingDays: missingDays,
        hasCompleteCoverage: missingDays === 0,
        duplicateEntries: weeklyEntries.totalEntries > actualDays,
        validation_summary: `${actualDays}/${expectedDays} days tracked${missingDays > 0 ? `, ${missingDays} missing` : ''}${weeklyEntries.totalEntries > actualDays ? ', duplicates found' : ''}`
      };

      console.log(`🔍 Validation: ${validation.validation_summary}`);

      return validation;

    } catch (error) {
      console.error(`❌ Error validating week data for ${weekStartDate}:`, error);
      return {
        weekStart: weekStartDate,
        expectedDays: 7,
        actualDays: 0,
        missingDays: 7,
        hasCompleteCoverage: false,
        duplicateEntries: false,
        validation_summary: 'Validation failed',
        error: error.message
      };
    }
  }
}

module.exports = new LocationTrackingService();