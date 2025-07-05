const punishmentRepo = require('./repository/PunishmentRepository');
const punishmentAssigner = require('./services/PunishmentAssigner');
const violationChecker = require('./services/ViolationChecker');

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
}

module.exports = new PunishmentService();