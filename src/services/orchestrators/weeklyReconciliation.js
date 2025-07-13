const { format, startOfWeek, endOfWeek, subWeeks } = require('date-fns');

// Import domain services
const workoutService = require('../core/workouts');
const punishmentService = require('../core/punishments');
const notionService = require('../integrations/notion');

// Import services
const rulesService = require('../core/rules');
const homeassistantService = require('../integrations/homeassistant');

class WeeklyReconciliationOrchestrator {

  async runWeeklyReconciliation(weekStartDate = null) {
    try {
      // Default to last Sunday if no date provided
      const targetWeekStart = weekStartDate || format(startOfWeek(subWeeks(new Date(), 1)), 'yyyy-MM-dd');
      const targetWeekEnd = format(endOfWeek(new Date(targetWeekStart)), 'yyyy-MM-dd');
      
      console.log(`📅 Starting weekly reconciliation for ${targetWeekStart} to ${targetWeekEnd}`);

      const results = {
        week_start: targetWeekStart,
        week_end: targetWeekEnd,
        job_applications: {
          weekly_count: 0,
          since_monday: null
        },
        workouts: {
          performance: null,
          requirements_met: true,
          violations: []
        },
        punishments: {
          weekly_violations: [],
          weekly_punishments: []
        },
        summary: ''
      };

      // Step 1: Check job applications this week
      console.log('💼 Checking weekly job applications...');
      try {
        const jobAppsData = await notionService.getJobApplicationsCountSinceMonday();
        results.job_applications.weekly_count = jobAppsData.count;
        results.job_applications.since_monday = jobAppsData.since_date;
        console.log(`Found ${jobAppsData.count} job applications since Monday`);
      } catch (error) {
        console.error('❌ Error checking job applications:', error.message);
        results.job_applications.weekly_count = 0;
        results.job_applications.error = error.message;
      }

      // Step 2: Analyze weekly workout performance
      console.log('🏋️ Analyzing weekly workout performance...');
      results.workouts.performance = await workoutService.analyzeWeeklyPerformance(targetWeekStart, targetWeekEnd);
      console.log(`Found ${results.workouts.performance.total_sessions} workouts: ${results.workouts.performance.yoga_sessions} yoga, ${results.workouts.performance.lifting_sessions} lifting`);

      // Step 3: Check workout requirements and violations
      console.log('⚠️ Checking weekly workout requirements...');
      const workoutViolations = await this.checkWorkoutRequirements(results.workouts.performance);
      results.workouts.violations = workoutViolations;
      results.workouts.requirements_met = workoutViolations.length === 0;

      // Step 4: Check other weekly violations (career/office attendance)
      console.log('📋 Checking career and office attendance violations...');
      const careerViolations = await this.checkCareerViolations(targetWeekStart, targetWeekEnd);
      results.punishments.weekly_violations = [...workoutViolations, ...careerViolations];

      // Step 5: Process violations into punishments
      if (results.punishments.weekly_violations.length > 0) {
        console.log(`⚖️ Processing ${results.punishments.weekly_violations.length} weekly violation(s)...`);
        const weeklyPunishments = await this.processWeeklyViolations(results.punishments.weekly_violations);
        results.punishments.weekly_punishments = weeklyPunishments;
      }

      // Step 6: No additional processing needed (removed Habitica integration)
      console.log('✅ Weekly violation processing complete');

      // Step 7: Generate summary
      results.summary = this.generateWeeklySummary(results);

      console.log(`✅ Weekly reconciliation complete for ${targetWeekStart}`);
      console.log(`📊 Summary: ${results.summary}`);

      return results;

    } catch (error) {
      console.error('❌ Weekly reconciliation failed:', error);
      throw error;
    }
  }

  // Check workout requirements
  async checkWorkoutRequirements(workoutPerformance) {
    const violations = [];
    
    try {
      // Check yoga minimum (updated to 5/week)
      const yogaMinimum = await rulesService.getNumericValue('weekly_yoga_minimum') || 5;
      if (workoutPerformance.yoga_sessions < yogaMinimum) {
        violations.push({
          type: 'weekly_yoga_shortfall',
          reason: `Only completed ${workoutPerformance.yoga_sessions}/${yogaMinimum} yoga sessions this week`,
          severity: 'weekly_violation',
          category: 'workout_violation'
        });
      }

      // Check lifting minimum (added 3/week requirement)
      const liftingMinimum = await rulesService.getNumericValue('weekly_lifting_minimum') || 3;
      if (workoutPerformance.lifting_sessions < liftingMinimum) {
        violations.push({
          type: 'weekly_lifting_shortfall',
          reason: `Only completed ${workoutPerformance.lifting_sessions}/${liftingMinimum} lifting sessions this week`,
          severity: 'weekly_violation',
          category: 'workout_violation'
        });
      }
      
    } catch (error) {
      console.error('Error checking workout requirements:', error);
    }

    return violations;
  }


  // Check career and office attendance violations
  async checkCareerViolations(weekStart, weekEnd) {
    const violations = [];
    
    try {
      // Check job applications shortfall (from Notion)
      const jobAppsData = await notionService.getJobApplicationsCountSinceMonday();
      const jobAppsCount = jobAppsData.count;
      const jobAppsMinimum = await rulesService.getNumericValue('job_applications_minimum') || 25;
      
      if (jobAppsCount < jobAppsMinimum) {
        violations.push({
          type: 'job_applications_shortfall',
          reason: `Only completed ${jobAppsCount}/${jobAppsMinimum} job applications this week`,
          severity: 'weekly_violation',
          category: 'career_violation'
        });
      }

      // Check office attendance (from Home Assistant location tracking)
      const officeAttendance = await this.getOfficeAttendanceFromHomeAssistant();
      const officeMinimum = await rulesService.getNumericValue('office_attendance_minimum') || 3;
      
      if (officeAttendance < officeMinimum) {
        violations.push({
          type: 'office_attendance_shortfall',
          reason: `Only attended office ${officeAttendance}/${officeMinimum} days this week`,
          severity: 'weekly_violation',
          category: 'career_violation'
        });
      }

    } catch (error) {
      console.error('Error checking career violations:', error);
    }

    return violations;
  }

  // Process weekly violations into punishment assignments
  async processWeeklyViolations(violations) {
    const punishments = [];

    try {
      for (const violation of violations) {
        let punishmentMinutes = 30; // Default
        
        // Determine punishment duration based on violation type
        switch (violation.type) {
          case 'weekly_yoga_shortfall':
            punishmentMinutes = 45;
            break;
          case 'weekly_lifting_shortfall':
            punishmentMinutes = 45;
            break;
          case 'job_applications_shortfall':
            punishmentMinutes = 60;
            break;
          case 'office_attendance_shortfall':
            punishmentMinutes = 30;
            break;
        }

        // Create punishment via punishmentService
        const punishment = await punishmentService.assignPunishment({
          type: 'weekly_violation',
          reason: violation.reason,
          minutes: punishmentMinutes,
          category: violation.category || 'weekly_violation',
          due_date: format(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd') // Due in 1 week
        });

        punishments.push(punishment);
        console.log(`Assigned ${punishmentMinutes}min punishment for: ${violation.reason}`);
      }

    } catch (error) {
      console.error('Error processing weekly violations:', error);
    }

    return punishments;
  }

  // Get office attendance from Home Assistant location tracking
  async getOfficeAttendanceFromHomeAssistant() {
    try {
      if (!homeassistantService.isConfigured()) {
        console.log('Home Assistant not configured, defaulting office attendance to 0');
        return 0;
      }

      // TODO: This would need to query Notion location tracking database 
      // to count how many days this week the office toggle was ON
      // For now, return 0 as placeholder - this needs implementation
      console.log('⚠️ Office attendance from Home Assistant not yet implemented');
      return 0;

    } catch (error) {
      console.error('Error getting office attendance from Home Assistant:', error);
      return 0;
    }
  }

  // Generate weekly summary
  generateWeeklySummary(results) {
    const summaryParts = [];

    // Job applications
    if (results.job_applications.weekly_count > 0) {
      summaryParts.push(`Applied to ${results.job_applications.weekly_count} job(s) this week.`);
    } else {
      summaryParts.push('No job applications this week.');
    }

    // Workout performance
    if (results.workouts.performance) {
      summaryParts.push(`Completed ${results.workouts.performance.yoga_sessions} yoga and ${results.workouts.performance.lifting_sessions} lifting sessions.`);
    }

    // Violations
    if (results.punishments.weekly_violations.length > 0) {
      summaryParts.push(`${results.punishments.weekly_violations.length} weekly violation(s) detected.`);
    } else {
      summaryParts.push('No weekly violations.');
    }

    // Punishments assigned
    if (results.punishments.weekly_punishments.length > 0) {
      const totalMinutes = results.punishments.weekly_punishments.reduce((sum, p) => sum + (p.minutes || 0), 0);
      summaryParts.push(`Assigned ${totalMinutes} minutes of punishment cardio.`);
    }

    return summaryParts.length > 0 ? summaryParts.join(' ') : 'No significant weekly activity.';
  }

  // Get weekly status for reporting
  async getWeeklyStatus(weekStart = null) {
    try {
      const targetWeekStart = weekStart || format(startOfWeek(subWeeks(new Date(), 1)), 'yyyy-MM-dd');
      const targetWeekEnd = format(endOfWeek(new Date(targetWeekStart)), 'yyyy-MM-dd');
      
      const jobAppsData = await notionService.getJobApplicationsCountSinceMonday();
      
      const status = {
        week_start: targetWeekStart,
        week_end: targetWeekEnd,
        workout_performance: await workoutService.analyzeWeeklyPerformance(targetWeekStart, targetWeekEnd),
        career_status: {
          job_applications: jobAppsData.count,
          office_attendance: await this.getOfficeAttendanceFromHomeAssistant()
        }
      };

      return status;

    } catch (error) {
      console.error('Error getting weekly status:', error);
      return null;
    }
  }
}

module.exports = new WeeklyReconciliationOrchestrator();