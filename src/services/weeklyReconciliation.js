const weeklyOrchestrator = require('./orchestrators/weeklyReconciliation');

class WeeklyReconciliationService {
  async runWeeklyReconciliation(weekStartDate = null) {
    return await weeklyOrchestrator.runWeeklyReconciliation(weekStartDate);
  }

  async getWeeklyStatus(weekStart = null) {
    return await weeklyOrchestrator.getWeeklyStatus(weekStart);
  }
}

module.exports = new WeeklyReconciliationService();