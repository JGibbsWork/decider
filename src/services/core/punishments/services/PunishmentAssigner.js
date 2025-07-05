const punishmentRepo = require('../repository/PunishmentRepository');
const habiticaService = require('../../../integrations/habitica');

class PunishmentAssigner {
  
  async assignPunishment(violationData) {
    const punishment = {
      name: `${violationData.reason} - ${violationData.date}`,
      type: this.selectPunishmentType(),
      minutes: this.calculateMinutes(violationData.severity),
      dateAssigned: violationData.date,
      dueDate: this.calculateDueDate(violationData.date),
      reason: violationData.reason
    };

    // Create in Notion
    const createdPunishment = await punishmentRepo.create(punishment);
    
    // Create in Habitica
    const habiticaResult = await habiticaService.createPunishmentTodo({
      type: punishment.type,
      minutes: punishment.minutes,
      reason: punishment.reason,
      due_date: punishment.dueDate
    });

    return {
      punishment: createdPunishment,
      habitica_integration: habiticaResult
    };
  }

  selectPunishmentType() {
    const types = ['Bike', 'Treadmill', 'Stairstepper', 'Run'];
    return types[Math.floor(Math.random() * types.length)];
  }

  calculateMinutes(severity = 'normal') {
    const baseMinutes = 20;
    const multipliers = {
      light: 0.75,
      normal: 1.0,
      severe: 1.5
    };
    return Math.round(baseMinutes * (multipliers[severity] || 1.0));
  }

  calculateDueDate(assignedDate, graceDays = 2) {
    const due = new Date(assignedDate);
    due.setDate(due.getDate() + graceDays);
    return due.toISOString().split('T')[0];
  }
}

module.exports = new PunishmentAssigner();