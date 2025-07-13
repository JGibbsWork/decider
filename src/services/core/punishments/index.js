const punishmentRepo = require('./repository/PunishmentRepository');
const punishmentAssigner = require('./services/PunishmentAssigner');
const violationChecker = require('./services/ViolationChecker');
const threeRoutePunishmentAssigner = require('./services/ThreeRoutePunishmentAssigner');

class PunishmentService {
  
  // Main workflow methods
  async processOverduePunishments(date) {
    const overdue = await punishmentRepo.findOverdue(date);
    const results = [];

    for (const punishment of overdue) {
      punishment.markMissed();
      await punishmentRepo.updateStatus(punishment.id, 'missed');
      
      results.push({
        punishment_id: punishment.id,
        name: punishment.name,
        marked_missed: true
      });
    }

    return results;
  }

  async processCompletions(date) {
    return await punishmentRepo.findCompletedOnDate(date);
  }

  async processNewViolations(date) {
    const violations = await violationChecker.checkDailyViolations(date);
    const newPunishments = [];

    for (const violation of violations) {
      const result = await punishmentAssigner.assignPunishment(violation);
      newPunishments.push(result);
    }

    return newPunishments;
  }

  // Repository methods (for backward compatibility)
  async getPendingPunishments() {
    return await punishmentRepo.findPending();
  }

  async updatePunishmentStatus(id, status, completedDate = null) {
    return await punishmentRepo.updateStatus(id, status, completedDate);
  }

  // 3-Route punishment system methods
  async assignWeeklyViolationPunishments(violationData) {
    return await threeRoutePunishmentAssigner.assignWeeklyViolationPunishments(violationData);
  }

  async getActivePunishmentAdjustments(weekStart) {
    return await threeRoutePunishmentAssigner.getActivePunishmentAdjustments(weekStart);
  }

  // Legacy assignment method for backward compatibility
  async assignPunishment(punishmentData) {
    try {
      const punishment = {
        name: punishmentData.reason || 'Violation Punishment',
        type: punishmentData.type || 'Cardio',
        minutes: punishmentData.minutes || 30,
        dateAssigned: punishmentData.dateAssigned || new Date().toISOString().split('T')[0],
        dueDate: punishmentData.due_date || punishmentData.dueDate,
        reason: punishmentData.reason,
        // Add metadata if provided
        ...(punishmentData.metadata && { metadata: punishmentData.metadata })
      };

      return await punishmentRepo.create(punishment);
    } catch (error) {
      console.error('Error assigning punishment:', error);
      throw error;
    }
  }

  async getOverduePunishments() {
    const currentDate = new Date().toISOString().split('T')[0];
    return await punishmentRepo.findOverdue(currentDate);
  }
}

module.exports = new PunishmentService();