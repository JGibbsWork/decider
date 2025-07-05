const { format } = require('date-fns');

// Import orchestrators directly (no service wrappers)
const dailyReconciliationOrchestrator = require('../services/orchestrators/dailyReconciliation');
const weeklyReconciliationOrchestrator = require('../services/orchestrators/weeklyReconciliation');

// Import other services
const historyService = require('../services/data/history');
const rulesService = require('../services/core/rules');
const notionService = require('../services/integrations/notion');

async function runReconciliation(req, res) {
  try {
    const targetDate = req.body.date || null; // Optional: specify which date to process
    console.log(`Starting daily reconciliation for: ${targetDate || 'today'}`);

    const results = await dailyReconciliationOrchestrator.runDailyReconciliation(targetDate);

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

async function runWeeklyReconciliation(req, res) {
  try {
    const weekStart = req.body.week_start || null; // Optional: specify which week to process
    console.log(`Starting weekly reconciliation for week starting: ${weekStart || 'last week'}`);

    const results = await weeklyReconciliationOrchestrator.runWeeklyReconciliation(weekStart);

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

async function getReconciliationHistory(req, res) {
  try {
    const { type = 'daily', days = 30, weeks = 12 } = req.query;
    
    let history;
    if (type === 'weekly') {
      history = await historyService.getWeeklyHistory(parseInt(weeks));
    } else {
      history = await historyService.getDailyHistory(parseInt(days));
    }

    res.json({
      success: true,
      type: type,
      history: history
    });

  } catch (error) {
    console.error('History retrieval error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}

async function updateRuleModifier(req, res) {
  try {
    const { rule_name, modifier_percent, reason } = req.body;
    
    if (!rule_name || modifier_percent === undefined) {
      return res.status(400).json({
        success: false,
        error: 'rule_name and modifier_percent are required'
      });
    }

    const result = await rulesService.updateRuleModifier(rule_name, modifier_percent, reason);
    
    res.json({
      success: true,
      result: result
    });

  } catch (error) {
    console.error('Rule modifier update error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

async function getRulesStatus(req, res) {
  try {
    const allRules = await rulesService.getAllRules();
    const modifiedRules = await rulesService.getModifiedRules();
    
    res.json({
      success: true,
      all_rules: allRules,
      modified_rules: modifiedRules,
      modification_count: Object.keys(modifiedRules).length
    });

  } catch (error) {
    console.error('Rules status error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

async function resetRuleModifier(req, res) {
  try {
    const { rule_name } = req.body;
    
    if (!rule_name) {
      return res.status(400).json({
        success: false,
        error: 'rule_name is required'
      });
    }

    const result = await rulesService.resetRuleModifier(rule_name);
    
    res.json({
      success: true,
      result: result
    });

  } catch (error) {
    console.error('Rule reset error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

module.exports = {
  runReconciliation,
  runWeeklyReconciliation,
  getReconciliationHistory,
  updateRuleModifier,
  getRulesStatus,
  resetRuleModifier,
  healthCheck
};