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

// Job applications endpoints
app.get('/job-applications/weekly', async (req, res) => {
  try {
    const notionService = require('./services/integrations/notion');
    const jobApps = await notionService.getJobApplicationsCountSinceMonday();
    
    res.json({
      success: true,
      job_applications: jobApps
    });
  } catch (error) {
    console.error('Error fetching weekly job applications:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Weekly Habits endpoints
app.get('/habits/current-week', async (req, res) => {
  try {
    const habitsService = require('./services/core/habits');
    const currentWeek = await habitsService.getCurrentWeekHabits();
    
    res.json({
      success: true,
      current_week: currentWeek
    });
  } catch (error) {
    console.error('Error fetching current week habits:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.get('/habits/summary', async (req, res) => {
  try {
    const habitsService = require('./services/core/habits');
    const summary = await habitsService.getCurrentWeekSummary();
    
    res.json({
      success: true,
      week_summary: summary
    });
  } catch (error) {
    console.error('Error fetching weekly habits summary:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.post('/habits/sync', async (req, res) => {
  try {
    const habitsService = require('./services/core/habits');
    const syncedWeek = await habitsService.syncCurrentWeekWithActuals();
    
    res.json({
      success: true,
      message: 'Current week synced with actual data',
      synced_week: syncedWeek
    });
  } catch (error) {
    console.error('Error syncing weekly habits:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.post('/habits/update/:habitType', async (req, res) => {
  try {
    const habitsService = require('./services/core/habits');
    const { habitType } = req.params;
    const { increment = 1, absolute } = req.body;
    
    let updatedWeek;
    if (absolute !== undefined) {
      updatedWeek = await habitsService.setCurrentWeekProgress(habitType, absolute);
    } else {
      updatedWeek = await habitsService.updateCurrentWeekProgress(habitType, increment);
    }
    
    res.json({
      success: true,
      message: `Updated ${habitType} progress`,
      updated_week: updatedWeek
    });
  } catch (error) {
    console.error(`Error updating ${req.params.habitType} progress:`, error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.get('/habits/health', async (req, res) => {
  try {
    const habitsService = require('./services/core/habits');
    const health = await habitsService.healthCheck();
    
    res.json({
      success: true,
      habits_service: health
    });
  } catch (error) {
    console.error('Error checking habits service health:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
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

// Uber Earnings endpoints
app.get('/uber/earnings/current-week', async (req, res) => {
  try {
    const uberEarningsService = require('./services/integrations/uber/earnings');
    const currentWeek = await uberEarningsService.getCurrentWeekEarnings();
    
    res.json({
      success: true,
      current_week_earnings: currentWeek
    });
  } catch (error) {
    console.error('Error fetching current week Uber earnings:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.get('/uber/earnings/weekly/:weekStart', async (req, res) => {
  try {
    const uberEarningsService = require('./services/integrations/uber/earnings');
    const { weekStart } = req.params;
    const weeklyData = await uberEarningsService.sumWeeklyEarnings(weekStart);
    
    res.json({
      success: true,
      weekly_earnings: weeklyData
    });
  } catch (error) {
    console.error(`Error fetching weekly Uber earnings for ${req.params.weekStart}:`, error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.get('/uber/earnings/daily/:weekStart/:weekEnd', async (req, res) => {
  try {
    const uberEarningsService = require('./services/integrations/uber/earnings');
    const { weekStart, weekEnd } = req.params;
    const dailyEntries = await uberEarningsService.getDailyEntries(weekStart, weekEnd);
    
    res.json({
      success: true,
      daily_entries: dailyEntries
    });
  } catch (error) {
    console.error(`Error fetching daily Uber earnings for ${req.params.weekStart} to ${req.params.weekEnd}:`, error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.get('/uber/earnings/savings-rate/:weekStart', async (req, res) => {
  try {
    const uberEarningsService = require('./services/integrations/uber/earnings');
    const { weekStart } = req.params;
    const savingsRate = await uberEarningsService.calculateEffectiveSavingsRate(weekStart);
    
    res.json({
      success: true,
      savings_analysis: savingsRate
    });
  } catch (error) {
    console.error(`Error calculating savings rate for ${req.params.weekStart}:`, error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.get('/uber/earnings/summary/:weekStart?', async (req, res) => {
  try {
    const uberEarningsService = require('./services/integrations/uber/earnings');
    const { weekStart } = req.params;
    const summary = await uberEarningsService.getWeeklySummary(weekStart);
    
    res.json({
      success: true,
      weekly_summary: summary
    });
  } catch (error) {
    console.error(`Error fetching Uber earnings summary:`, error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.get('/uber/earnings/health', async (req, res) => {
  try {
    const uberEarningsService = require('./services/integrations/uber/earnings');
    const health = await uberEarningsService.healthCheck();
    
    res.json({
      success: true,
      uber_earnings: health
    });
  } catch (error) {
    console.error('Error checking Uber earnings health:', error);
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


// 3-Route Punishment System endpoints
app.post('/punishments/assign-weekly-violations', async (req, res) => {
  try {
    const punishmentService = require('./services/core/punishments');
    const violationData = req.body;
    
    const result = await punishmentService.assignWeeklyViolationPunishments(violationData);
    
    res.json({
      success: true,
      punishment_result: result
    });
  } catch (error) {
    console.error('Error assigning weekly violation punishments:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.get('/punishments/adjustments/:weekStart', async (req, res) => {
  try {
    const punishmentService = require('./services/core/punishments');
    const { weekStart } = req.params;
    
    const adjustments = await punishmentService.getActivePunishmentAdjustments(weekStart);
    
    res.json({
      success: true,
      active_adjustments: adjustments
    });
  } catch (error) {
    console.error(`Error getting punishment adjustments for ${req.params.weekStart}:`, error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.get('/punishments/route-summary/:weekStart', async (req, res) => {
  try {
    const punishmentService = require('./services/core/punishments');
    const { weekStart } = req.params;
    
    // This would get a summary of all 3-route punishments for a given week
    // For now, return the adjustments data
    const adjustments = await punishmentService.getActivePunishmentAdjustments(weekStart);
    
    res.json({
      success: true,
      week_start: weekStart,
      route_summary: adjustments,
      message: 'Route summary feature coming soon'
    });
  } catch (error) {
    console.error(`Error getting route summary for ${req.params.weekStart}:`, error);
    res.status(500).json({
      success: false,
      error: error.message
    });
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
      },
      homeassistant: {
        configured: !!(process.env.HOME_ASSISTANT_URL && process.env.HOME_ASSISTANT_TOKEN),
        url: !!process.env.HOME_ASSISTANT_URL,
        token: !!process.env.HOME_ASSISTANT_TOKEN
      }
    },
    environment: process.env.NODE_ENV || 'development',
    port: process.env.PORT || 3005
  });
});

// Location Tracking endpoints
app.get('/location/tracking/current-week', async (req, res) => {
  try {
    const locationTrackingService = require('./services/integrations/location/tracking');
    const currentWeek = await locationTrackingService.getCurrentWeekLocationData();
    
    res.json({
      success: true,
      current_week_location: currentWeek
    });
  } catch (error) {
    console.error('Error fetching current week location data:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.get('/location/tracking/weekly/:weekStart', async (req, res) => {
  try {
    const locationTrackingService = require('./services/integrations/location/tracking');
    const { weekStart } = req.params;
    const weeklyData = await locationTrackingService.countAllLocationHabits(weekStart);
    
    res.json({
      success: true,
      weekly_location: weeklyData
    });
  } catch (error) {
    console.error(`Error fetching weekly location data for ${req.params.weekStart}:`, error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.get('/location/tracking/office/:weekStart', async (req, res) => {
  try {
    const locationTrackingService = require('./services/integrations/location/tracking');
    const { weekStart } = req.params;
    const officeData = await locationTrackingService.countOfficeDays(weekStart);
    
    res.json({
      success: true,
      office_days: officeData
    });
  } catch (error) {
    console.error(`Error fetching office days for ${req.params.weekStart}:`, error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.get('/location/tracking/cowork/:weekStart', async (req, res) => {
  try {
    const locationTrackingService = require('./services/integrations/location/tracking');
    const { weekStart } = req.params;
    const coworkData = await locationTrackingService.countCoworkDays(weekStart);
    
    res.json({
      success: true,
      cowork_days: coworkData
    });
  } catch (error) {
    console.error(`Error fetching cowork days for ${req.params.weekStart}:`, error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.get('/location/tracking/gym/:weekStart', async (req, res) => {
  try {
    const locationTrackingService = require('./services/integrations/location/tracking');
    const { weekStart } = req.params;
    const gymData = await locationTrackingService.countGymDays(weekStart);
    
    res.json({
      success: true,
      gym_days: gymData
    });
  } catch (error) {
    console.error(`Error fetching gym days for ${req.params.weekStart}:`, error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.get('/location/tracking/entries/:weekStart', async (req, res) => {
  try {
    const locationTrackingService = require('./services/integrations/location/tracking');
    const { weekStart } = req.params;
    const entries = await locationTrackingService.getWeeklyLocationEntries(weekStart);
    
    res.json({
      success: true,
      location_entries: entries
    });
  } catch (error) {
    console.error(`Error fetching location entries for ${req.params.weekStart}:`, error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.get('/location/tracking/validate/:weekStart', async (req, res) => {
  try {
    const locationTrackingService = require('./services/integrations/location/tracking');
    const { weekStart } = req.params;
    const validation = await locationTrackingService.validateWeekData(weekStart);
    
    res.json({
      success: true,
      validation: validation
    });
  } catch (error) {
    console.error(`Error validating location data for ${req.params.weekStart}:`, error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.get('/location/tracking/summary/:weekStart?', async (req, res) => {
  try {
    const locationTrackingService = require('./services/integrations/location/tracking');
    const { weekStart } = req.params;
    const summary = await locationTrackingService.getWeeklySummary(weekStart);
    
    res.json({
      success: true,
      weekly_summary: summary
    });
  } catch (error) {
    console.error(`Error fetching location tracking summary:`, error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.get('/location/tracking/health', async (req, res) => {
  try {
    const locationTrackingService = require('./services/integrations/location/tracking');
    const health = await locationTrackingService.healthCheck();
    
    res.json({
      success: true,
      location_tracking: health
    });
  } catch (error) {
    console.error('Error checking location tracking health:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Home Assistant endpoints
app.get('/homeassistant/health', async (req, res) => {
  try {
    const homeassistantService = require('./services/integrations/homeassistant');
    const health = await homeassistantService.healthCheck();
    
    res.json({
      success: true,
      homeassistant: health
    });
  } catch (error) {
    console.error('Error checking Home Assistant health:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.get('/homeassistant/location/toggles', async (req, res) => {
  try {
    const homeassistantService = require('./services/integrations/homeassistant');
    const createEntry = req.query.createEntry === 'true';
    const toggles = await homeassistantService.checkLocationTrackingToggles(createEntry);
    
    res.json({
      success: true,
      location_tracking: toggles
    });
  } catch (error) {
    console.error('Error checking location toggles:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.post('/homeassistant/location/track', async (req, res) => {
  try {
    const homeassistantService = require('./services/integrations/homeassistant');
    const toggles = await homeassistantService.checkLocationTrackingToggles(true);
    
    res.json({
      success: true,
      message: 'Location tracking checked and entry created',
      location_tracking: toggles
    });
  } catch (error) {
    console.error('Error tracking location:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.get('/homeassistant/entities/boolean', async (req, res) => {
  try {
    const homeassistantService = require('./services/integrations/homeassistant');
    const booleans = await homeassistantService.getBooleanInputs();
    
    res.json({
      success: true,
      count: booleans.length,
      boolean_inputs: booleans
    });
  } catch (error) {
    console.error('Error fetching boolean inputs:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Testing and Validation endpoints
app.post('/test/complete-flow', async (req, res) => {
  try {
    const habitTrackingValidator = require('./services/testing/HabitTrackingFlowValidator');
    
    console.log('🧪 Starting complete habit tracking flow validation...');
    const results = await habitTrackingValidator.runCompleteValidation();
    
    res.json({
      success: results.summary.overallSuccess,
      validation_results: results,
      message: results.summary.overallSuccess ? 
        'Complete habit tracking flow validation passed' : 
        'Validation completed with issues'
    });
  } catch (error) {
    console.error('Error running complete flow validation:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.get('/test/habits-service', async (req, res) => {
  try {
    const habitTrackingValidator = require('./services/testing/HabitTrackingFlowValidator');
    const results = await habitTrackingValidator.validateHabitsServiceOnly();
    
    res.json({
      success: results.validation_passed,
      habits_service_validation: results
    });
  } catch (error) {
    console.error('Error validating habits service:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.get('/test/uber-earnings', async (req, res) => {
  try {
    const habitTrackingValidator = require('./services/testing/HabitTrackingFlowValidator');
    const results = await habitTrackingValidator.validateUberEarningsOnly();
    
    res.json({
      success: results.validation_passed,
      uber_earnings_validation: results
    });
  } catch (error) {
    console.error('Error validating Uber earnings:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.get('/test/location-tracking', async (req, res) => {
  try {
    const habitTrackingValidator = require('./services/testing/HabitTrackingFlowValidator');
    const results = await habitTrackingValidator.validateLocationTrackingOnly();
    
    res.json({
      success: results.validation_passed,
      location_tracking_validation: results
    });
  } catch (error) {
    console.error('Error validating location tracking:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.post('/test/sample-data', async (req, res) => {
  try {
    const { weekStart, weekEnd } = req.body;
    
    if (!weekStart || !weekEnd) {
      return res.status(400).json({
        success: false,
        error: 'weekStart and weekEnd are required in request body'
      });
    }

    const habitTrackingValidator = require('./services/testing/HabitTrackingFlowValidator');
    
    // Create sample data for the specified week
    const testWeek = { weekStart, weekEnd };
    const sampleData = await habitTrackingValidator.createSampleData(testWeek);
    
    res.json({
      success: true,
      message: `Sample data created for week ${weekStart} to ${weekEnd}`,
      sample_data: sampleData,
      warning: 'This creates real data in your Notion databases. Manual cleanup required.'
    });
  } catch (error) {
    console.error('Error creating sample data:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.post('/test/punishment-scenarios', async (req, res) => {
  try {
    const habitTrackingValidator = require('./services/testing/HabitTrackingFlowValidator');
    const results = await habitTrackingValidator.testPunishmentScenarios();
    
    const allPassed = results.every(r => !r.error && r.routesMatch);
    
    res.json({
      success: allPassed,
      punishment_scenario_results: results,
      message: allPassed ? 
        'All punishment scenarios passed' : 
        'Some punishment scenarios failed'
    });
  } catch (error) {
    console.error('Error testing punishment scenarios:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.get('/test/daily-reconciliation-response', async (req, res) => {
  try {
    const habitTrackingValidator = require('./services/testing/HabitTrackingFlowValidator');
    const results = await habitTrackingValidator.testDailyReconciliationResponse();
    
    res.json({
      success: !!results.habits,
      daily_reconciliation_test: results,
      message: results.habits ? 
        'Daily reconciliation includes habit progress data' : 
        'Daily reconciliation missing habit progress data'
    });
  } catch (error) {
    console.error('Error testing daily reconciliation response:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.get('/test/integration-health', async (req, res) => {
  try {
    const habitsService = require('./services/core/habits');
    const uberEarningsService = require('./services/integrations/uber/earnings');
    const locationTrackingService = require('./services/integrations/location/tracking');
    const punishmentService = require('./services/core/punishments');

    const healthChecks = await Promise.allSettled([
      habitsService.healthCheck(),
      uberEarningsService.healthCheck(),
      locationTrackingService.healthCheck(),
      punishmentService.getPendingPunishments() // Test punishment service
    ]);

    const [habitsHealth, uberHealth, locationHealth, punishmentTest] = healthChecks;

    const allHealthy = healthChecks.every(check => check.status === 'fulfilled');

    res.json({
      success: allHealthy,
      integration_health: {
        habits_service: habitsHealth.status === 'fulfilled' ? habitsHealth.value : { error: habitsHealth.reason?.message },
        uber_earnings_service: uberHealth.status === 'fulfilled' ? uberHealth.value : { error: uberHealth.reason?.message },
        location_tracking_service: locationHealth.status === 'fulfilled' ? locationHealth.value : { error: locationHealth.reason?.message },
        punishment_service: punishmentTest.status === 'fulfilled' ? { status: 'healthy', tested: 'getPendingPunishments' } : { error: punishmentTest.reason?.message }
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error checking integration health:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Discord Bot Integration Test endpoint
app.get('/test/discord-bot-data', async (req, res) => {
  try {
    // Simulate the data that would be sent to Discord bot
    const reconciliationController = require('./controllers/reconciliation');
    
    // Mock request for daily reconciliation
    const mockReq = {
      body: { date: new Date().toISOString().split('T')[0] },
      headers: { accept: 'application/json' }
    };
    
    const mockRes = {
      json: (data) => data,
      status: (code) => ({ json: (data) => ({ status: code, ...data }) })
    };

    // Get the data that would be returned to Discord bot
    const discordData = await new Promise((resolve, reject) => {
      const originalJson = mockRes.json;
      mockRes.json = (data) => {
        resolve(data);
        return originalJson(data);
      };
      
      reconciliationController.runReconciliation(mockReq, mockRes).catch(reject);
    });

    // Validate Discord bot data structure
    const hasRequiredFields = !!(
      discordData.success &&
      discordData.type === 'daily' &&
      discordData.results &&
      discordData.habits
    );

    res.json({
      success: hasRequiredFields,
      discord_bot_data: discordData,
      data_structure_valid: hasRequiredFields,
      message: hasRequiredFields ? 
        'Discord bot data structure is valid' : 
        'Discord bot data structure is invalid or incomplete'
    });

  } catch (error) {
    console.error('Error testing Discord bot data:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
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