const { format, startOfWeek, endOfWeek, subWeeks } = require('date-fns');

// Import domain services
const workoutService = require('../core/workouts');
const bonusService = require('../core/bonuses');
const punishmentService = require('../core/punishments');

// Import legacy services for now
const rulesService = require('../rules');
const habiticaService = require('../integrations/habitica/HabiticaService');

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
        bonuses: {
          weekly_bonuses: [],
          total_amount: 0
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

      // Step 3: Process weekly bonuses
      console.log('🎁 Processing weekly bonuses...');
      const bonusResults = await this.processWeeklyBonuses(targetWeekStart, results.workouts.performance);
      results.bonuses = bonusResults;

      // Step 4: Check other weekly violations (Habitica-based)
      console.log('📋 Checking Habitica-based violations...');
      const habiticaViolations = await this.checkHabiticaViolations(targetWeekStart, targetWeekEnd);
      results.punishments.weekly_violations = [...workoutViolations, ...habiticaViolations];

      // Step 5: Process violations into punishments
      if (results.punishments.weekly_violations.length > 0) {
        console.log(`⚖️ Processing ${results.punishments.weekly_violations.length} weekly violation(s)...`);
        const weeklyPunishments = await this.processWeeklyViolations(results.punishments.weekly_violations);
        results.punishments.weekly_punishments = weeklyPunishments;
      }

      // Step 6: Update Habitica habits (optional)
      console.log('🎯 Updating Habitica habits...');
      results.habitica.updates = await this.updateHabiticaHabits(targetWeekStart, results.workouts.performance);

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

  async checkWorkoutRequirements(workoutPerformance) {
    const violations = [];
    
    try {
      // Check yoga minimum
      const yogaMinimum = await rulesService.getNumericValue('weekly_yoga_minimum') || 3;
      if (workoutPerformance.yoga_sessions < yogaMinimum) {
        violations.push({
          type: 'weekly_yoga_shortfall',
          reason: `Only completed ${workoutPerformance.yoga_sessions}/${yogaMinimum} yoga sessions this week`,
          severity: 'weekly_violation',
          category: 'workout_violation'
        });
      }

      // Could add lifting minimum, total workout minimums, etc.
      
    } catch (error) {
      console.error('Error checking workout requirements:', error);
    }

    return violations;
  }

  async processWeeklyBonuses(weekStart, workoutPerformance) {
    try {
      const bonusResults = await bonusService.processWeeklyBonuses(weekStart, workoutPerformance);
      
      return {
        weekly_bonuses: bonusResults,
        total_amount: bonusResults.reduce((sum, bonus) => sum + (bonus.amount || 0), 0)
      };

    } catch (error) {
      console.error('Error processing weekly bonuses:', error);
      return { weekly_bonuses: [], total_amount: 0 };
    }
  }

  async checkHabiticaViolations(weekStart, weekEnd) {
    const violations = [];
    
    try {
      // Check job applications
      const jobAppsCount = await this.getJobApplicationsCountFromHabitica();
      const jobAppsMinimum = await rulesService.getNumericValue('job_applications_minimum') || 25;
      
      if (jobAppsCount < jobAppsMinimum) {
        violations.push({
          type: 'job_applications_shortfall',
          reason: `Only completed ${jobAppsCount}/${jobAppsMinimum} job applications this week`,
          severity: 'weekly_violation',
          category: 'career_violation'
        });
      }

      // Check AlgoExpert problems
      const algoProblemsCount = await this.getAlgoExpertProblemsFromHabitica();
      const algoMinimum = await rulesService.getNumericValue('algoexpert_problems_minimum') || 7;
      
      if (algoProblemsCount < algoMinimum) {
        violations.push({
          type: 'algoexpert_shortfall',
          reason: `Only completed ${algoProblemsCount}/${algoMinimum} AlgoExpert problems this week`,
          severity: 'weekly_violation',
          category: 'career_violation'
        });
      }

      // Check office attendance
      const officeCount = await this.getOfficeAttendanceFromHabitica();
      const officeMinimum = await rulesService.getNumericValue('office_attendance_minimum') || 4;
      
      if (officeCount < officeMinimum) {
        violations.push({
          type: 'office_attendance_shortfall',
          reason: `Only attended office ${officeCount}/${officeMinimum} days this week`,
          severity: 'weekly_violation',
          category: 'career_violation'
        });
      }

    } catch (error) {
      console.error('Error checking Habitica violations:', error);
    }

    return violations;
  }

  async processWeeklyViolations(violations) {
    const punishments = [];
    
    for (const violation of violations) {
      try {
        // Use the punishment service to assign punishment
        const punishment = await punishmentService.processNewViolations(violation.reason);
        punishments.push(...punishment);
      } catch (error) {
        console.error(`Error processing violation: ${violation.reason}`, error);
      }
    }

    return punishments;
  }

  async updateHabiticaHabits(weekStart, workoutPerformance) {
    const updates = [];
    
    try {
      // Initialize habits if they don't exist
      const habitResults = await habiticaService.initializeWeeklyHabits();
      updates.push(...habitResults);
      
      // Score habits based on performance (future enhancement)
      // Could score job apps, office attendance, etc.
      
    } catch (error) {
      console.error('Error updating Habitica habits:', error);
    }

    return updates;
  }

  // Habitica data retrieval methods
  async getJobApplicationsCountFromHabitica() {
    try {
      const habits = await habiticaService.getHabits();
      const jobAppsHabit = habits.find(habit => 
        habit.text.includes('Job Applications') && habit.text.includes('Weekly')
      );
      return jobAppsHabit?.counterUp || 0;
    } catch (error) {
      console.error('Error getting job applications count:', error);
      return 0;
    }
  }

  async getAlgoExpertProblemsFromHabitica() {
    try {
      const habits = await habiticaService.getHabits();
      const algoHabit = habits.find(habit => 
        habit.text.includes('AlgoExpert') && habit.text.includes('Weekly')
      );
      return algoHabit?.counterUp || 0;
    } catch (error) {
      console.error('Error getting AlgoExpert problems count:', error);
      return 0;
    }
  }

  async getOfficeAttendanceFromHabitica() {
    try {
      const habits = await habiticaService.getHabits();
      const officeHabit = habits.find(habit => 
        habit.text.includes('Office Attendance') && habit.text.includes('Weekly')
      );
      return officeHabit?.counterUp || 0;
    } catch (error) {
      console.error('Error getting office attendance count:', error);
      return 0;
    }
  }

  generateWeeklySummary(results) {
    const summaryParts = [];

    // Workout performance
    if (results.workouts.requirements_met) {
      summaryParts.push(`Met all workout requirements.`);
    } else {
      summaryParts.push(`${results.workouts.violations.length} workout violation(s).`);
    }

    // Bonuses
    if (results.bonuses.total_amount > 0) {
      summaryParts.push(`Earned $${results.bonuses.total_amount} in weekly bonuses.`);
    } else {
      summaryParts.push(`No weekly bonuses earned.`);
    }

    // Punishments
    if (results.punishments.weekly_punishments.length > 0) {
      const totalMinutes = results.punishments.weekly_punishments.reduce((sum, p) => 
        sum + (p.minutes || 0), 0
      );
      summaryParts.push(`Assigned ${totalMinutes} minutes of cardio punishment.`);
    }

    return summaryParts.length > 0 ? summaryParts.join(' ') : 'No significant weekly activity.';
  }

  // Get weekly status
  async getWeeklyStatus(weekStart = null) {
    try {
      const targetWeekStart = weekStart || format(startOfWeek(subWeeks(new Date(), 1)), 'yyyy-MM-dd');
      const targetWeekEnd = format(endOfWeek(new Date(targetWeekStart)), 'yyyy-MM-dd');
      
      const status = {
        week_start: targetWeekStart,
        week_end: targetWeekEnd,
        workout_performance: await workoutService.analyzeWeeklyPerformance(targetWeekStart, targetWeekEnd),
        bonus_summary: await bonusService.getBonusSummary(targetWeekStart),
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