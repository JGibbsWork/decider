const { format, startOfWeek, endOfWeek, subWeeks } = require('date-fns');

// Import domain services
const workoutService = require('../core/workouts');
const punishmentService = require('../core/punishments');
const notionService = require('../integrations/notion');

// Import legacy services - these should be converted to core services eventually
const rulesService = require('../core/rules');
const habiticaService = require('../integrations/habitica');

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
        workouts: {
          performance: null,
          requirements_met: true,
          violations: []
        },
        punishments: {
          weekly_violations: [],
          weekly_punishments: []
        },
        habitica: {
          updates: []
        },
        summary: ''
      };

      // Step 1: Analyze weekly workout performance
      console.log('🏋️ Analyzing weekly workout performance...');
      results.workouts.performance = await workoutService.analyzeWeeklyPerformance(targetWeekStart, targetWeekEnd);
      console.log(`Found ${results.workouts.performance.total_sessions} workouts: ${results.workouts.performance.yoga_sessions} yoga, ${results.workouts.performance.lifting_sessions} lifting`);

      // Step 2: Check workout requirements and violations
      console.log('⚠️ Checking weekly workout requirements...');
      const workoutViolations = await this.checkWorkoutRequirements(results.workouts.performance);
      results.workouts.violations = workoutViolations;
      results.workouts.requirements_met = workoutViolations.length === 0;

      // Step 3: Check other weekly violations (Habitica-based) - DIRECT IMPLEMENTATION
      console.log('📋 Checking Habitica-based violations...');
      const habiticaViolations = await this.checkHabiticaViolations(targetWeekStart, targetWeekEnd);
      results.punishments.weekly_violations = [...workoutViolations, ...habiticaViolations];

      // Step 4: Process violations into punishments
      if (results.punishments.weekly_violations.length > 0) {
        console.log(`⚖️ Processing ${results.punishments.weekly_violations.length} weekly violation(s)...`);
        const weeklyPunishments = await this.processWeeklyViolations(results.punishments.weekly_violations);
        results.punishments.weekly_punishments = weeklyPunishments;
      }

      // Step 5: Update Habitica habits (optional) - DIRECT IMPLEMENTATION
      console.log('🎯 Updating Habitica habits...');
      results.habitica.updates = await this.updateHabiticaHabits(targetWeekStart, results.workouts.performance);

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

  // DIRECT IMPLEMENTATION - Check workout requirements
  async checkWorkoutRequirements(workoutPerformance) {
    const violations = [];
    
    try {
      // Check yoga minimum (using rules service for now)
      const yogaMinimum = await rulesService.getNumericValue('weekly_yoga_minimum') || 3;
      if (workoutPerformance.yoga_sessions < yogaMinimum) {
        violations.push({
          type: 'weekly_yoga_shortfall',
          reason: `Only completed ${workoutPerformance.yoga_sessions}/${yogaMinimum} yoga sessions this week`,
          severity: 'weekly_violation',
          category: 'workout_violation'
        });
      }

      // Optional: Could add lifting minimum, total workout minimums, etc.
      // const liftingMinimum = await rulesService.getNumericValue('weekly_lifting_minimum') || 2;
      // if (workoutPerformance.lifting_sessions < liftingMinimum) { ... }
      
    } catch (error) {
      console.error('Error checking workout requirements:', error);
    }

    return violations;
  }


  // DIRECT IMPLEMENTATION - Check Habitica violations
  async checkHabiticaViolations(weekStart, weekEnd) {
    const violations = [];
    
    try {
      // Check job applications shortfall
      const jobAppsCount = await this.getJobApplicationsCountFromHabitica();
      const jobAppsMinimum = await rulesService.getNumericValue('job_applications_minimum') || 25;
      
      if (jobAppsCount < jobAppsMinimum) {
        violations.push({
          type: 'job_applications_shortfall',
          reason: `Only completed ${jobAppsCount}/${jobAppsMinimum} job applications this week`,
          severity: 'weekly_violation',
          category: 'career_violation',
          recommended_punishment: '60_minute_cardio'
        });
      }

      // Check AlgoExpert problems shortfall
      const algoProblemsCount = await this.getAlgoExpertProblemsFromHabitica();
      const algoProblemsMinimum = await rulesService.getNumericValue('algoexpert_minimum') || 7;
      
      if (algoProblemsCount < algoProblemsMinimum) {
        violations.push({
          type: 'algoexpert_shortfall',
          reason: `Only completed ${algoProblemsCount}/${algoProblemsMinimum} AlgoExpert problems this week`,
          severity: 'weekly_violation',
          category: 'career_violation',
          recommended_punishment: '45_minute_cardio'
        });
      }

      // Check office attendance (if applicable)
      const officeAttendance = await this.getOfficeAttendanceFromHabitica();
      const officeMinimum = await rulesService.getNumericValue('office_attendance_minimum') || 3;
      
      if (officeAttendance < officeMinimum) {
        violations.push({
          type: 'office_attendance_shortfall',
          reason: `Only attended office ${officeAttendance}/${officeMinimum} days this week`,
          severity: 'weekly_violation',
          category: 'career_violation',
          recommended_punishment: '30_minute_cardio'
        });
      }

    } catch (error) {
      console.error('Error checking Habitica violations:', error);
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
          case 'job_applications_shortfall':
            punishmentMinutes = 60;
            break;
          case 'algoexpert_shortfall':
            punishmentMinutes = 45;
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

  // DIRECT IMPLEMENTATION - Update Habitica habits
  async updateHabiticaHabits(weekStart, workoutPerformance) {
    const updates = [];

    try {
      if (!habiticaService) {
        console.log('Habitica service not available, skipping habit updates');
        return updates;
      }

      // Update workout consistency habit
      const workoutConsistency = this.calculateWorkoutConsistency(workoutPerformance);
      if (workoutConsistency >= 0.8) {
        await habiticaService.scoreHabit('workout_consistency', 'up');
        updates.push({ habit: 'workout_consistency', direction: 'up', reason: 'Good workout consistency' });
      } else if (workoutConsistency < 0.5) {
        await habiticaService.scoreHabit('workout_consistency', 'down');
        updates.push({ habit: 'workout_consistency', direction: 'down', reason: 'Poor workout consistency' });
      }

      // Update discipline habit based on violations
      const hasViolations = workoutPerformance.yoga_sessions < 3;
      if (!hasViolations) {
        await habiticaService.scoreHabit('discipline', 'up');
        updates.push({ habit: 'discipline', direction: 'up', reason: 'No weekly violations' });
      } else {
        await habiticaService.scoreHabit('discipline', 'down');
        updates.push({ habit: 'discipline', direction: 'down', reason: 'Had weekly violations' });
      }

    } catch (error) {
      console.error('Error updating Habitica habits:', error);
    }

    return updates;
  }

  // Helper method to calculate workout consistency
  calculateWorkoutConsistency(workoutPerformance) {
    const expectedTotal = 6; // 3 yoga + 3 lifting per week
    const actualTotal = workoutPerformance.yoga_sessions + workoutPerformance.lifting_sessions;
    return Math.min(actualTotal / expectedTotal, 1.0);
  }

  // Habitica integration methods - DIRECT IMPLEMENTATION
  async getJobApplicationsCountFromHabitica() {
    try {
      if (!habiticaService) return 0;
      return await habiticaService.getTodoCompletionCount('job_applications') || 0;
    } catch (error) {
      console.error('Error getting job applications count:', error);
      return 0;
    }
  }

  async getAlgoExpertProblemsFromHabitica() {
    try {
      if (!habiticaService) return 0;
      return await habiticaService.getTodoCompletionCount('algoexpert_problems') || 0;
    } catch (error) {
      console.error('Error getting AlgoExpert problems count:', error);
      return 0;
    }
  }

  async getOfficeAttendanceFromHabitica() {
    try {
      if (!habiticaService) return 0;
      return await habiticaService.getDailyCompletionCount('office_attendance') || 0;
    } catch (error) {
      console.error('Error getting office attendance count:', error);
      return 0;
    }
  }

  // Generate weekly summary
  generateWeeklySummary(results) {
    const summaryParts = [];

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
      
      const status = {
        week_start: targetWeekStart,
        week_end: targetWeekEnd,
        workout_performance: await workoutService.analyzeWeeklyPerformance(targetWeekStart, targetWeekEnd),
        habitica_status: {
          job_applications: await this.getJobApplicationsCountFromHabitica(),
          algoexpert_problems: await this.getAlgoExpertProblemsFromHabitica(),
          office_attendance: await this.getOfficeAttendanceFromHabitica()
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