const dailyOrchestrator = require('./orchestrators/dailyReconciliation');

class DailyReconciliationService {
  async runDailyReconciliation(targetDate = null) {
    return await dailyOrchestrator.runDailyReconciliation(targetDate);
  }

  async getDailyStatus(date = null) {
    return await dailyOrchestrator.getDailyStatus(date);
  }
}

module.exports = new DailyReconciliationService();