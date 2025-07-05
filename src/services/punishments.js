const { format, isPast, parseISO, differenceInDays } = require('date-fns');
const notionService = require('./notion');
const rulesService = require('./rules');
const habiticaService = require('./habitica');

class PunishmentService {
  // Check for overdue punishment assignments
  async checkOverduePunishments(currentDate) {
    const pendingPunishments = await notionService.getPendingPunishments();
    const overdueResults = [];

    for (const punishment of pendingPunishments) {
      const dueDate = punishment.properties['Due Date']?.date?.start;
      const punishmentName = punishment.properties.Name.title[0]?.text?.content || 'Unnamed punishment';
      
      if (dueDate) {
        // Check if punishment is past due date
        if (dueDate < currentDate) {
          // Mark as missed and create debt
          await notionService.updatePunishmentStatus(punishment.id, 'missed');
          
          overdueResults.push({
            punishment_id: punishment.id,
            name: punishmentName,
            due_date: dueDate,
            status: 'missed',
            debt_created: true
          });
        }
      }
    }

    return overdueResults;
  }

  // Check if today's cardio assignments were completed
  async checkTodaysPunishmentCompletion(date) {
    const todaysWorkouts = await notionService.getTodaysWorkouts(date);
    const pendingPunishments = await notionService.getPendingPunishments();
    const completions = [];

    // Look for cardio workouts that might satisfy punishment assignments
    const cardioWorkouts = todaysWorkouts.filter(workout => 
      workout.properties['Workout Type'].select?.name === 'Cardio'
    );

    for (const punishment of pendingPunishments) {
      const assignedDate = punishment.properties['Date Assigned'].date?.start;
      const dueDate = punishment.properties['Due Date']?.date?.start;
      const requiredMinutes = punishment.properties['Minutes Required'].number;
      const punishmentType = punishment.properties.Type.select?.name;
      
      // If punishment is due today or earlier and we're checking today
      if (dueDate && dueDate <= date) {
        // Check if there's a cardio workout that could satisfy this
        const satisfyingWorkout = cardioWorkouts.find(workout => {
          const duration = workout.properties.Duration.number;
          return duration && duration >= requiredMinutes;
        });

        if (satisfyingWorkout) {
          // Mark punishment as completed
          await notionService.updatePunishmentStatus(punishment.id, 'completed', date);
          
          completions.push({
            punishment_id: punishment.id,
            name: punishment.properties.Name.title[0]?.text?.content || 'Unnamed punishment',
            type: punishmentType,
            required_minutes: requiredMinutes,
            completed_date: date
          });
        }
      }
    }

    return completions;
  }

  // Create new punishment assignment with Habitica integration
  async assignPunishment(reason, type = null, minutes = null) {
    const today = format(new Date(), 'yyyy-MM-dd');
    // Due date is 2 days from assignment (gives grace period)
    const dueDate = format(new Date(Date.now() + 2 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd');
    
    // Get punishment values from rules if not specified
    const punishmentMinutes = minutes || await rulesService.getNumericValue('cardio_punishment_minutes');
    const punishmentType = type || this.getRandomPunishmentType();
    
    const punishmentData = {
      name: `${reason} - ${today}`,
      type: punishmentType,
      minutes: punishmentMinutes,
      dateAssigned: today,
      dueDate: dueDate
    };

    // Create punishment in Notion
    const newPunishment = await notionService.createPunishment(punishmentData);
    
    // Create corresponding todo in Habitica
    const habiticaResult = await habiticaService.createCardioPunishmentTodo({
      type: punishmentType,
      minutes: punishmentMinutes,
      reason: reason,
      due_date: dueDate
    });

    const result = {
      punishment_id: newPunishment.id,
      type: punishmentType,
      minutes: punishmentMinutes,
      reason: reason,
      assigned_date: today,
      due_date: dueDate,
      habitica_integration: habiticaResult
    };

    return result;
  }

  // Check for violations that should result in punishment based on rules
  async checkForViolations(date) {
    const violations = [];
    const today = format(new Date(), 'yyyy-MM-dd');

    // Only check for violations if we're processing today's reconciliation
    if (date !== today) {
      return violations;
    }

    // Get punishable expectations from rules
    const punishableExpectations = await rulesService.getPunishableExpectations();

    // Check each punishable expectation
    for (const [ruleName, rule] of Object.entries(punishableExpectations)) {
      
      if (ruleName === 'weekly_yoga_minimum' && rule.frequency === 'weekly') {
        // This would be checked at end of week, not daily
        continue;
      }

      // Check for missed morning check-in (daily expectation)
      if (ruleName.includes('checkin') || ruleName.includes('morning')) {
        const morningCheckin = await notionService.getMorningCheckin(date);
        if (!morningCheckin) {
          // Check if we already assigned a punishment for missed check-in today
          const existingPunishments = await notionService.getPendingPunishments();
          const alreadyAssignedToday = existingPunishments.some(punishment => {
            const assignedDate = punishment.properties['Date Assigned'].date?.start;
            const punishmentName = punishment.properties.Name.title[0]?.text?.content || '';
            return assignedDate === date && punishmentName.includes('check-in');
          });

          if (!alreadyAssignedToday) {
            violations.push({
              type: 'missed_checkin',
              reason: 'Missed morning check-in',
              punishment_type: 'treadmill'
            });
          }
        }
      }

      // Add other daily punishable violation checks here
      // - Skipped planned workout
      // - Late check-in (would need timestamp analysis)
      // etc.
    }

    return violations;
  }

  // Check for weekly punishable violations (called at end of week)
  async checkWeeklyViolations(weekStart, weekEnd) {
    const violations = [];
    const punishableExpectations = await rulesService.getPunishableExpectations();

    for (const [ruleName, rule] of Object.entries(punishableExpectations)) {
      if (rule.frequency === 'weekly') {
        
        if (ruleName === 'weekly_yoga_minimum') {
          // Check if yoga minimum was met this week
          const yogaMinimum = await rulesService.getNumericValue('weekly_yoga_minimum');
          // TODO: Count yoga sessions for the week
          // const yogaCount = await this.getYogaSessionsCount(weekStart, weekEnd);
          // if (yogaCount < yogaMinimum) {
          //   violations.push({
          //     type: 'weekly_yoga_shortfall',
          //     reason: `Only completed ${yogaCount}/${yogaMinimum} yoga sessions this week`,
          //     punishment_type: this.getRandomPunishmentType()
          //   });
          // }
        }

        // Add other weekly punishable violations here
      }
    }

    return violations;
  }

  // Get random punishment type for variety
  getRandomPunishmentType() {
    const types = ['bike', 'treadmill', 'run', 'stairstepper'];
    return types[Math.floor(Math.random() * types.length)];
  }

  // Process all violations and assign punishments
  async processViolations(violations) {
    const assignments = [];

    for (const violation of violations) {
      const assignment = await this.assignPunishment(
        violation.reason,
        violation.punishment_type
      );
      assignments.push(assignment);
    }

    return assignments;
  }

  // Complete a punishment and mark Habitica todo as done
  async completePunishment(punishmentId, habiticaTaskId = null) {
    try {
      // Mark as completed in Notion
      const today = format(new Date(), 'yyyy-MM-dd');
      await notionService.updatePunishmentStatus(punishmentId, 'completed', today);

      // Complete Habitica todo if task ID provided
      if (habiticaTaskId) {
        await habiticaService.completeCardioPunishmentTodo(habiticaTaskId);
      }

      return { success: true };
    } catch (error) {
      console.error('Error completing punishment:', error);
      return { success: false, error: error.message };
    }
  }
}

module.exports = new PunishmentService();