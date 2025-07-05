const { format, startOfWeek, endOfWeek, subWeeks } = require('date-fns');
const notionService = require('./notion');
const rulesService = require('./rules');
const bonusService = require('./bonuses');
const punishmentService = require('./punishments');
const habiticaService = require('./habitica');

class WeeklyReconciliationService {
  
  // Run complete weekly reconciliation
  async runWeeklyReconciliation(weekStartDate = null) {
    try {
      // Default to last Sunday if no date provided
      const targetWeekStart = weekStartDate || format(startOfWeek(subWeeks(new Date(), 1)), 'yyyy-MM-dd');
      const targetWeekEnd = format(endOfWeek(new Date(targetWeekStart)), 'yyyy-MM-dd');
      
      console.log(`Running weekly reconciliation for week ${targetWeekStart} to ${targetWeekEnd}`);

      const results = {
        week_start: targetWeekStart,
        week_end: targetWeekEnd,
        weekly_bonuses: [],
        weekly_violations: [],
        weekly_punishments: [],
        habitica_updates: [],
        summary: ''
      };

      // Step 1: Award weekly base allowance if not already done
      const baseAllowance = await bonusService.awardWeeklyAllowanceIfNeeded(targetWeekStart);
      if (baseAllowance) {
        results.weekly_bonuses.push(baseAllowance);
      }

      // Step 2: Check workout performance for the week
      const workoutPerformance = await this.checkWeeklyWorkoutPerformance(targetWeekStart, targetWeekEnd);
      
      // Step 3: Check weekly bonuses based on performance
      const weeklyBonuses = await this.checkWeeklyBonuses(targetWeekStart, targetWeekEnd, workoutPerformance);
      results.weekly_bonuses.push(...weeklyBonuses);

      // Step 4: Check for weekly punishable violations
      const weeklyViolations = await this.checkWeeklyViolations(targetWeekStart, targetWeekEnd, workoutPerformance);
      results.weekly_violations = weeklyViolations;

      // Step 5: Process violations into punishments
      if (weeklyViolations.length > 0) {
        const weeklyPunishments = await punishmentService.processViolations(weeklyViolations);
        results.weekly_punishments = weeklyPunishments;
      }

      // Step 6: Award additional weekly bonuses in Notion (base allowance already awarded in step 1)
      const additionalBonuses = results.weekly_bonuses.filter(bonus => bonus.type !== 'Base Allowance');
      if (additionalBonuses.length > 0) {
        const awardedBonuses = await bonusService.awardBonuses(additionalBonuses);
        // Replace the non-base-allowance bonuses with awarded versions
        results.weekly_bonuses = [
          ...results.weekly_bonuses.filter(bonus => bonus.type === 'Base Allowance'),
          ...awardedBonuses
        ];
      }

      // Step 7: Update Habitica habits (future implementation)
      // results.habitica_updates = await this.updateHabiticaHabits(targetWeekStart, targetWeekEnd);

      // Step 8: Generate summary
      results.summary = this.generateWeeklySummary(results);

      console.log('Weekly reconciliation complete');
      return results;

    } catch (error) {
      console.error('Weekly reconciliation error:', error);
      throw error;
    }
  }

  // Check workout performance for the week
  async checkWeeklyWorkoutPerformance(weekStart, weekEnd) {
    try {
      // Get all workouts for the week
      const workouts = await this.getWorkoutsForWeek(weekStart, weekEnd);
      
      const performance = {
        yoga_sessions: 0,
        lifting_sessions: 0,
        cardio_sessions: 0,
        total_sessions: workouts.length,
        workouts: workouts
      };

      // Count workout types
      for (const workout of workouts) {
        const workoutType = workout.properties['Workout Type'].select?.name;
        switch (workoutType) {
          case 'Yoga':
            performance.yoga_sessions++;
            break;
          case 'Lifting':
            performance.lifting_sessions++;
            break;
          case 'Cardio':
            performance.cardio_sessions++;
            break;
        }
      }

      console.log(`Weekly workout performance: ${performance.yoga_sessions} yoga, ${performance.lifting_sessions} lifting, ${performance.cardio_sessions} cardio`);
      return performance;

    } catch (error) {
      console.error('Error checking weekly workout performance:', error);
      return { yoga_sessions: 0, lifting_sessions: 0, cardio_sessions: 0, total_sessions: 0, workouts: [] };
    }
  }

  // Get all workouts for a given week
  async getWorkoutsForWeek(weekStart, weekEnd) {
    try {
      // Query workouts database for the week
      const response = await notionService.notion.databases.query({
        database_id: '227e3d1e-e83a-8031-a938-e62cedf82f83', // WORKOUTS database
        filter: {
          and: [
            {
              property: 'Date',
              date: {
                on_or_after: weekStart
              }
            },
            {
              property: 'Date',
              date: {
                on_or_before: weekEnd
              }
            }
          ]
        }
      });

      return response.results;
    } catch (error) {
      console.error('Error fetching workouts for week:', error);
      return [];
    }
  }

  // Check for weekly bonuses
  async checkWeeklyBonuses(weekStart, weekEnd, workoutPerformance) {
    const bonuses = [];
    const weeklyRules = await rulesService.getWeeklyRules();

    // Check Perfect Week bonus (3 yoga + 3 lifting)
    if (weeklyRules['perfect_week_bonus']) {
      const yogaMinimum = await rulesService.getNumericValue('weekly_yoga_minimum') || 3;
      const liftingMinimum = 3; // Could be configurable in rules later
      
      if (workoutPerformance.yoga_sessions >= yogaMinimum && workoutPerformance.lifting_sessions >= liftingMinimum) {
        const bonusAmount = await rulesService.getNumericValue('perfect_week_bonus');
        bonuses.push({
          type: 'Perfect Week',
          amount: bonusAmount,
          name: `Perfect Week Bonus - ${weekStart}`,
          weekOf: weekStart,
          reason: `Completed ${workoutPerformance.yoga_sessions} yoga + ${workoutPerformance.lifting_sessions} lifting sessions`
        });
      }
    }

    // Check Job Applications bonus via Habitica
    if (weeklyRules['job_applications_bonus']) {
      const jobAppsCount = await this.getJobApplicationsCountFromHabitica(weekStart, weekEnd);
      const minimum = await rulesService.getNumericValue('job_applications_minimum');
      
      if (jobAppsCount >= minimum) {
        const bonusAmount = await rulesService.getNumericValue('job_applications_bonus');
        bonuses.push({
          type: 'Job Applications',
          amount: bonusAmount,
          name: `Job Applications Bonus - ${weekStart}`,
          weekOf: weekStart,
          reason: `Completed ${jobAppsCount} job applications (minimum: ${minimum})`
        });
      }
    }

    // Check AlgoExpert problems bonus via Habitica
    if (weeklyRules['algoexpert_problems_bonus']) {
      const problemsCount = await this.getAlgoExpertProblemsFromHabitica(weekStart, weekEnd);
      const minimum = await rulesService.getNumericValue('algoexpert_problems_minimum');
      
      if (problemsCount >= minimum) {
        const bonusAmount = await rulesService.getNumericValue('algoexpert_problems_bonus');
        bonuses.push({
          type: 'AlgoExpert',
          amount: bonusAmount,
          name: `AlgoExpert Bonus - ${weekStart}`,
          weekOf: weekStart,
          reason: `Completed ${problemsCount} AlgoExpert problems (minimum: ${minimum})`
        });
      }
    }

    // Check Office Attendance bonus via Habitica
    if (weeklyRules['office_attendance_bonus']) {
      const attendanceCount = await this.getOfficeAttendanceFromHabitica(weekStart, weekEnd);
      const minimum = await rulesService.getNumericValue('office_attendance_minimum');
      
      if (attendanceCount >= minimum) {
        const bonusAmount = await rulesService.getNumericValue('office_attendance_bonus');
        bonuses.push({
          type: 'Office Attendance',
          amount: bonusAmount,
          name: `Office Attendance Bonus - ${weekStart}`,
          weekOf: weekStart,
          reason: `Attended office ${attendanceCount} days (minimum: ${minimum})`
        });
      }
    }

    // TODO: Handle reading and dating bonuses (manual tracking for now)
    // These might need different data sources or manual input

    return bonuses;
  }

  // Check for weekly violations
  async checkWeeklyViolations(weekStart, weekEnd, workoutPerformance) {
    const violations = [];
    const punishableExpectations = await rulesService.getPunishableExpectations();

    // Check each weekly punishable expectation
    for (const [ruleName, rule] of Object.entries(punishableExpectations)) {
      if (rule.frequency === 'weekly') {
        
        if (ruleName === 'weekly_yoga_minimum') {
          const yogaMinimum = await rulesService.getNumericValue('weekly_yoga_minimum');
          if (workoutPerformance.yoga_sessions < yogaMinimum) {
            violations.push({
              type: 'weekly_yoga_shortfall',
              reason: `Only completed ${workoutPerformance.yoga_sessions}/${yogaMinimum} yoga sessions this week`,
              punishment_type: punishmentService.getRandomPunishmentType(),
              severity: 'weekly_violation'
            });
          }
        }

        // Add other weekly punishable expectations here
        // Office attendance, etc.
      }
    }

    return violations;
  }

  // Update Habitica habits based on weekly performance
  async updateHabiticaHabits(weekStart, weekEnd) {
    const updates = [];
    
    try {
      // Initialize habits if they don't exist
      const habitResults = await habiticaService.initializeWeeklyHabits();
      
      // TODO: Score habits based on weekly performance
      // - Job applications completed
      // - Office days attended  
      // - AlgoExpert problems solved
      
      updates.push(...habitResults);
      
    } catch (error) {
      console.error('Error updating Habitica habits:', error);
    }

    return updates;
  }

  // Generate weekly summary
  generateWeeklySummary(results) {
    const summaryParts = [];

    // Weekly bonuses
    if (results.weekly_bonuses.length > 0) {
      const totalBonuses = results.weekly_bonuses.reduce((sum, bonus) => sum + bonus.amount, 0);
      summaryParts.push(`Earned $${totalBonuses} in weekly bonuses.`);
    } else {
      summaryParts.push(`No weekly bonuses earned.`);
    }

    // Weekly violations
    if (results.weekly_violations.length > 0) {
      summaryParts.push(`${results.weekly_violations.length} weekly violation(s) detected.`);
    }

    // Weekly punishments
    if (results.weekly_punishments.length > 0) {
      const totalMinutes = results.weekly_punishments.reduce((sum, punishment) => sum + punishment.minutes, 0);
      summaryParts.push(`Assigned ${totalMinutes} minutes of cardio punishment for weekly violations.`);
    }

    return summaryParts.length > 0 ? summaryParts.join(' ') : 'No significant weekly activity.';
  }

  // Get job applications count from Habitica habit
  async getJobApplicationsCountFromHabitica(weekStart, weekEnd) {
    try {
      // Get the habit data from Habitica
      const habits = await habiticaService.getHabits();
      const jobAppsHabit = habits.find(habit => 
        habit.text.includes('Job Applications') && habit.text.includes('Weekly')
      );

      if (!jobAppsHabit) {
        console.log('Job Applications habit not found in Habitica');
        return 0;
      }

      // For now, we'll use the habit's history or counter
      // Habitica habits track positive/negative scores, not exact counts
      // This might need to be enhanced based on how you track in Habitica
      return jobAppsHabit.counterUp || 0;

    } catch (error) {
      console.error('Error getting job applications from Habitica:', error);
      return 0;
    }
  }

  // Get AlgoExpert problems count from Habitica habit  
  async getAlgoExpertProblemsFromHabitica(weekStart, weekEnd) {
    try {
      const habits = await habiticaService.getHabits();
      const algoHabit = habits.find(habit => 
        habit.text.includes('AlgoExpert') && habit.text.includes('Weekly')
      );

      if (!algoHabit) {
        console.log('AlgoExpert habit not found in Habitica');
        return 0;
      }

      return algoHabit.counterUp || 0;

    } catch (error) {
      console.error('Error getting AlgoExpert problems from Habitica:', error);
      return 0;
    }
  }

  // Get office attendance count from Habitica habit
  async getOfficeAttendanceFromHabitica(weekStart, weekEnd) {
    try {
      const habits = await habiticaService.getHabits();
      const officeHabit = habits.find(habit => 
        habit.text.includes('Office Attendance') && habit.text.includes('Weekly')
      );

      if (!officeHabit) {
        console.log('Office Attendance habit not found in Habitica');
        return 0;
      }

      return officeHabit.counterUp || 0;

    } catch (error) {
      console.error('Error getting office attendance from Habitica:', error);
      return 0;
    }
  }
  async isWeekAlreadyProcessed(weekStart) {
    try {
      // Check if there are any weekly bonuses already awarded for this week
      const response = await notionService.notion.databases.query({
        database_id: '227e3d1e-e83a-80a4-949b-c62e6fc0c1d0', // BONUSES database
        filter: {
          and: [
            {
              property: 'Week Of',
              date: {
                equals: weekStart
              }
            },
            {
              or: [
                {
                  property: 'Bonus Type',
                  select: {
                    equals: 'Perfect Week'
                  }
                },
                {
                  property: 'Bonus Type',
                  select: {
                    equals: 'Job Applications'
                  }
                }
              ]
            }
          ]
        }
      });

      return response.results.length > 0;
    } catch (error) {
      console.error('Error checking if week already processed:', error);
      return false;
    }
  }
}

module.exports = new WeeklyReconciliationService();