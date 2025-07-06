require('dotenv').config();
const express = require('express');
const cors = require('cors');
const reconciliationController = require('./controllers/reconciliation');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*'
}));
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Main reconciliation endpoints
app.post('/reconcile', reconciliationController.runReconciliation);
app.post('/reconcile/weekly', reconciliationController.runWeeklyReconciliation);
app.get('/reconcile/history', reconciliationController.getReconciliationHistory);

// Rule modification endpoints
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

// Health check endpoint for Docker
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    service: 'decider',
    environment: process.env.NODE_ENV || 'development',
    uptime: process.uptime()
  });
});

// Status endpoint for monitoring
app.get('/status', (req, res) => {
  res.json({
    service: 'decider',
    status: 'running',
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    notion: {
      configured: !!process.env.NOTION_API_KEY,
      database: !!process.env.NOTION_DATABASE_ID
    },
    environment: process.env.NODE_ENV || 'development',
    port: process.env.PORT || 3005
  });
});

// Start server
const port = process.env.PORT || 3005;
app.listen(port, () => {
  console.log(`🧠 Decider running on port ${port}`);
  console.log(`🔗 Notion integration: ${process.env.NOTION_API_KEY ? 'configured' : 'not configured'}`);
});

module.exports = app;