const { format, startOfWeek, endOfWeek, subWeeks } = require('date-fns');

// Import domain services
const workoutService = require('../core/workouts');
const punishmentService = require('../core/punishments');
const habitsService = require('../core/habits');
const notionService = require('../integrations/notion');

// Import services
const rulesService = require('../core/rules');
const homeassistantService = require('../integrations/homeassistant');
const uberEarningsService = require('../integrations/uber/earnings');
const locationTrackingService = require('../integrations/location/tracking');

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
        habits: {
          weekly_counts: {},
          compliance_rate: 0,
          total_violations: 0,
          violation_details: ''
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

      // Step 1: Collect all weekly habit data and update Weekly Habits database
      console.log('📊 Collecting all weekly habit data...');
      const weeklyHabits = await this.collectAndUpdateWeeklyHabits(targetWeekStart, targetWeekEnd);
      results.habits = weeklyHabits;

      // Step 2: Analyze weekly workout performance (for backward compatibility)
      console.log('🏋️ Analyzing weekly workout performance...');
      results.workouts.performance = await workoutService.analyzeWeeklyPerformance(targetWeekStart, targetWeekEnd);
      console.log(`Found ${results.workouts.performance.total_sessions} workouts: ${results.workouts.performance.yoga_sessions} yoga, ${results.workouts.performance.lifting_sessions} lifting`);

      // Step 3: Check violations using Notion formula results
      console.log('⚠️ Checking violations from Weekly Habits formulas...');
      const violations = await this.processWeeklyHabitsViolations(weeklyHabits);
      results.punishments.weekly_violations = violations;

      // Step 4: Process violations into punishments using new formula-based logic
      if (results.punishments.weekly_violations.length > 0) {
        console.log(`⚖️ Processing ${results.punishments.weekly_violations.length} weekly violation(s)...`);
        const weeklyPunishments = await this.processFormulaDrivenViolations(weeklyHabits);
        results.punishments.weekly_punishments = weeklyPunishments;
      }

      // Step 5: Finalize weekly habits entry
      console.log('🏁 Finalizing weekly habits entry...');
      await habitsService.finalizeWeeklyHabits();

      // Step 6: Generate summary
      results.summary = this.generateWeeklySummary(results);

      console.log(`✅ Weekly reconciliation complete for ${targetWeekStart}`);
      console.log(`📊 Summary: ${results.summary}`);

      return results;

    } catch (error) {
      console.error('❌ Weekly reconciliation failed:', error);
      throw error;
    }
  }

  // Collect all weekly habit data and update Weekly Habits database
  async collectAndUpdateWeeklyHabits(weekStart, weekEnd) {
    try {
      console.log(`📊 Collecting weekly habit data for ${weekStart} to ${weekEnd}`);

      // Get or create current week entry
      const currentWeekHabits = await habitsService.getCurrentWeekHabits();

      // 1. Count workouts (yoga/lifting)
      const workoutPerformance = await workoutService.analyzeWeeklyPerformance(weekStart, weekEnd);
      await habitsService.setCurrentWeekProgress('yoga', workoutPerformance.yoga_sessions);
      await habitsService.setCurrentWeekProgress('lifting', workoutPerformance.lifting_sessions);

      // 2. Count job applications
      const jobAppsData = await notionService.getJobApplicationsCountSinceMonday();
      await habitsService.setCurrentWeekProgress('job_applications', jobAppsData.count);

      // 3. Count location-based habits from Location Tracking database
      const locationCounts = await this.countLocationHabits(weekStart, weekEnd);
      await habitsService.setCurrentWeekProgress('office', locationCounts.officeDays);
      await habitsService.setCurrentWeekProgress('cowork', locationCounts.coworkDays);
      // Note: Gym is tracked in location but not in habits database per your schema

      // 4. Count Uber earnings
      const uberEarnings = await this.countUberEarnings(weekStart, weekEnd);
      await habitsService.setCurrentWeekProgress('uber_earnings', uberEarnings);

      // Get final updated week with formula calculations
      const finalWeekHabits = await habitsService.getCurrentWeekHabits();
      
      console.log(`✅ Weekly habits updated:`, {
        yoga: workoutPerformance.yoga_sessions,
        lifting: workoutPerformance.lifting_sessions,
        jobApplications: jobAppsData.count,
        officeDays: locationCounts.officeDays,
        coworkDays: locationCounts.coworkDays,
        gymDays: locationCounts.gymDays,
        uberEarnings: uberEarnings,
        complianceRate: finalWeekHabits.complianceRate,
        totalViolations: finalWeekHabits.totalViolations
      });

      return {
        weekly_counts: {
          yoga_sessions: workoutPerformance.yoga_sessions,
          lifting_sessions: workoutPerformance.lifting_sessions,
          job_applications: jobAppsData.count,
          office_days: locationCounts.officeDays,
          cowork_days: locationCounts.coworkDays,
          gym_days: locationCounts.gymDays,
          uber_earnings: uberEarnings
        },
        compliance_rate: finalWeekHabits.complianceRate,
        total_violations: finalWeekHabits.totalViolations,
        violation_details: finalWeekHabits.violationDetails
      };

    } catch (error) {
      console.error('❌ Error collecting weekly habits:', error);
      throw error;
    }
  }

  // Count location-based habits from Location Tracking database
  async countLocationHabits(weekStart, weekEnd) {
    try {
      console.log(`📍 Counting location habits for ${weekStart} to ${weekEnd}`);

      // Use the dedicated Location Tracking service
      const locationData = await locationTrackingService.countLocationHabitsForDateRange(weekStart, weekEnd);

      return { 
        officeDays: locationData.officeDays, 
        coworkDays: locationData.coworkDays, 
        gymDays: locationData.gymDays 
      };

    } catch (error) {
      console.error('❌ Error counting location habits:', error);
      return { officeDays: 0, coworkDays: 0, gymDays: 0 };
    }
  }

  // Count Uber earnings from Uber Earnings database
  async countUberEarnings(weekStart, weekEnd) {
    try {
      console.log(`🚗 Counting Uber earnings for ${weekStart} to ${weekEnd}`);

      // Use the dedicated Uber Earnings service
      const totalEarnings = await uberEarningsService.getEarningsForDateRange(weekStart, weekEnd);

      return totalEarnings;

    } catch (error) {
      console.error('❌ Error counting Uber earnings:', error);
      return 0;
    }
  }

  // Process violations based on Weekly Habits formula results
  async processWeeklyHabitsViolations(weeklyHabits) {
    const violations = [];

    if (weeklyHabits.total_violations > 0) {
      violations.push({
        type: 'weekly_habits_violations',
        reason: weeklyHabits.violation_details || `${weeklyHabits.total_violations} habit violations detected`,
        severity: 'weekly_violation',
        category: 'habits_violation',
        violation_count: weeklyHabits.total_violations,
        compliance_rate: weeklyHabits.compliance_rate
      });
    }

    return violations;
  }

  // Process violations with 3-route punishment system
  async processFormulaDrivenViolations(weeklyHabits) {
    try {
      if (weeklyHabits.total_violations > 0) {
        console.log(`⚖️ Processing ${weeklyHabits.total_violations} violations with 3-route system`);

        // Prepare violation data for 3-route system
        const violationData = {
          totalViolations: weeklyHabits.total_violations,
          violationDetails: weeklyHabits.violation_details,
          weekStart: weeklyHabits.weekly_counts?.week_start || format(startOfWeek(subWeeks(new Date(), 1)), 'yyyy-MM-dd'),
          weekEnd: weeklyHabits.weekly_counts?.week_end || format(endOfWeek(subWeeks(new Date(), 1)), 'yyyy-MM-dd'),
          habitCounts: weeklyHabits.weekly_counts,
          complianceRate: weeklyHabits.compliance_rate
        };

        // Use the 3-route punishment system
        const punishmentResult = await punishmentService.assignWeeklyViolationPunishments(violationData);

        console.log(`✅ 3-route system assigned ${punishmentResult.assignmentsCreated} punishments: ${punishmentResult.assignments.map(a => `Route ${a.route}`).join(', ')}`);

        return punishmentResult.assignments;
      }

    } catch (error) {
      console.error('Error processing 3-route violations:', error);
    }

    return [];
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

    // Overall compliance
    if (results.habits.compliance_rate !== undefined) {
      const compliancePercent = Math.round(results.habits.compliance_rate * 100);
      summaryParts.push(`Weekly compliance: ${compliancePercent}%.`);
    }

    // Habit counts
    const counts = results.habits.weekly_counts;
    if (counts) {
      const habitSummary = [];
      if (counts.yoga_sessions) habitSummary.push(`${counts.yoga_sessions} yoga`);
      if (counts.lifting_sessions) habitSummary.push(`${counts.lifting_sessions} lifting`);
      if (counts.job_applications) habitSummary.push(`${counts.job_applications} job apps`);
      if (counts.office_days) habitSummary.push(`${counts.office_days} office days`);
      if (counts.cowork_days) habitSummary.push(`${counts.cowork_days} cowork days`);
      if (counts.uber_earnings) habitSummary.push(`$${counts.uber_earnings} Uber earnings`);
      
      if (habitSummary.length > 0) {
        summaryParts.push(`Completed: ${habitSummary.join(', ')}.`);
      }
    }

    // Violations
    if (results.habits.total_violations > 0) {
      summaryParts.push(`${results.habits.total_violations} habit violation(s): ${results.habits.violation_details}`);
    } else {
      summaryParts.push('No habit violations.');
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