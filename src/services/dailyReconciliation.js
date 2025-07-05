const dailyOrchestrator = require('./processors/dailyOrchestrator');

class DailyReconciliationService {
  async runDailyReconciliation(targetDate = null) {
    return await dailyOrchestrator.runDailyReconciliation(targetDate);
  }
}

module.exports = new DailyReconciliationService();