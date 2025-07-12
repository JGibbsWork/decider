require('dotenv').config();
const express = require('express');
const cors = require('cors');
const reconciliationController = require('./controllers/reconciliation');
const stravaAuthController = require('./controllers/strava-auth');
const tellerAuthController = require('./controllers/teller-auth');

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

// Teller authorization endpoints
app.get('/auth/teller', tellerAuthController.startAuth);
app.get('/auth/teller/callback', tellerAuthController.handleCallback);
app.post('/auth/teller/callback', tellerAuthController.handleCallback);

// AGGRESSIVE CATCH-ALL for any Teller-related requests
app.all('/auth/teller*', (req, res, next) => {
  console.log('🚨🚨🚨 TELLER REQUEST CAUGHT 🚨🚨🚨');
  console.log('Method:', req.method);
  console.log('URL:', req.url);
  console.log('Full URL:', req.originalUrl);
  console.log('Query params:', req.query);
  console.log('Body:', req.body);
  console.log('Headers:', req.headers);
  console.log('🚨🚨🚨 END TELLER REQUEST 🚨🚨🚨');
  next();
});

// CATCH-ALL for ANY request that might contain tokens
app.all('*', (req, res, next) => {
  const url = req.url.toLowerCase();
  const query = JSON.stringify(req.query).toLowerCase();
  
  if (url.includes('token') || query.includes('token') || 
      url.includes('access') || query.includes('access') ||
      url.includes('teller') || query.includes('teller')) {
    console.log('🔍🔍🔍 POTENTIAL TOKEN REQUEST 🔍🔍🔍');
    console.log('URL:', req.url);
    console.log('Query:', req.query);
    console.log('Method:', req.method);
    console.log('🔍🔍🔍 END POTENTIAL TOKEN 🔍🔍🔍');
  }
  next();
});

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

// Teller API endpoints
app.get('/teller/health', async (req, res) => {
  try {
    const tellerService = require('./services/integrations/teller');
    const health = await tellerService.healthCheck();
    
    res.json({
      success: true,
      teller: health
    });
  } catch (error) {
    console.error('Error checking Teller health:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.get('/teller/accounts', async (req, res) => {
  try {
    const tellerService = require('./services/integrations/teller');
    const { access_token } = req.query;
    
    if (!access_token) {
      return res.status(400).json({
        success: false,
        error: 'access_token query parameter is required'
      });
    }
    
    const accounts = await tellerService.getAccounts(access_token);
    
    res.json({
      success: true,
      count: accounts.length,
      accounts: accounts
    });
  } catch (error) {
    console.error('Error fetching Teller accounts:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.get('/teller/accounts/:accountId/balance', async (req, res) => {
  try {
    const tellerService = require('./services/integrations/teller');
    const { accountId } = req.params;
    const { access_token } = req.query;
    
    if (!access_token) {
      return res.status(400).json({
        success: false,
        error: 'access_token query parameter is required'
      });
    }
    
    const balance = await tellerService.getAccountBalance(accountId, access_token);
    
    res.json({
      success: true,
      account: balance
    });
  } catch (error) {
    console.error(`Error fetching balance for account ${req.params.accountId}:`, error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.get('/teller/sandbox/accounts', async (req, res) => {
  try {
    const tellerService = require('./services/integrations/teller');
    const accounts = await tellerService.getSandboxAccounts();
    
    res.json({
      success: true,
      count: accounts.length,
      accounts: accounts,
      note: 'These are sandbox accounts'
    });
  } catch (error) {
    console.error('Error fetching Teller sandbox accounts:', error);
    res.json({
      success: false,
      error: error.message,
      help: 'The 401 error means your certificates work but this endpoint needs an access token. In Teller sandbox, you typically need to create a test user first.',
      next_steps: [
        'Your certificates are working (good!)',
        'Sandbox requires proper token setup',
        'Try the certificate test endpoint instead',
        'Or get a real access token to test with'
      ]
    });
  }
});

app.get('/teller/test/certificate', async (req, res) => {
  try {
    const tellerService = require('./services/integrations/teller');
    await tellerService.testCertificateAuth();
    
    res.json({
      success: true,
      message: 'Certificate authentication working!',
      note: 'Your certificates are properly configured'
    });
  } catch (error) {
    console.error('Error testing certificate auth:', error);
    res.json({
      success: false,
      error: error.message,
      certificate_status: tellerService.isConfigured() ? 'loaded' : 'not_loaded'
    });
  }
});

app.post('/teller/test/assigning-key', async (req, res) => {
  try {
    const { assigningKey } = req.body;
    
    if (!assigningKey) {
      return res.json({
        success: false,
        error: 'No assigning key provided'
      });
    }

    const tellerService = require('./services/integrations/teller');
    
    // Try using the assigning key as an access token first
    try {
      const accounts = await tellerService.getAccounts(assigningKey);
      return res.json({
        success: true,
        message: 'Token Assigning Key works as access token!',
        accounts: accounts,
        note: 'Your Token Assigning Key is actually a valid access token'
      });
    } catch (tokenError) {
      // If that doesn't work, provide guidance
      return res.json({
        success: false,
        error: 'Token Assigning Key is not an access token',
        details: tokenError.message,
        help: 'Token Assigning Keys are used to generate access tokens through Teller Connect flow',
        next_steps: [
          'This key is for creating access tokens, not for direct API access',
          'You need to implement Teller Connect to get user access tokens',
          'Or use Teller dashboard to create test tokens'
        ]
      });
    }
  } catch (error) {
    console.error('Error testing assigning key:', error);
    res.json({
      success: false,
      error: error.message
    });
  }
});

// Simplified Teller endpoints using environment variables
app.get('/teller/ubereats/balance', async (req, res) => {
  try {
    const tellerService = require('./services/integrations/teller');
    const balance = await tellerService.getUberEatsBalance();
    
    res.json({
      success: true,
      account: balance
    });
  } catch (error) {
    console.error('Error fetching UberEats account balance:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.get('/teller/checking/balance', async (req, res) => {
  try {
    const tellerService = require('./services/integrations/teller');
    const balance = await tellerService.getCheckingBalance();
    
    res.json({
      success: true,
      account: balance
    });
  } catch (error) {
    console.error('Error fetching checking account balance:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.post('/teller/transfer/zelle', async (req, res) => {
  try {
    const tellerService = require('./services/integrations/teller');
    const { toRecipient, amount, memo, fromLastFour } = req.body;

    if (!toRecipient || !amount) {
      return res.status(400).json({
        success: false,
        error: 'toRecipient and amount are required in request body'
      });
    }
    
    const transfer = await tellerService.transferZelle(
      toRecipient, 
      amount, 
      memo, 
      fromLastFour
    );
    
    res.json({
      success: true,
      transfer: transfer
    });
  } catch (error) {
    console.error('Error initiating Zelle transfer:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Super simple Zelle transfer - just provide amount
app.post('/teller/transfer/simple', async (req, res) => {
  try {
    const tellerService = require('./services/integrations/teller');
    const { amount, memo } = req.body;

    if (!amount) {
      return res.status(400).json({
        success: false,
        error: 'amount is required in request body'
      });
    }
    
    const transfer = await tellerService.transferToCheckingSimple(amount, memo);
    
    res.json({
      success: true,
      transfer: transfer,
      message: `Successfully initiated $${amount} transfer to checking account`
    });
  } catch (error) {
    console.error('Error initiating simple Zelle transfer:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.get('/teller/transfer/:transferId/status', async (req, res) => {
  try {
    const tellerService = require('./services/integrations/teller');
    const { transferId } = req.params;
    
    const status = await tellerService.getTransferStatusSimple(transferId);
    
    res.json({
      success: true,
      transfer: status
    });
  } catch (error) {
    console.error(`Error fetching transfer status for ${req.params.transferId}:`, error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Token management endpoints
app.get('/teller/tokens/status', async (req, res) => {
  try {
    const tellerService = require('./services/integrations/teller');
    const tokenStatus = tellerService.getTokenStatus();
    
    res.json({
      success: true,
      tokens: tokenStatus,
      message: 'Current token status',
      reconnectUrl: `${req.protocol}://${req.get('host')}/auth/teller`
    });
  } catch (error) {
    console.error('Error getting token status:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.post('/teller/tokens/detect', async (req, res) => {
  try {
    const tellerService = require('./services/integrations/teller');
    const { accessToken } = req.body;
    
    if (!accessToken) {
      return res.status(400).json({
        success: false,
        error: 'accessToken is required in request body'
      });
    }
    
    const detection = await tellerService.detectAndStoreToken(accessToken);
    
    res.json({
      success: true,
      detection: detection,
      currentStatus: tellerService.getTokenStatus()
    });
  } catch (error) {
    console.error('Error detecting token:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.post('/teller/tokens/clear', async (req, res) => {
  try {
    const tellerService = require('./services/integrations/teller');
    tellerService.clearTokens();
    
    res.json({
      success: true,
      message: 'All tokens cleared',
      currentStatus: tellerService.getTokenStatus()
    });
  } catch (error) {
    console.error('Error clearing tokens:', error);
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
      },
      teller: {
        configured: !!(process.env.TELLER_CERT_PATH && process.env.TELLER_KEY_PATH),
        cert_path: !!process.env.TELLER_CERT_PATH,
        key_path: !!process.env.TELLER_KEY_PATH,
        client_id: !!process.env.TELLER_CLIENT_ID,
        environment: process.env.TELLER_ENVIRONMENT || 'sandbox'
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
  console.log(`🏦 Teller integration: ${(process.env.TELLER_CERT_PATH && process.env.TELLER_KEY_PATH) ? 'configured' : 'not configured'}`);
});

module.exports = app;