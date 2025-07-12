require('dotenv').config();
const express = require('express');
const cors = require('cors');
const reconciliationController = require('./controllers/reconciliation');
const stravaAuthController = require('./controllers/strava-auth');

const app = express();
const PORT = process.env.PORT || 3005;

// Middleware
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*'
}));
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// Health check endpoint (enhanced with Plaid status)
app.get('/health', reconciliationController.getSystemHealth);

// Main reconciliation endpoints (now with Plaid integration)
app.post('/reconcile', reconciliationController.runReconciliation);
app.post('/reconcile/weekly', reconciliationController.runWeeklyReconciliation);
app.get('/reconcile/history', reconciliationController.getReconciliationHistory);

// Current system status endpoint
app.get('/current/status', reconciliationController.getStatus);

// Rule modification endpoints
app.get('/rules/status', reconciliationController.getRulesStatus);
app.post('/rules/modify', reconciliationController.updateRuleModifier);
app.post('/rules/reset', reconciliationController.resetRuleModifier);

// Strava authorization endpoints
app.get('/auth/strava', stravaAuthController.startAuth);
app.get('/auth/strava/callback', stravaAuthController.handleCallback);

// === DOMAIN-SPECIFIC ENDPOINTS ===

// Workouts endpoints
app.get('/workouts/today', async (req, res) => {
  try {
    const workoutService = require('./services/core/workouts');
    const date = new Date().toISOString().split('T')[0];
    const workouts = await workoutService.getTodaysWorkouts(date);
    
    res.json({
      success: true,
      date: date,
      count: workouts.length,
      workouts: workouts
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/workouts/week', async (req, res) => {
  try {
    const workoutService = require('./services/core/workouts');
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - 7);
    
    const workouts = await workoutService.getWorkoutsForWeek(
      startDate.toISOString().split('T')[0],
      endDate.toISOString().split('T')[0]
    );
    
    res.json({
      success: true,
      period: {
        start: startDate.toISOString().split('T')[0],
        end: endDate.toISOString().split('T')[0]
      },
      count: workouts.length,
      workouts: workouts
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});


// Strava activities endpoints
app.get('/strava/activities/last-week', async (req, res) => {
  try {
    const stravaService = require('./services/integrations/strava');
    
    // Calculate last week's date range
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - 7);
    
    const activities = await stravaService.getActivitiesInDateRange(startDate, endDate);
    
    res.json({
      success: true,
      period: {
        start: startDate.toISOString().split('T')[0],
        end: endDate.toISOString().split('T')[0]
      },
      count: activities.length,
      activities: activities
    });
  } catch (error) {
    console.error('Error fetching last week activities:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Debts endpoints
app.get('/debts/active', async (req, res) => {
  try {
    const debtService = require('./services/core/debt');
    const activeDebts = await debtService.getActiveDebts();
    
    res.json({
      success: true,
      count: activeDebts.length,
      debts: activeDebts
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/debts/overdue', async (req, res) => {
  try {
    const debtService = require('./services/core/debt');
    const overdueDebts = await debtService.getOverdueDebts();
    
    res.json({
      success: true,
      count: overdueDebts.length,
      debts: overdueDebts
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Punishments endpoints
app.get('/punishments/pending', async (req, res) => {
  try {
    const punishmentService = require('./services/core/punishments');
    const pending = await punishmentService.getPendingPunishments();
    
    res.json({
      success: true,
      count: pending.length,
      punishments: pending
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/punishments/overdue', async (req, res) => {
  try {
    const punishmentService = require('./services/core/punishments');
    const overdue = await punishmentService.getOverduePunishments();
    
    res.json({
      success: true,
      count: overdue.length,
      punishments: overdue
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});


app.post('/punishments/check-violations', async (req, res) => {
  try {
    const punishmentService = require('./services/core/punishments');
    const { date } = req.body;
    const violations = await punishmentService.checkViolations(date || new Date().toISOString().split('T')[0]);
    
    res.json({
      success: true,
      violations: violations
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Bonuses endpoints
app.get('/bonuses/available', async (req, res) => {
  try {
    const bonusService = require('./services/core/bonuses');
    const { date } = req.query;
    const bonuses = await bonusService.getAvailableBonuses(date || new Date().toISOString().split('T')[0]);
    
    res.json({
      success: true,
      count: bonuses.length,
      bonuses: bonuses
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/bonuses/earned', async (req, res) => {
  try {
    const bonusService = require('./services/core/bonuses');
    const { date } = req.query;
    const bonuses = await bonusService.getEarnedBonuses(date || new Date().toISOString().split('T')[0]);
    
    res.json({
      success: true,
      count: bonuses.length,
      bonuses: bonuses
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/bonuses/calculate', async (req, res) => {
  try {
    const bonusService = require('./services/core/bonuses');
    const { date } = req.body;
    const calculation = await bonusService.calculateBonuses(date || new Date().toISOString().split('T')[0]);
    
    res.json({
      success: true,
      calculation: calculation
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Status endpoint for monitoring (updated)
app.get('/status', (req, res) => {
  res.json({
    service: 'decider',
    status: 'running',
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    integrations: {
      notion: {
        configured: !!process.env.NOTION_TOKEN
      },
      strava: {
        configured: !!(process.env.STRAVA_CLIENT_ID && process.env.STRAVA_CLIENT_SECRET && process.env.STRAVA_ACCESS_TOKEN),
        client_id: !!process.env.STRAVA_CLIENT_ID,
        access_token: !!process.env.STRAVA_ACCESS_TOKEN,
        refresh_token: !!process.env.STRAVA_REFRESH_TOKEN
      }
    },
    environment: process.env.NODE_ENV || 'development',
    port: process.env.PORT || 3005
  });
});

// Rules/System endpoints
app.get('/rules/status', reconciliationController.getRulesStatus);
app.post('/rules/modify', reconciliationController.updateRuleModifier);
app.post('/rules/reset', reconciliationController.resetRuleModifier);




// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ 
    error: 'Internal server error',
    message: err.message 
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Start server
const port = process.env.PORT || 3005;
app.listen(port, () => {
  console.log(`🧠 Decider running on port ${port}`);
  console.log(`🔗 Notion integration: ${process.env.NOTION_TOKEN ? 'configured' : 'not configured'}`);
  console.log(`🏃 Strava integration: ${process.env.STRAVA_CLIENT_ID ? 'configured' : 'not configured'}`);
});

module.exports = app;