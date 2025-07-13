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
          checked_at: null
        },
        punishments: {
          overdue_processed: [],
          completions: [],
          new_violations: []
        },
        workouts: {
          todays_workouts: []
        },
        summary: ''
      };

      // Step 1: Check location tracking toggles
      console.log('📍 Checking location tracking toggles...');
      try {
        if (homeassistantService.isConfigured()) {
          results.location_tracking = await homeassistantService.checkLocationTrackingToggles();
          console.log(`Location tracking: ${results.location_tracking.all_toggles_on ? 'All ON' : 'Not all ON'}`);
        } else {
          console.log('⚠️ Home Assistant not configured, skipping location tracking check');
          results.location_tracking.summary = 'Home Assistant not configured';
        }
      } catch (error) {
        console.error('❌ Error checking location tracking:', error.message);
        results.location_tracking.summary = `Error: ${error.message}`;
      }

      // Step 2: Get today's workout data
      console.log('🏋️ Analyzing today\'s workouts...');
      results.workouts.todays_workouts = await workoutService.getTodaysWorkouts(today);
      console.log(`Found ${results.workouts.todays_workouts.length} workouts`);

      // Step 3: Process all punishment workflows
      console.log('⚖️ Processing punishments...');
      const punishmentResults = await this.processPunishments(today);
      results.punishments = punishmentResults;

      // Step 4: Generate summary
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

    // Location tracking
    if (results.location_tracking.all_toggles_on) {
      summaryParts.push('Location tracking: All toggles ON.');
    } else if (results.location_tracking.summary) {
      summaryParts.push(`Location tracking: ${results.location_tracking.summary}`);
    }

    // Workouts
    if (results.workouts.todays_workouts.length > 0) {
      summaryParts.push(`Completed ${results.workouts.todays_workouts.length} workout(s).`);
    }

    // Punishments
    if (results.punishments.new_violations.length > 0) {
      summaryParts.push(`Assigned ${results.punishments.new_violations.length} new punishment(s).`);
    }

    if (results.punishments.completions.length > 0) {
      summaryParts.push(`Completed ${results.punishments.completions.length} punishment assignment(s).`);
    }

    if (results.punishments.overdue_processed.length > 0) {
      summaryParts.push(`Processed ${results.punishments.overdue_processed.length} overdue punishment(s).`);
    }

    return summaryParts.length > 0 ? summaryParts.join(' ') : 'No significant activity today.';
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