const { format } = require('date-fns');

// Import domain services
const punishmentService = require('../core/punishments');
const workoutService = require('../core/workouts');
const notionService = require('../integrations/notion');
const homeassistantService = require('../integrations/homeassistant');

class DailyReconciliationOrchestrator {

  async runDailyReconciliation(targetDate = null) {
    try {
      const today = targetDate || format(new Date(), 'yyyy-MM-dd');
      console.log(`🚀 Starting daily reconciliation for ${today}`);

      const results = {
        date: today,
        location_tracking: {
          all_toggles_on: false,
          toggle_states: {},
          summary: '',
          checked_at: null,
          synced_to_notion: false
        },
        workouts: {
          todays_workouts: []
        },
        summary: ''
      };

      // Step 1: Check location tracking toggles and auto-create Notion entry
      console.log('📍 Checking location tracking toggles and creating Notion entry...');
      try {
        if (homeassistantService.isConfigured()) {
          // Auto-create Notion entry during daily reconciliation
          results.location_tracking = await homeassistantService.checkLocationTrackingToggles(true);
          console.log(`Location tracking: ${results.location_tracking.all_toggles_on ? 'All ON' : 'Not all ON'}`);
          
          if (results.location_tracking.notion_entry?.created) {
            console.log('✅ Location tracking entry created in Notion automatically');
            results.location_tracking.synced_to_notion = true;
          } else if (results.location_tracking.notion_entry?.error) {
            console.log(`⚠️ Location entry creation failed: ${results.location_tracking.notion_entry.error}`);
            results.location_tracking.synced_to_notion = false;
          }
        } else {
          console.log('⚠️ Home Assistant not configured, skipping location tracking check');
          results.location_tracking.summary = 'Home Assistant not configured';
        }
      } catch (error) {
        console.error('❌ Error checking location tracking:', error.message);
        results.location_tracking.summary = `Error: ${error.message}`;
      }

      // Step 2: Get today's workout data (includes automatic Strava sync)
      console.log('🏋️ Analyzing today\'s workouts...');
      results.workouts.todays_workouts = await workoutService.getTodaysWorkouts(today);
      console.log(`Found ${results.workouts.todays_workouts.length} workouts`);

      // Step 3: Generate summary
      results.summary = this.generateDailySummary(results);

      console.log(`✅ Daily reconciliation complete for ${today}`);
      console.log(`📊 Summary: ${results.summary}`);

      return results;

    } catch (error) {
      console.error('❌ Daily reconciliation failed:', error);
      throw error;
    }
  }


  async processPunishments(date) {
    try {
      const results = {
        overdue_processed: [],
        completions: [],
        new_violations: []
      };

      // Process overdue punishments
      results.overdue_processed = await punishmentService.processOverduePunishments(date);

      // Check completions
      results.completions = await punishmentService.processCompletions(date);

      // Process new violations
      results.new_violations = await punishmentService.processNewViolations(date);

      console.log(`Punishment processing: ${results.overdue_processed.length} overdue, ${results.completions.length} completed, ${results.new_violations.length} new`);

      return results;

    } catch (error) {
      console.error('Error in punishment processing:', error);
      throw error;
    }
  }

  generateDailySummary(results) {
    const summaryParts = [];

    // Location tracking with auto-sync status
    if (results.location_tracking.all_toggles_on) {
      summaryParts.push('Location: All toggles ON.');
    } else if (results.location_tracking.summary) {
      summaryParts.push(`Location: ${results.location_tracking.summary.split(':')[1]?.trim() || results.location_tracking.summary}`);
    }
    
    if (results.location_tracking.synced_to_notion) {
      summaryParts.push('Location logged to Notion.');
    }

    // Workouts (includes Strava auto-sync)
    if (results.workouts.todays_workouts.length > 0) {
      summaryParts.push(`${results.workouts.todays_workouts.length} workout(s) completed.`);
    } else {
      summaryParts.push('No workouts today.');
    }

    return summaryParts.length > 0 ? summaryParts.join(' ') : 'Daily check complete.';
  }

  // Get comprehensive daily status
  async getDailyStatus(date = null) {
    try {
      const targetDate = date || format(new Date(), 'yyyy-MM-dd');
      
      const status = {
        date: targetDate,
        punishments: await this.getPunishmentSummary(targetDate),
        last_reconciliation: null
      };

      return status;

    } catch (error) {
      console.error('Error getting daily status:', error);
      return null;
    }
  }

  async getPunishmentSummary(date) {
    const pendingPunishments = await notionService.getPendingPunishments();
    
    return {
      pending_count: pendingPunishments.length,
      total_minutes: pendingPunishments.reduce((sum, p) => 
        sum + (p.properties['Minutes'].number || 0), 0
      )
    };
  }

}

module.exports = new DailyReconciliationOrchestrator();