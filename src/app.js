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