const { format, isPast, parseISO } = require('date-fns');
const notionService = require('./notion');

class PunishmentService {
  // Check for overdue punishment assignments
  async checkOverduePunishments(currentDate) {
    const pendingPunishments = await notionService.getPendingPunishments();
    const overdueResults = [];

    for (const punishment of pendingPunishments) {
      const dateAssigned = punishment.properties['Date Assigned'].date?.start;
      const punishmentName = punishment.properties.Name.title[0]?.text?.content || 'Unnamed punishment';
      
      if (dateAssigned) {
        // Check if punishment was assigned yesterday or earlier (overdue)
        const dueDate = parseISO(dateAssigned);
        const daysSinceAssigned = differenceInDays(new Date(currentDate), dueDate);
        
        // Only mark as missed if it's been more than 1 day since assigned
        if (daysSinceAssigned > 1) {
          // Mark as missed and create debt
          await notionService.updatePunishmentStatus(punishment.id, 'missed');
          
          overdueResults.push({
            punishment_id: punishment.id,
            name: punishmentName,
            assigned_date: dateAssigned,
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
      const requiredMinutes = punishment.properties['Minutes Required'].number;
      const punishmentType = punishment.properties.Type.select?.name;
      
      // If punishment was assigned for today or earlier
      if (assignedDate && assignedDate <= date) {
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

  // Create new punishment assignment
  async assignPunishment(reason, type = 'treadmill', minutes = 20) {
    const today = format(new Date(), 'yyyy-MM-dd');
    
    const punishmentData = {
      name: `${reason} - ${today}`,
      type: type,
      minutes: minutes,
      dateAssigned: today
    };

    const newPunishment = await notionService.createPunishment(punishmentData);
    
    return {
      punishment_id: newPunishment.id,
      type: type,
      minutes: minutes,
      reason: reason,
      assigned_date: today
    };
  }

  // Check for violations that should result in punishment
  async checkForViolations(date) {
    const violations = [];
    const today = format(new Date(), 'yyyy-MM-dd');

    // Only check for violations if we're processing today's reconciliation
    if (date !== today) {
      return violations;
    }

    // Check for missed morning check-in
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
          punishment_type: 'treadmill',
          minutes: 20
        });
      }
    }

    // Add other violation checks here, but always check for duplicates first
    // - Skipped planned workout
    // - Late check-in (would need timestamp analysis)
    // etc.

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
      const punishmentType = violation.punishment_type || this.getRandomPunishmentType();
      const assignment = await this.assignPunishment(
        violation.reason,
        punishmentType,
        violation.minutes || 20
      );
      assignments.push(assignment);
    }

    return assignments;
  }
}

module.exports = new PunishmentService();