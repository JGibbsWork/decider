const { format } = require('date-fns');
const dailyReconciliationService = require('../services/dailyReconciliation');
const weeklyReconciliationService = require('../services/weeklyReconciliation');
const notionService = require('../services/notion');

async function runDailyReconciliation(req, res) {
  try {
    const targetDate = req.body.date || null; // Optional: specify which date to process
    console.log(`Starting daily reconciliation for: ${targetDate || 'today'}`);

    const results = await dailyReconciliationService.runDailyReconciliation(targetDate);

    console.log('Daily reconciliation complete');
    res.json({
      success: true,
      type: 'daily',
      results
    });

  } catch (error) {
    console.error('Daily reconciliation error:', error);
    res.status(500).json({
      success: false,
      type: 'daily',
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}

// Health check endpoint for the reconciliation system
async function healthCheck(req, res) {
  try {
    // Test Notion connection
    await notionService.getLatestBalances(1);
    
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      services: {
        notion: 'connected',
        debt: 'ready',
        bonuses: 'ready',
        punishments: 'ready'
      }
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
}

async function runWeeklyReconciliation(req, res) {
  try {
    const weekStart = req.body.week_start || null; // Optional: specify which week to process
    console.log(`Starting weekly reconciliation for week starting: ${weekStart || 'last week'}`);

    const results = await weeklyReconciliationService.runWeeklyReconciliation(weekStart);

    console.log('Weekly reconciliation complete');
    res.json({
      success: true,
      type: 'weekly',
      results
    });

  } catch (error) {
    console.error('Weekly reconciliation error:', error);
    res.status(500).json({
      success: false,
      type: 'weekly',
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}

module.exports = {
  runDailyReconciliation,
  runWeeklyReconciliation,
  healthCheck
};