const notionService = require('../notion');
const { format, startOfWeek, endOfWeek } = require('date-fns');

const UBER_EARNINGS_DB = process.env.UBER_EARNINGS_DATABASE_ID;

class UberEarningsService {
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

  // Parse a Notion Uber earnings entry into a clean object
  parseEarningsEntry(notionPage) {
    const props = notionPage.properties;
    
    return {
      id: notionPage.id,
      date: props.Date?.date?.start || null,
      grossAmount: props['Gross Amount']?.number || 0,
      savingsAmount: props['Savings Amount']?.formula?.number || 0,
      personalAmount: props['Personal Amount']?.formula?.number || 0,
      savingsPercentage: props['Savings Percentage']?.number || 50, // Default 50%
      punishmentActive: props['Punishment Active']?.checkbox || false,
      weekStart: props['Week Start']?.date?.start || null,
      platform: props.Platform?.select?.name || 'Unknown',
      source: props.Source?.rich_text?.[0]?.text?.content || '',
      createdAt: notionPage.created_time,
      lastModified: notionPage.last_edited_time
    };
  }

  // Sum weekly Uber earnings for a given week start date
  async sumWeeklyEarnings(weekStartDate) {
    try {
      console.log(`🚗 Summing Uber earnings for week starting ${weekStartDate}`);

      // Query Uber Earnings database for the specific week
      const response = await this.notion.databases.query({
        database_id: UBER_EARNINGS_DB,
        filter: {
          property: 'Week Start',
          date: {
            equals: weekStartDate
          }
        }
      });

      let totalGross = 0;
      let totalSavings = 0;
      let totalPersonal = 0;
      const entries = [];

      for (const page of response.results) {
        const entry = this.parseEarningsEntry(page);
        totalGross += entry.grossAmount;
        totalSavings += entry.savingsAmount;
        totalPersonal += entry.personalAmount;
        entries.push(entry);
      }

      console.log(`💰 Week ${weekStartDate}: $${totalGross.toFixed(2)} gross, $${totalSavings.toFixed(2)} savings, $${totalPersonal.toFixed(2)} personal from ${entries.length} entries`);

      return {
        weekStart: weekStartDate,
        totalGross: totalGross,
        totalSavings: totalSavings,
        totalPersonal: totalPersonal,
        entryCount: entries.length,
        entries: entries,
        effectiveSavingsRate: totalGross > 0 ? (totalSavings / totalGross) : 0
      };

    } catch (error) {
      console.error(`❌ Error summing weekly Uber earnings for ${weekStartDate}:`, error);
      return {
        weekStart: weekStartDate,
        totalGross: 0,
        totalSavings: 0,
        totalPersonal: 0,
        entryCount: 0,
        entries: [],
        effectiveSavingsRate: 0,
        error: error.message
      };
    }
  }

  // Get individual daily entries for a date range (for verification)
  async getDailyEntries(weekStart, weekEnd) {
    try {
      console.log(`📅 Getting daily Uber earnings entries from ${weekStart} to ${weekEnd}`);

      const response = await this.notion.databases.query({
        database_id: UBER_EARNINGS_DB,
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
        },
        sorts: [
          {
            property: 'Date',
            direction: 'ascending'
          }
        ]
      });

      const dailyEntries = response.results.map(page => this.parseEarningsEntry(page));
      
      // Group by date for easier verification
      const entriesByDate = {};
      let totalGross = 0;
      let totalSavings = 0;

      for (const entry of dailyEntries) {
        const date = entry.date;
        if (!entriesByDate[date]) {
          entriesByDate[date] = {
            date: date,
            entries: [],
            dayTotal: 0,
            daySavings: 0
          };
        }
        
        entriesByDate[date].entries.push(entry);
        entriesByDate[date].dayTotal += entry.grossAmount;
        entriesByDate[date].daySavings += entry.savingsAmount;
        
        totalGross += entry.grossAmount;
        totalSavings += entry.savingsAmount;
      }

      console.log(`📊 Found ${dailyEntries.length} entries across ${Object.keys(entriesByDate).length} days`);

      return {
        weekStart: weekStart,
        weekEnd: weekEnd,
        totalEntries: dailyEntries.length,
        totalGross: totalGross,
        totalSavings: totalSavings,
        entriesByDate: entriesByDate,
        allEntries: dailyEntries
      };

    } catch (error) {
      console.error(`❌ Error getting daily Uber earnings entries:`, error);
      return {
        weekStart: weekStart,
        weekEnd: weekEnd,
        totalEntries: 0,
        totalGross: 0,
        totalSavings: 0,
        entriesByDate: {},
        allEntries: [],
        error: error.message
      };
    }
  }

  // Calculate effective savings rate with punishment adjustments
  async calculateEffectiveSavingsRate(weekStartDate) {
    try {
      console.log(`📊 Calculating effective savings rate for week ${weekStartDate}`);

      const weeklyData = await this.sumWeeklyEarnings(weekStartDate);
      
      if (weeklyData.totalGross === 0) {
        return {
          weekStart: weekStartDate,
          baseSavingsRate: 0.50, // 50% default
          adjustedSavingsRate: 0.50,
          punishmentAdjustment: 0,
          totalGross: 0,
          effectiveSavings: 0,
          punishmentActive: false
        };
      }

      // Check if any entries have punishment active
      const punishmentActive = weeklyData.entries.some(entry => entry.punishmentActive);
      
      // Base savings rate is 50%
      const baseSavingsRate = 0.50;
      
      // If punishment is active, increase savings rate (punishment = save more)
      let punishmentAdjustment = 0;
      if (punishmentActive) {
        // TODO: This could be made configurable or pulled from rules
        punishmentAdjustment = 0.10; // Additional 10% savings during punishment
      }

      const adjustedSavingsRate = Math.min(baseSavingsRate + punishmentAdjustment, 1.0); // Cap at 100%
      const effectiveSavings = weeklyData.totalGross * adjustedSavingsRate;

      console.log(`💡 Effective savings rate: ${(adjustedSavingsRate * 100).toFixed(1)}% (base: ${(baseSavingsRate * 100)}%${punishmentActive ? `, +${(punishmentAdjustment * 100)}% punishment` : ''})`);

      return {
        weekStart: weekStartDate,
        baseSavingsRate: baseSavingsRate,
        adjustedSavingsRate: adjustedSavingsRate,
        punishmentAdjustment: punishmentAdjustment,
        totalGross: weeklyData.totalGross,
        actualSavings: weeklyData.totalSavings,
        effectiveSavings: effectiveSavings,
        punishmentActive: punishmentActive,
        entryCount: weeklyData.entryCount,
        savingsGap: effectiveSavings - weeklyData.totalSavings // How much more should have been saved
      };

    } catch (error) {
      console.error(`❌ Error calculating effective savings rate:`, error);
      return {
        weekStart: weekStartDate,
        baseSavingsRate: 0.50,
        adjustedSavingsRate: 0.50,
        punishmentAdjustment: 0,
        totalGross: 0,
        effectiveSavings: 0,
        punishmentActive: false,
        error: error.message
      };
    }
  }

  // Get current week's Uber earnings for habit tracking
  async getCurrentWeekEarnings() {
    try {
      const { weekStart } = this.getWeekBounds();
      return await this.sumWeeklyEarnings(weekStart);
    } catch (error) {
      console.error('❌ Error getting current week Uber earnings:', error);
      return {
        totalGross: 0,
        totalSavings: 0,
        entryCount: 0,
        error: error.message
      };
    }
  }

  // Get Uber earnings for a specific date range (used by weekly reconciliation)
  async getEarningsForDateRange(weekStart, weekEnd) {
    try {
      console.log(`🚗 Getting Uber earnings for ${weekStart} to ${weekEnd}`);

      const response = await this.notion.databases.query({
        database_id: UBER_EARNINGS_DB,
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

      let totalGross = 0;
      for (const page of response.results) {
        const entry = this.parseEarningsEntry(page);
        totalGross += entry.grossAmount;
      }

      console.log(`🚗 Uber earnings total: $${totalGross.toFixed(2)} from ${response.results.length} entries`);
      return totalGross;

    } catch (error) {
      console.error('❌ Error getting Uber earnings for date range:', error);
      return 0;
    }
  }

  // Health check method
  async healthCheck() {
    try {
      // Test connection by trying to retrieve the database
      const response = await this.notion.databases.retrieve({
        database_id: UBER_EARNINGS_DB
      });
      
      return {
        status: 'healthy',
        connected: true,
        database_access: true,
        database_title: response.title?.[0]?.plain_text || 'Uber Earnings'
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
      
      const [weeklyEarnings, savingsRate] = await Promise.all([
        this.sumWeeklyEarnings(targetWeekStart),
        this.calculateEffectiveSavingsRate(targetWeekStart)
      ]);

      return {
        weekStart: targetWeekStart,
        earnings: weeklyEarnings,
        savingsAnalysis: savingsRate,
        summary: `$${weeklyEarnings.totalGross.toFixed(2)} earned, ${(savingsRate.adjustedSavingsRate * 100).toFixed(1)}% savings rate${savingsRate.punishmentActive ? ' (punishment active)' : ''}`
      };

    } catch (error) {
      console.error('❌ Error getting Uber earnings weekly summary:', error);
      return {
        weekStart: weekStartDate,
        earnings: { totalGross: 0 },
        savingsAnalysis: { adjustedSavingsRate: 0.50 },
        summary: 'No Uber earnings data available',
        error: error.message
      };
    }
  }
}

module.exports = new UberEarningsService();