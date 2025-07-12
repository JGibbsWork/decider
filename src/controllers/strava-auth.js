const stravaService = require('../services/integrations/strava');
const fs = require('fs');
const path = require('path');

// Start the authorization process
const startAuth = async (req, res) => {
  try {
    const clientId = process.env.STRAVA_CLIENT_ID;
    const redirectUri = `${req.protocol}://${req.get('host')}/auth/strava/callback`;
    
    // Required scopes for reading activities
    const scopes = 'activity:read';
    
    const authUrl = `https://www.strava.com/oauth/authorize?` +
      `client_id=${clientId}&` +
      `redirect_uri=${encodeURIComponent(redirectUri)}&` +
      `response_type=code&` +
      `scope=${scopes}&` +
      `approval_prompt=force`; // Force re-authorization to get new scopes

    // Return HTML page with authorization link
    const html = `
    <!DOCTYPE html>
    <html>
    <head>
        <title>Strava Authorization</title>
        <style>
            body { font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; }
            .auth-container { text-align: center; border: 1px solid #ccc; padding: 30px; border-radius: 8px; }
            .auth-button { background: #FC4C02; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; display: inline-block; margin: 20px 0; }
            .auth-button:hover { background: #E04000; }
            .info { background: #f0f0f0; padding: 15px; margin: 20px 0; border-radius: 5px; }
            .current-status { margin: 20px 0; padding: 15px; background: #fff3cd; border-radius: 5px; }
        </style>
    </head>
    <body>
        <div class="auth-container">
            <h1>🏃 Strava Authorization</h1>
            
            <div class="current-status">
                <strong>Current Status:</strong> Missing activity:read permission<br>
                <small>Your Strava app needs permission to read your activities for workout tracking.</small>
            </div>

            <div class="info">
                <h3>What this will do:</h3>
                <ul style="text-align: left;">
                    <li>Grant permission to read your Strava activities</li>
                    <li>Allow the app to fetch your daily workouts</li>
                    <li>Enable automatic workout tracking in your accountability system</li>
                </ul>
            </div>

            <a href="${authUrl}" class="auth-button">
                Authorize with Strava
            </a>

            <p><small>You'll be redirected to Strava to grant permissions, then back here.</small></p>
            
            <div style="margin-top: 30px; padding: 15px; background: #f8f9fa; border-radius: 5px;">
                <h4>Still having issues?</h4>
                <p>If authorization keeps failing, you may need to:</p>
                <ol style="text-align: left; margin: 10px 0;">
                    <li>Go to <a href="https://www.strava.com/settings/apps" target="_blank">Strava → Settings → My Apps</a></li>
                    <li>Find "Decider" and click "Revoke Access"</li>
                    <li>Come back here and try authorization again</li>
                </ol>
            </div>
            
            <hr>
            <p><a href="/current/status">← Back to Status</a></p>
        </div>
    </body>
    </html>`;

    res.send(html);

  } catch (error) {
    console.error('Error starting Strava auth:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

// Handle the callback from Strava
const handleCallback = async (req, res) => {
  try {
    const { code, error } = req.query;

    if (error) {
      return res.status(400).send(`
        <h1>Authorization Failed</h1>
        <p>Error: ${error}</p>
        <p><a href="/auth/strava">Try again</a></p>
      `);
    }

    if (!code) {
      return res.status(400).send(`
        <h1>Authorization Failed</h1>
        <p>No authorization code received from Strava</p>
        <p><a href="/auth/strava">Try again</a></p>
      `);
    }

    // Exchange code for access token
    console.log('🔄 Exchanging authorization code for token...');
    const tokenResponse = await exchangeCodeForToken(code, req);
    
    if (!tokenResponse.success) {
      console.error('❌ Token exchange failed:', tokenResponse.error);
      return res.status(400).send(`
        <h1>Token Exchange Failed</h1>
        <p>Error: ${tokenResponse.error}</p>
        <p><a href="/auth/strava">Try again</a></p>
      `);
    }

    console.log('✅ Token exchange successful');
    console.log('📋 Token info:', {
      access_token: tokenResponse.tokens.access_token.substring(0, 20) + '...',
      scope: tokenResponse.tokens.scope,
      expires_at: new Date(tokenResponse.tokens.expires_at * 1000).toISOString()
    });

    // Test the new token immediately
    console.log('🧪 Testing new token...');
    const testResult = await testNewToken(tokenResponse.tokens.access_token);
    console.log('🔍 Token test result:', testResult);

    // Update .env file with new tokens
    const envPath = path.join(__dirname, '../../.env');
    const envUpdate = await updateEnvFile(envPath, tokenResponse.tokens);

    // Update tokens in memory for immediate use (no restart required)
    stravaService.updateTokens(tokenResponse.tokens.access_token, tokenResponse.tokens.refresh_token);

    const html = `
    <!DOCTYPE html>
    <html>
    <head>
        <title>Strava Authorization Complete</title>
        <style>
            body { font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; }
            .success-container { text-align: center; border: 1px solid #28a745; padding: 30px; border-radius: 8px; background: #d4edda; }
            .token-info { background: #f8f9fa; padding: 15px; margin: 20px 0; border-radius: 5px; text-align: left; }
            .next-steps { background: #e2e3e5; padding: 15px; margin: 20px 0; border-radius: 5px; }
            .button { background: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block; margin: 10px 5px; }
        </style>
    </head>
    <body>
        <div class="success-container">
            <h1>✅ Strava Authorization Complete!</h1>
            
            <div class="token-info">
                <h3>New Tokens Received:</h3>
                <p><strong>Access Token:</strong> ${tokenResponse.tokens.access_token.substring(0, 20)}...</p>
                <p><strong>Refresh Token:</strong> ${tokenResponse.tokens.refresh_token.substring(0, 20)}...</p>
                <p><strong>Expires:</strong> ${new Date(tokenResponse.tokens.expires_at * 1000).toLocaleString()}</p>
                <p><strong>Scopes:</strong> ${tokenResponse.tokens.scope}</p>
            </div>

            <div class="next-steps">
                <h3>✅ Ready to Use:</h3>
                <p><strong>Good news:</strong> Your tokens are now active and ready to use immediately!</p>
                <p>No server restart required - the integration is working now.</p>
            </div>

            <a href="/health" class="button">Check Health Status</a>
            <a href="/current/status" class="button">View Current Status</a>
        </div>
    </body>
    </html>`;

    res.send(html);

  } catch (error) {
    console.error('Error in Strava callback:', error);
    res.status(500).send(`
      <h1>Callback Error</h1>
      <p>Error: ${error.message}</p>
      <p><a href="/auth/strava">Try again</a></p>
    `);
  }
};

// Exchange authorization code for access token
async function exchangeCodeForToken(code, req) {
  try {
    const clientId = process.env.STRAVA_CLIENT_ID;
    const clientSecret = process.env.STRAVA_CLIENT_SECRET;
    const redirectUri = `${req.protocol}://${req.get('host')}/auth/strava/callback`;

    const response = await fetch('https://www.strava.com/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code: code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri
      })
    });

    const tokens = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: tokens.message || 'Token exchange failed'
      };
    }

    return {
      success: true,
      tokens: tokens
    };

  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

// Test a new token immediately
async function testNewToken(accessToken) {
  try {
    const response = await fetch('https://www.strava.com/api/v3/athlete/activities?per_page=1', {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });

    if (!response.ok) {
      const error = await response.json();
      return {
        success: false,
        error: error.message || 'Failed to fetch activities',
        details: error
      };
    }

    const activities = await response.json();
    return {
      success: true,
      activities_count: activities.length,
      can_read_activities: true
    };

  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

// Update .env file with new tokens
async function updateEnvFile(envPath, tokens) {
  try {
    let envContent = fs.readFileSync(envPath, 'utf8');
    
    // Update tokens in .env content
    envContent = envContent.replace(
      /STRAVA_ACCESS_TOKEN=.*/,
      `STRAVA_ACCESS_TOKEN=${tokens.access_token}`
    );
    
    envContent = envContent.replace(
      /STRAVA_REFRESH_TOKEN=.*/,
      `STRAVA_REFRESH_TOKEN=${tokens.refresh_token}`
    );

    // Write back to file
    fs.writeFileSync(envPath, envContent, 'utf8');
    
    console.log('✅ Updated .env file with new Strava tokens');
    return { success: true };

  } catch (error) {
    console.error('Error updating .env file:', error);
    return { success: false, error: error.message };
  }
}

module.exports = {
  startAuth,
  handleCallback
};