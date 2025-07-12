const tellerService = require('../services/integrations/teller');

class TellerAuthController {
  constructor() {
    this.environment = process.env.TELLER_ENVIRONMENT || 'sandbox';
    this.appId = process.env.TELLER_APP_ID;
    this.redirectUri = process.env.TELLER_REDIRECT_URI || 'http://localhost:3005/auth/teller/callback';
  }

  // Simple Teller Connect flow
  startAuth(req, res) {
    try {
      if (!tellerService.isConfigured()) {
        return res.status(500).json({
          error: 'Teller certificates not configured properly',
          details: 'Make sure TELLER_CERT_PATH and TELLER_KEY_PATH are set correctly'
        });
      }

      const appId = process.env.TELLER_APP_ID;
      if (!appId) {
        return res.status(500).json({
          error: 'Teller App ID not configured',
          details: 'Make sure TELLER_APP_ID is set in your .env file'
        });
      }

      // Clean, simple Teller Connect URL with explicit callback
      const callbackUrl = process.env.TELLER_REDIRECT_URI || 'http://localhost:3005/auth/teller/callback';
      const connectUrl = `https://teller.io/connect/${appId}?redirect_uri=${encodeURIComponent(callbackUrl)}`;
      
      console.log('🔗 TELLER CONNECT URL:', connectUrl);
      console.log('📍 CALLBACK URL:', callbackUrl);

      const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>Teller Bank Connection</title>
            <script src="https://cdn.teller.io/connect/connect.js"></script>
            <style>
                body { font-family: Arial, sans-serif; max-width: 800px; margin: 50px auto; padding: 20px; }
                .button { display: inline-block; padding: 12px 24px; background: #007bff; color: white; border: none; border-radius: 4px; margin: 10px 0; cursor: pointer; font-size: 16px; }
                .info { background: #f8f9fa; padding: 15px; border-radius: 4px; margin: 15px 0; }
                .success { background: #d4edda; color: #155724; padding: 15px; border-radius: 4px; margin: 15px 0; }
                .token-display { background: #f8f9fa; padding: 15px; border-radius: 4px; margin: 15px 0; font-family: monospace; word-break: break-all; }
                .hidden { display: none; }
            </style>
        </head>
        <body>
            <h1>🏦 Connect Your Bank Account</h1>
            
            <div class="info">
                <h3>Setup Status</h3>
                <p>✅ Environment: ${(process.env.TELLER_ENVIRONMENT || 'sandbox').toUpperCase()}</p>
                <p>✅ App ID: ${appId}</p>
                <p>✅ Certificates: Configured</p>
            </div>

            <div class="info">
                <h2>Connect Your Bank</h2>
                <p>Click the button below to securely connect your bank account through Teller:</p>
                <button id="connectButton" class="button">🏦 Connect Bank Account</button>
                
                <div style="background: #fff3cd; color: #856404; padding: 10px; border-radius: 4px; margin: 15px 0;">
                    <strong>⚠️ SANDBOX MODE - Use These Exact Test Credentials:</strong><br>
                    <small>• Select any bank (they all work the same in sandbox)</small><br>
                    <small>• Username: <code>username</code></small><br>
                    <small>• Password: <code>password</code></small><br>
                    <small>• Do NOT use real bank credentials in sandbox mode!</small>
                </div>
            </div>

            <div id="results" class="hidden">
                <div class="success">
                    <h2>🎉 Success! Your Access Token:</h2>
                    <div id="tokenDisplay" class="token-display"></div>
                    <button onclick="copyToken()" class="button">📋 Copy Token</button>
                </div>
                
                <div class="info">
                    <h3>Account Information:</h3>
                    <div id="accountInfo"></div>
                </div>

                <div class="info">
                    <h3>🧪 Test Your Token:</h3>
                    <button onclick="testToken()" class="button">Test Token with API</button>
                    <div id="testResults"></div>
                </div>
            </div>

            <script>
                let accessToken = null;

                // Initialize Teller Connect
                const tellerConnect = TellerConnect.setup({
                    applicationId: '${appId}',
                    environment: '${(process.env.TELLER_ENVIRONMENT || 'sandbox').toLowerCase()}',
                    onSuccess: function(enrollment) {
                        console.log('🎉🎉🎉 TELLER SUCCESS!!! 🎉🎉🎉');
                        console.log('Full enrollment object:', enrollment);
                        console.log('Access Token:', enrollment.accessToken);
                        
                        // Store the token
                        accessToken = enrollment.accessToken;
                        
                        // Display results
                        document.getElementById('results').classList.remove('hidden');
                        document.getElementById('tokenDisplay').innerHTML = 
                            '<strong>Access Token:</strong><br>' + enrollment.accessToken;
                        
                        document.getElementById('accountInfo').innerHTML = 
                            '<pre>' + JSON.stringify(enrollment, null, 2) + '</pre>';
                        
                        // Also send to server for logging
                        fetch('/auth/teller/callback', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                success: true,
                                accessToken: enrollment.accessToken,
                                enrollment: enrollment
                            })
                        });
                    },
                    onExit: function() {
                        console.log('User exited Teller Connect');
                    },
                    onFailure: function(error) {
                        console.error('Teller Connect failed:', error);
                        alert('Connection failed: ' + JSON.stringify(error));
                    }
                });

                // Attach click handler
                document.getElementById('connectButton').addEventListener('click', function() {
                    console.log('🚀 Starting Teller Connect...');
                    tellerConnect.open();
                });

                function copyToken() {
                    navigator.clipboard.writeText(accessToken).then(function() {
                        alert('Access token copied to clipboard!');
                    });
                }

                async function testToken() {
                    if (!accessToken) {
                        alert('No access token available');
                        return;
                    }

                    const resultsDiv = document.getElementById('testResults');
                    resultsDiv.innerHTML = '<p>Testing token...</p>';

                    try {
                        const response = await fetch('/teller/accounts?access_token=' + encodeURIComponent(accessToken));
                        const data = await response.json();
                        
                        resultsDiv.innerHTML = '<h4>API Test Results:</h4><pre>' + JSON.stringify(data, null, 2) + '</pre>';
                    } catch (error) {
                        resultsDiv.innerHTML = '<p style="color: red;">Error: ' + error.message + '</p>';
                    }
                }
            </script>
        </body>
        </html>
      `;

      res.send(html);
    } catch (error) {
      console.error('Error starting Teller auth:', error);
      res.status(500).json({
        error: 'Failed to start Teller authentication',
        message: error.message
      });
    }
  }

  // Handle Teller Connect callback (now from JavaScript)
  async handleCallback(req, res) {
    try {
      console.log('🚨🚨🚨 TELLER CALLBACK HIT!!! 🚨🚨🚨');
      console.log('🚨 Method:', req.method);
      console.log('🚨 Body:', req.body);
      
      if (req.method === 'POST' && req.body?.success) {
        // This is from our JavaScript success callback
        console.log('🎉🎉🎉 SUCCESS FROM JAVASCRIPT!!! 🎉🎉🎉');
        console.log('🎯 ACCESS TOKEN:', req.body.accessToken);
        console.log('📋 FULL ENROLLMENT:', req.body.enrollment);
        
        // Auto-detect and store the token
        if (req.body.accessToken) {
          const tellerService = require('../services/integrations/teller');
          try {
            const detection = await tellerService.detectAndStoreToken(req.body.accessToken);
            console.log('✅ TOKEN DETECTION:', detection);
          } catch (error) {
            console.log('❌ TOKEN DETECTION FAILED:', error.message);
          }
        }
        
        return res.json({ success: true, message: 'Token received and logged!' });
      }
      
      // Legacy handling for any other callback attempts
      const { token, access_token, code, error } = req.query;
      const receivedToken = token || access_token || code;

      if (error) {
        return res.send(`
          <!DOCTYPE html>
          <html>
          <head><title>Teller Connection Error</title></head>
          <body style="font-family: Arial; max-width: 600px; margin: 50px auto; padding: 20px;">
            <h1>❌ Teller Connection Failed</h1>
            <div style="background: #f8d7da; color: #721c24; padding: 15px; border-radius: 4px;">
              <p><strong>Error:</strong> ${error}</p>
            </div>
            <a href="/auth/teller" style="display: inline-block; padding: 10px 20px; background: #007bff; color: white; text-decoration: none; border-radius: 4px; margin-top: 20px;">← Back to Dashboard</a>
          </body>
          </html>
        `);
      }

      if (receivedToken) {
        // We got a token! Test it immediately
        const tellerService = require('../services/integrations/teller');
        
        try {
          console.log('🔑 Testing received token:', receivedToken.substring(0, 10) + '...');
          const accounts = await tellerService.getAccounts(receivedToken);
          
          const html = `
            <!DOCTYPE html>
            <html>
            <head>
                <title>🎉 Teller Connection Success!</title>
                <style>
                    body { font-family: Arial, sans-serif; max-width: 800px; margin: 50px auto; padding: 20px; }
                    .success { background: #d4edda; color: #155724; padding: 15px; border-radius: 4px; margin: 15px 0; }
                    .token { background: #f8f9fa; padding: 15px; border-radius: 4px; margin: 15px 0; font-family: monospace; word-break: break-all; }
                    .button { display: inline-block; padding: 10px 20px; background: #007bff; color: white; text-decoration: none; border-radius: 4px; margin: 5px; }
                    table { width: 100%; border-collapse: collapse; margin: 20px 0; }
                    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
                    th { background-color: #f2f2f2; }
                </style>
            </head>
            <body>
                <h1>🎉 SUCCESS! Your Bank Account is Connected!</h1>
                
                <div class="success">
                    <h3>✅ Connection Complete</h3>
                    <p>Found ${accounts.length} account(s) from your bank!</p>
                </div>

                <h2>🔑 Your Access Token</h2>
                <div class="token">
                    <strong>Access Token:</strong> ${receivedToken}
                    <button onclick="copyToClipboard('${token}')" style="margin-left: 10px; padding: 5px 10px; background: #28a745; color: white; border: none; border-radius: 3px;">Copy</button>
                </div>
                <p><strong>Save this token!</strong> You'll use it to check your account balances.</p>

                <h2>📊 Your Connected Accounts</h2>
                <table>
                    <tr>
                        <th>Account ID</th>
                        <th>Name</th>
                        <th>Type</th>
                        <th>Institution</th>
                        <th>Balance</th>
                    </tr>
                    ${accounts.map(account => `
                        <tr>
                            <td><code>${account.id}</code></td>
                            <td>${account.name || 'N/A'}</td>
                            <td>${account.type} ${account.subtype ? '(' + account.subtype + ')' : ''}</td>
                            <td>${account.institution?.name || 'N/A'}</td>
                            <td><strong>$${parseFloat(account.balance || 0).toFixed(2)}</strong></td>
                        </tr>
                    `).join('')}
                </table>

                <h2>🧪 Test Your Integration</h2>
                <div style="background: #f8f9fa; padding: 15px; border-radius: 4px;">
                    <p><strong>API Endpoints you can now use:</strong></p>
                    <ul>
                        <li><strong>All Accounts:</strong> <code>GET /teller/accounts?access_token=${receivedToken}</code></li>
                        ${accounts.map(account => `
                            <li><strong>${account.name || account.id}:</strong> <code>GET /teller/accounts/${account.id}/balance?access_token=${receivedToken}</code></li>
                        `).join('')}
                    </ul>
                </div>

                <div style="margin: 30px 0;">
                    <a href="/auth/teller" class="button">← Back to Dashboard</a>
                    <a href="/teller/accounts?access_token=${encodeURIComponent(receivedToken)}" class="button">🔍 View Accounts JSON</a>
                </div>

                <script>
                    function copyToClipboard(text) {
                        navigator.clipboard.writeText(text).then(function() {
                            alert('Access token copied to clipboard!');
                        });
                    }
                    
                    // Also log to console for easy access
                    console.log('🔑 Teller Access Token:', '${receivedToken}');
                    console.log('📊 Account Data:', ${JSON.stringify(accounts)});
                </script>
            </body>
            </html>
          `;
          
          res.send(html);
          
        } catch (testError) {
          console.error('❌ Error testing token:', testError);
          res.send(`
            <!DOCTYPE html>
            <html>
            <head><title>Token Received but Invalid</title></head>
            <body style="font-family: Arial; max-width: 600px; margin: 50px auto; padding: 20px;">
              <h1>⚠️ Token Received but Can't Access Accounts</h1>
              <div style="background: #fff3cd; color: #856404; padding: 15px; border-radius: 4px;">
                <p><strong>Token:</strong> ${receivedToken}</p>
                <p><strong>Error:</strong> ${testError.message}</p>
              </div>
              <p>The token was received but we couldn't fetch accounts. This might be normal - try using the token manually.</p>
              <a href="/auth/teller" style="display: inline-block; padding: 10px 20px; background: #007bff; color: white; text-decoration: none; border-radius: 4px; margin-top: 20px;">← Back to Dashboard</a>
            </body>
            </html>
          `);
        }
      } else {
        // No token received, show what we got
        res.send(`
          <!DOCTYPE html>
          <html>
          <head><title>Teller Callback</title></head>
          <body style="font-family: Arial; max-width: 600px; margin: 50px auto; padding: 20px;">
            <h1>🔄 Teller Callback Received</h1>
            <div style="background: #f8f9fa; padding: 15px; border-radius: 4px;">
              <p><strong>Query Parameters:</strong></p>
              <pre>${JSON.stringify(req.query, null, 2)}</pre>
            </div>
            <p>No access token found. Expected 'token', 'access_token', or 'code' parameter.</p>
            <a href="/auth/teller" style="display: inline-block; padding: 10px 20px; background: #007bff; color: white; text-decoration: none; border-radius: 4px; margin-top: 20px;">← Back to Dashboard</a>
          </body>
          </html>
        `);
      }

    } catch (error) {
      console.error('❌ Error handling Teller callback:', error);
      res.status(500).send(`
        <!DOCTYPE html>
        <html>
        <head><title>Callback Error</title></head>
        <body style="font-family: Arial; max-width: 600px; margin: 50px auto; padding: 20px;">
          <h1>❌ Callback Error</h1>
          <p>Error: ${error.message}</p>
          <a href="/auth/teller" style="display: inline-block; padding: 10px 20px; background: #007bff; color: white; text-decoration: none; border-radius: 4px; margin-top: 20px;">← Back to Dashboard</a>
        </body>
        </html>
      `);
    }
  }
}

module.exports = new TellerAuthController();