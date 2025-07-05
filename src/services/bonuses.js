const { format, startOfWeek } = require('date-fns');
const notionService = require('./notion');
const rulesService = require('./rules');

class BonusService {
  // Check for workout bonuses earned today (per occurrence bonuses)
  async checkWorkoutBonuses(date) {
    const workouts = await notionService.getTodaysWorkouts(date);
    const bonuses = [];
    const weekOf = format(startOfWeek(new Date(date)), 'yyyy-MM-dd');

    // Get per occurrence bonus rules
    const perOccurrenceRules = await rulesService.getPerOccurrenceRules();
    
    for (const workout of workouts) {
      const workoutType = workout.properties['Workout Type'].select?.name;

      switch (workoutType) {
        case 'Lifting':
          if (perOccurrenceRules['lifting_bonus_amount']) {
            const amount = await rulesService.getNumericValue('lifting_bonus_amount');
            bonuses.push({
              type: 'Lifting',
              amount: amount,
              name: `Lifting Session - ${date}`,
              weekOf: weekOf,
              reason: 'Completed lifting workout'
            });
          }
          break;
        
        case 'Yoga':
          if (perOccurrenceRules['extra_yoga_bonus_amount']) {
            const amount = await rulesService.getNumericValue('extra_yoga_bonus_amount');
            bonuses.push({
              type: 'Yoga',
              amount: amount,
              name: `Yoga Session - ${date}`,
              weekOf: weekOf,
              reason: 'Completed yoga session'
            });
          }
          break;
        
        case 'Cardio':
          // Cardio doesn't earn bonuses unless it's punishment completion
          break;
      }
    }

    return bonuses;
  }

  // Create Uber earnings match bonus (if debt-free)
  async createUberMatchBonus(uberEarnings, date) {
    const weekOf = format(startOfWeek(new Date(date)), 'yyyy-MM-dd');
    
    return {
      type: 'Uber Match',
      amount: uberEarnings,
      name: `Uber Earnings Match - ${date}`,
      weekOf: weekOf,
      reason: `Earned ${uberEarnings} in Uber deliveries`
    };
  }

  // Create base weekly allowance bonus
  async createWeeklyAllowance(date) {
    const weekOf = format(startOfWeek(new Date(date)), 'yyyy-MM-dd');
    const allowanceAmount = await rulesService.getWeeklyBaseAllowance();
    
    return {
      type: 'Base Allowance',
      amount: allowanceAmount,
      name: `Weekly Allowance - Week of ${weekOf}`,
      weekOf: weekOf,
      reason: 'Weekly base allowance'
    };
  }

  // Create discretionary "good boy" bonus
  async createGoodBoyBonus(amount, reason, date) {
    const weekOf = format(startOfWeek(new Date(date)), 'yyyy-MM-dd');
    
    return {
      type: 'Good Boy',
      amount: amount,
      name: `Good Boy Bonus - ${date}`,
      weekOf: weekOf,
      reason: reason
    };
  }

  // Award bonuses by creating entries in Notion
  async awardBonuses(bonuses) {
    const awarded = [];

    for (const bonus of bonuses) {
      try {
        const createdBonus = await notionService.createBonus(bonus);
        awarded.push({
          bonus_id: createdBonus.id,
          type: bonus.type,
          amount: bonus.amount,
          reason: bonus.reason
        });
      } catch (error) {
        console.error('Error creating bonus:', error);
        // Continue with other bonuses even if one fails
      }
    }

    return awarded;
  }

  // Calculate total bonuses for today
  getTotalBonusAmount(bonuses) {
    return bonuses.reduce((total, bonus) => total + bonus.amount, 0);
  }

  // Check for weekly performance bonuses (end of week)
  async checkWeeklyBonuses(weekStart) {
    const bonuses = [];
    
    // Get weekly bonus rules
    const weeklyRules = await rulesService.getWeeklyRules();
    const weeklyExpectations = {};
    
    // Separate bonus rules from expectation rules
    for (const [key, rule] of Object.entries(weeklyRules)) {
      if (rule.type === 'expectation') {
        weeklyExpectations[key] = rule;
      }
    }

    // Check each weekly bonus against its corresponding expectation
    if (weeklyRules['perfect_week_bonus']) {
      // TODO: Check if 3 yoga + 3 lifting completed this week
      // const perfectWeekMet = await this.checkPerfectWeek(weekStart);
      // if (perfectWeekMet) { bonuses.push(...) }
    }

    if (weeklyRules['job_applications_bonus'] && weeklyExpectations['job_applications_minimum']) {
      // TODO: Check job applications from Habitica or external source
      // const jobAppsCount = await this.getJobApplicationsCount(weekStart);
      // const minimum = await rulesService.getNumericValue('job_applications_minimum');
      // if (jobAppsCount >= minimum) { bonuses.push(...) }
    }

    if (weeklyRules['algoexpert_problems_bonus'] && weeklyExpectations['algoexpert_problems_minimum']) {
      // TODO: Check AlgoExpert progress from Habitica
      // const problemsCount = await this.getAlgoExpertProblemsCount(weekStart);
      // const minimum = await rulesService.getNumericValue('algoexpert_problems_minimum');
      // if (problemsCount >= minimum) { bonuses.push(...) }
    }

    if (weeklyRules['office_attendance_bonus'] && weeklyExpectations['office_attendance_minimum']) {
      // TODO: Check office attendance from Habitica
      // const daysCount = await this.getOfficeAttendanceCount(weekStart);
      // const minimum = await rulesService.getNumericValue('office_attendance_minimum');
      // if (daysCount >= minimum) { bonuses.push(...) }
    }

    // Per occurrence bonuses that are weekly tracked
    if (weeklyRules['reading_bonus']) {
      // TODO: Check for completed books this week
      // const booksCompleted = await this.getBooksCompletedCount(weekStart);
      // for each book, add reading bonus
    }

    if (weeklyRules['dating_bonus']) {
      // TODO: Check for dates attended this week
      // const datesCount = await this.getDatesCount(weekStart);
      // for each date, add dating bonus
    }

    return bonuses;
  }
}

module.exports = new BonusService();