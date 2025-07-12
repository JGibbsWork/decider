const dailyReconciliation = require('../services/orchestrators/dailyReconciliation');
const weeklyReconciliation = require('../services/orchestrators/weeklyReconciliation');
const workoutService = require('../services/core/workouts');
const notionService = require('../services/integrations/notion');

// Main daily reconciliation endpoint
const runReconciliation = async (req, res) => {
  try {
    // Use local timezone for default date if not provided
    const timezone = process.env.TIMEZONE || 'America/Chicago';
    const defaultDate = new Date().toLocaleDateString('en-CA', { 
      timeZone: timezone 
    });
    const targetDate = req.body.date || defaultDate;
    console.log(`🔄 Running daily reconciliation for ${targetDate}...`);

    const results = await dailyReconciliation.runDailyReconciliation(targetDate);

    console.log('✅ Daily reconciliation completed successfully');
    
    res.json({
      success: true,
      type: 'daily',
      results: results
    });

  } catch (error) {
    console.error('❌ Daily reconciliation failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      type: 'reconciliation_error'
    });
  }
};

// Weekly reconciliation endpoint
const runWeeklyReconciliation = async (req, res) => {
  try {
    const targetWeek = req.body.week || null;
    console.log(`🔄 Running weekly reconciliation...`);

    const results = await weeklyReconciliation.runWeeklyReconciliation(targetWeek);

    console.log('✅ Weekly reconciliation completed successfully');
    
    res.json({
      success: true,
      type: 'weekly',
      results: results
    });

  } catch (error) {
    console.error('❌ Weekly reconciliation failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      type: 'weekly_reconciliation_error'
    });
  }
};

// Get reconciliation history
const getReconciliationHistory = async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 7;
    
    // Get recent reconciliation data from Notion
    const history = await notionService.getReconciliationHistory(days);
    
    res.json({
      success: true,
      history: history,
      days_requested: days
    });

  } catch (error) {
    console.error('❌ Failed to get reconciliation history:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

// System health check
const getSystemHealth = async (req, res) => {
  try {
    const healthChecks = await Promise.allSettled([
      notionService.healthCheck(),
      workoutService.getStravaStatus(),
      dailyReconciliation.getDailyStatus()
    ]);

    const [notionHealth, stravaHealth, dailyStatus] = healthChecks;

    const systemHealth = {
      status: 'healthy',
      services: {
        notion: notionHealth.status === 'fulfilled' ? notionHealth.value : { error: notionHealth.reason?.message || 'Unknown error' },
        strava: stravaHealth.status === 'fulfilled' ? stravaHealth.value : { error: stravaHealth.reason?.message || 'Unknown error' },
        daily_status: dailyStatus.status === 'fulfilled' ? dailyStatus.value : { error: dailyStatus.reason?.message || 'Unknown error' }
      },
      timestamp: new Date().toISOString()
    };

    // Determine overall health
    const hasErrors = Object.values(systemHealth.services).some(service => service && service.error);
    if (hasErrors) {
      systemHealth.status = 'degraded';
    }

    res.json(systemHealth);

  } catch (error) {
    res.status(500).json({
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
};

// Get current status (financial, workouts, punishments)
const getStatus = async (req, res) => {
  try {
    // Get today in local timezone (America/Chicago)
    const timezone = process.env.TIMEZONE || 'America/Chicago';
    const today = new Date().toLocaleDateString('en-CA', { 
      timeZone: timezone 
    }); // Returns YYYY-MM-DD format
    
    const [dailyStatus, todaysWorkouts, stravaWorkouts] = await Promise.all([
      dailyReconciliation.getDailyStatus(today),
      workoutService.getTodaysWorkouts(today),
      workoutService.getTodaysStravaWorkouts()
    ]);

    // Check if this is a browser request
    const acceptsHtml = req.headers.accept && req.headers.accept.includes('text/html');
    
    if (acceptsHtml) {
      // Return HTML status page for browser
      const stravaStatus = await workoutService.getStravaStatus();
      const needsAuth = stravaStatus.configured && (stravaStatus.needs_reauth || !stravaStatus.can_read_activities);
      
      const html = `
      <!DOCTYPE html>
      <html>
      <head>
          <title>Decider Status</title>
          <style>
              body { font-family: Arial, sans-serif; max-width: 800px; margin: 20px auto; padding: 20px; }
              .status-container { border: 1px solid #ddd; padding: 20px; margin: 20px 0; border-radius: 8px; }
              .healthy { border-left: 4px solid #28a745; background: #d4edda; }
              .unhealthy { border-left: 4px solid #dc3545; background: #f8d7da; }
              .warning { border-left: 4px solid #ffc107; background: #fff3cd; }
              .auth-needed { background: #fff3cd; padding: 15px; margin: 20px 0; border-radius: 5px; }
              .button { background: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block; margin: 10px 5px; }
              .auth-button { background: #FC4C02; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; }
              .workout-list { background: #f8f9fa; padding: 15px; margin: 10px 0; border-radius: 5px; }
              .empty-state { color: #6c757d; font-style: italic; }
              h1 { color: #343a40; }
              h2 { color: #495057; border-bottom: 1px solid #dee2e6; padding-bottom: 10px; }
              .refresh-note { background: #e9ecef; padding: 10px; margin: 15px 0; border-radius: 5px; font-size: 14px; }
          </style>
      </head>
      <body>
          <h1>🧠 Decider Status Dashboard</h1>
          <p><strong>Date:</strong> ${today} | <strong>Last Updated:</strong> ${new Date().toLocaleString()}</p>
          
          ${needsAuth ? `
          <div class="auth-needed">
              <h3>🔧 Action Required: Strava Authorization</h3>
              <p>Your Strava integration needs to be re-authorized with activity reading permissions.</p>
              <a href="/auth/strava" class="auth-button">Authorize Strava</a>
          </div>
          ` : ''}
          
          <div class="status-container ${stravaStatus.can_read_activities ? 'healthy' : 'warning'}">
              <h2>📊 Integration Status</h2>
              <p><strong>Strava:</strong> ${stravaStatus.configured ? '✅ Configured' : '❌ Not Configured'} | 
                 ${stravaStatus.connected ? '✅ Connected' : '⚠️ Disconnected'} | 
                 ${stravaStatus.can_read_activities ? '✅ Can Read Activities' : '⚠️ Missing Activity Permission'}</p>
              ${stravaStatus.athlete ? `<p><strong>Athlete:</strong> ${stravaStatus.athlete.firstname} ${stravaStatus.athlete.lastname}</p>` : ''}
              <p><strong>Notion:</strong> ✅ Connected</p>
          </div>
          
          <div class="status-container">
              <h2>🏃 Today's Workouts</h2>
              <div class="workout-list">
                  ${todaysWorkouts.length > 0 ? 
                    todaysWorkouts.map(w => `<p>• ${w.type} - ${w.duration} min (${w.source})</p>`).join('') 
                    : '<p class="empty-state">No workouts found for today</p>'}
              </div>
              ${stravaWorkouts.length === 0 && stravaStatus.configured ? 
                '<p class="empty-state">No Strava workouts found (check authorization)</p>' : ''}
          </div>
          
          <div class="status-container">
              <h2>💰 Financial Status</h2>
              ${dailyStatus && dailyStatus.financial ? 
                `<p><strong>Total Debt:</strong> $${dailyStatus.financial.total_debt?.toFixed(2) || '0.00'}</p>
                 <p><strong>Active Contracts:</strong> ${dailyStatus.financial.active_contracts || 0}</p>
                 <p><strong>Debt Free:</strong> ${dailyStatus.financial.debt_free ? '✅ Yes' : '❌ No'}</p>`
                : '<p class="empty-state">Financial data not available</p>'}
          </div>
          
          <div class="refresh-note">
              <strong>Note:</strong> If you just authorized Strava, restart your server to apply the new tokens.
          </div>
          
          <p>
              <a href="/health" class="button">Health Check</a>
              <a href="/current/status" class="button">JSON Status</a>
              ${needsAuth ? '<a href="/auth/strava" class="auth-button">Fix Strava</a>' : ''}
          </p>
      </body>
      </html>`;
      
      res.send(html);
    } else {
      // Return JSON for API requests
      res.json({
        success: true,
        date: today,
        daily_status: dailyStatus,
        workouts: {
          notion: todaysWorkouts.filter(w => w.source !== 'Strava'),
          strava: stravaWorkouts,
          total: todaysWorkouts.length
        },
        timestamp: new Date().toISOString()
      });
    }

  } catch (error) {
    console.error('❌ Failed to get current status:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

// Rules status endpoint
const getRulesStatus = async (req, res) => {
  try {
    const rules = await notionService.getSystemRules();
    
    res.json({
      success: true,
      rules: rules,
      active_rules: rules.filter(rule => rule.properties['Active']?.checkbox === true)
    });

  } catch (error) {
    console.error('❌ Failed to get rules status:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

// Update rule modifier
const updateRuleModifier = async (req, res) => {
  try {
    const { rule_id, modifier_value } = req.body;
    
    if (!rule_id || modifier_value === undefined) {
      return res.status(400).json({
        success: false,
        error: 'rule_id and modifier_value are required'
      });
    }

    await notionService.updateRuleModifier(rule_id, modifier_value);
    
    res.json({
      success: true,
      message: 'Rule modifier updated successfully'
    });

  } catch (error) {
    console.error('❌ Failed to update rule modifier:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

// Reset rule modifier
const resetRuleModifier = async (req, res) => {
  try {
    const { rule_id } = req.body;
    
    if (!rule_id) {
      return res.status(400).json({
        success: false,
        error: 'rule_id is required'
      });
    }

    await notionService.updateRuleModifier(rule_id, 1.0); // Reset to default
    
    res.json({
      success: true,
      message: 'Rule modifier reset to default'
    });

  } catch (error) {
    console.error('❌ Failed to reset rule modifier:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

module.exports = {
  runReconciliation,
  runWeeklyReconciliation,
  getReconciliationHistory,
  getSystemHealth,
  getStatus,
  getRulesStatus,
  updateRuleModifier,
  resetRuleModifier
};