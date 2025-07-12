// src/services/integrations/teller/index.js
const axios = require('axios');
const https = require('https');
const fs = require('fs');
const path = require('path');

class TellerService {
  constructor() {
    this.baseURL = 'https://api.teller.io';
    this.environment = process.env.TELLER_ENVIRONMENT || 'sandbox';
    
    // Path to your certificate files
    this.certPath = process.env.TELLER_CERT_PATH || path.join(process.cwd(), 'certificate.pem');
    this.keyPath = process.env.TELLER_KEY_PATH || path.join(process.cwd(), 'private_key.pem');
    
    // In-memory token storage with bank detection
    this.bankTokens = {
      checking: null,     // Token for bank with checking account
      ubereats: null,     // Token for bank with UberEats account  
      zelle: null         // Token for bank with Zelle source account
    };
    
    // Create HTTPS agent with mTLS certificate authentication
    this.httpsAgent = this.createHttpsAgent();
    
    this.client = axios.create({
      baseURL: this.baseURL,
      httpsAgent: this.httpsAgent,
      headers: {
        'Teller-Version': '2020-10-12',
        'Content-Type': 'application/json'
      },
      timeout: 10000 // 10 second timeout
    });
  }

  createHttpsAgent() {
    try {
      // Check if certificate files exist
      if (!fs.existsSync(this.certPath)) {
        console.warn(`Teller certificate not found at: ${this.certPath}`);
        return null;
      }
      
      if (!fs.existsSync(this.keyPath)) {
        console.warn(`Teller private key not found at: ${this.keyPath}`);
        return null;
      }

      // Read certificate and private key
      const cert = fs.readFileSync(this.certPath);
      const key = fs.readFileSync(this.keyPath);

      // Create HTTPS agent with mutual TLS
      const agent = new https.Agent({
        cert: cert,
        key: key,
        // For sandbox, you might need to set rejectUnauthorized to false
        // In production, this should be true for security
        rejectUnauthorized: this.environment === 'live'
      });

      console.log('✅ Teller mTLS agent created successfully');
      return agent;

    } catch (error) {
      console.error('❌ Error creating Teller HTTPS agent:', error.message);
      return null;
    }
  }

  // Check if Teller is properly configured
  isConfigured() {
    return this.httpsAgent !== null;
  }

  // Make authenticated request with access token
  async makeAuthenticatedRequest(method, endpoint, data = null, accessToken = null) {
    try {
      if (!this.isConfigured()) {
        throw new Error('Teller certificates not properly configured');
      }

      const config = {
        method: method,
        url: endpoint,
        httpsAgent: this.httpsAgent
      };

      // Add HTTP Basic Auth with access token if provided
      if (accessToken) {
        config.auth = {
          username: accessToken,
          password: ''
        };
      }

      if (data) {
        config.data = data;
      }

      const response = await this.client(config);
      return response.data;

    } catch (error) {
      console.error(`Teller API Error (${method} ${endpoint}):`, error.response?.data || error.message);
      throw error;
    }
  }

  // Get all connected accounts (requires access token)
  async getAccounts(accessToken) {
    if (!accessToken) {
      throw new Error('Access token required to fetch accounts');
    }
    return await this.makeAuthenticatedRequest('GET', '/accounts', null, accessToken);
  }

  // Get account balance for specific account (requires access token)
  async getAccountBalance(accountId, accessToken) {
    if (!accessToken) {
      throw new Error('Access token required to fetch account balance');
    }
    
    console.log(`🔍 Fetching balance for account: ${accountId}`);
    console.log(`🔍 Using access token: ${accessToken.substring(0, 10)}...`);
    
    try {
      // Use the correct Teller API endpoint for balances
      const balanceResponse = await this.makeAuthenticatedRequest('GET', `/accounts/${accountId}/balances`, null, accessToken);
      console.log('✅ Balance response received:', balanceResponse);
      
      // Also get account details for additional context
      const account = await this.makeAuthenticatedRequest('GET', `/accounts/${accountId}`, null, accessToken);
      console.log('✅ Account details received:', account);
      
      // According to Teller docs, balance response is an object with ledger/available properties
      const availableBalance = balanceResponse.available || balanceResponse.ledger;
      
      return {
        accountId: account.id,
        balance: parseFloat(availableBalance),
        ledgerBalance: parseFloat(balanceResponse.ledger),
        availableBalance: parseFloat(balanceResponse.available),
        currency: account.currency,
        name: account.name,
        type: account.type,
        subtype: account.subtype,
        lastUpdated: new Date().toISOString()
      };
    } catch (error) {
      console.error('❌ Error in getAccountBalance:', error);
      console.error('❌ Error response:', error.response?.data);
      console.error('❌ Error status:', error.response?.status);
      
      // Handle specific Teller enrollment issues
      if (error.response?.data?.error?.code?.includes('enrollment.disconnected')) {
        const errorCode = error.response.data.error.code;
        let userFriendlyMessage = 'Account connection has been disconnected. ';
        
        if (errorCode.includes('mfa_required')) {
          userFriendlyMessage += 'Multi-factor authentication is required to reconnect your account.';
        } else if (errorCode.includes('user_action')) {
          userFriendlyMessage += 'User action is required to reconnect your account.';
        } else {
          userFriendlyMessage += 'Please reconnect your account through Teller Connect.';
        }
        
        throw new Error(`${userFriendlyMessage} (Error: ${errorCode})`);
      }
      
      throw error;
    }
  }

  // Get transactions for a specific date range (requires access token)
  async getTransactions(accountId, accessToken, startDate = null, endDate = null) {
    if (!accessToken) {
      throw new Error('Access token required to fetch transactions');
    }

    let endpoint = `/accounts/${accountId}/transactions`;
    const params = new URLSearchParams();
    
    if (startDate) params.append('from_date', startDate);
    if (endDate) params.append('to_date', endDate);
    
    if (params.toString()) {
      endpoint += `?${params.toString()}`;
    }

    const transactions = await this.makeAuthenticatedRequest('GET', endpoint, null, accessToken);
    
    return transactions.map(transaction => ({
      id: transaction.id,
      amount: parseFloat(transaction.amount),
      date: transaction.date,
      description: transaction.description,
      category: transaction.details?.category,
      counterparty: transaction.details?.counterparty?.name,
      type: transaction.type,
      status: transaction.status
    }));
  }

  // Get Uber-related transactions (income only)
  async getUberEarnings(accountId, accessToken, date) {
    try {
      const transactions = await this.getTransactions(accountId, accessToken, date, date);
      
      // Filter for Uber-related positive transactions
      const uberEarnings = transactions.filter(transaction => {
        const description = transaction.description.toLowerCase();
        const counterparty = (transaction.counterparty || '').toLowerCase();
        
        // Look for Uber-related income
        const isUberRelated = description.includes('uber') || 
                             counterparty.includes('uber') ||
                             description.includes('uber eats') ||
                             counterparty.includes('uber eats') ||
                             description.includes('ubereats');
        
        // Only positive amounts (income)
        const isIncome = transaction.amount > 0;
        
        return isUberRelated && isIncome;
      });

      const totalEarnings = uberEarnings.reduce((sum, transaction) => sum + transaction.amount, 0);
      
      return {
        date: date,
        totalEarnings: totalEarnings,
        transactions: uberEarnings,
        count: uberEarnings.length
      };
    } catch (error) {
      console.error('Error getting Uber earnings:', error);
      return { date: date, totalEarnings: 0, transactions: [], count: 0 };
    }
  }

  // Enhanced method for comprehensive financial tracking
  async getDailyFinancialSummary(accountId, accessToken, date) {
    try {
      const [balance, transactions, uberEarnings] = await Promise.all([
        this.getAccountBalance(accountId, accessToken),
        this.getTransactions(accountId, accessToken, date, date),
        this.getUberEarnings(accountId, accessToken, date)
      ]);

      // Categorize transactions
      const income = transactions.filter(t => t.amount > 0);
      const expenses = transactions.filter(t => t.amount < 0);
      
      const summary = {
        date: date,
        balance: balance,
        transactions: {
          total: transactions.length,
          income: income.length,
          expenses: expenses.length
        },
        amounts: {
          totalIncome: income.reduce((sum, t) => sum + t.amount, 0),
          totalExpenses: Math.abs(expenses.reduce((sum, t) => sum + t.amount, 0)),
          netChange: transactions.reduce((sum, t) => sum + t.amount, 0)
        },
        uber: uberEarnings,
        categories: this.categorizeDailySpending(transactions)
      };

      return summary;
    } catch (error) {
      console.error('Error getting daily financial summary:', error);
      throw error;
    }
  }

  // Helper method to categorize spending
  categorizeDailySpending(transactions) {
    const categories = {};
    
    transactions.forEach(transaction => {
      if (transaction.amount < 0 && transaction.category) {
        const category = transaction.category;
        if (!categories[category]) {
          categories[category] = { count: 0, amount: 0 };
        }
        categories[category].count++;
        categories[category].amount += Math.abs(transaction.amount);
      }
    });

    return categories;
  }

  // Health check method (doesn't require access token for basic cert validation)
  async healthCheck() {
    try {
      if (!this.isConfigured()) {
        return {
          status: 'unhealthy',
          connected: false,
          error: 'Certificate files not found or invalid',
          environment: this.environment,
          certPath: this.certPath,
          keyPath: this.keyPath
        };
      }

      // Try to make a basic request to test certificate authentication
      // This endpoint might not require an access token in sandbox
      try {
        await this.client.get('/');
        return {
          status: 'healthy',
          connected: true,
          environment: this.environment,
          certificateAuth: true
        };
      } catch (error) {
        // If we get a 401, it means our certificates work but we need an access token
        if (error.response?.status === 401) {
          return {
            status: 'healthy',
            connected: true,
            environment: this.environment,
            certificateAuth: true,
            note: 'Certificate authentication working, access token required for data access'
          };
        }
        throw error;
      }

    } catch (error) {
      return {
        status: 'unhealthy',
        connected: false,
        error: error.message,
        environment: this.environment
      };
    }
  }

  // Get UberEats account balance by account type/name
  async getUberEatsAccountBalance(accessToken) {
    if (!accessToken) {
      throw new Error('Access token required to fetch UberEats account balance');
    }

    try {
      const accounts = await this.getAccounts(accessToken);
      
      // Find UberEats account - look for accounts with "uber" in the name or specific account types
      const uberAccount = accounts.find(account => {
        const name = (account.name || '').toLowerCase();
        const institution = (account.institution?.name || '').toLowerCase();
        return name.includes('uber') || name.includes('ubereats') || institution.includes('uber');
      });

      if (!uberAccount) {
        throw new Error('UberEats account not found. Please ensure the account is connected.');
      }

      return await this.getAccountBalance(uberAccount.id, accessToken);
    } catch (error) {
      console.error('Error getting UberEats account balance:', error);
      throw error;
    }
  }

  // Get checking account balance by account type
  async getCheckingAccountBalance(accessToken) {
    if (!accessToken) {
      throw new Error('Access token required to fetch checking account balance');
    }

    try {
      const accounts = await this.getAccounts(accessToken);
      
      // Find checking account - look for accounts with type "depository" and subtype "checking"
      const checkingAccount = accounts.find(account => {
        return account.type === 'depository' && account.subtype === 'checking';
      });

      if (!checkingAccount) {
        throw new Error('Checking account not found. Please ensure a checking account is connected.');
      }

      return await this.getAccountBalance(checkingAccount.id, accessToken);
    } catch (error) {
      console.error('Error getting checking account balance:', error);
      throw error;
    }
  }

  // Initiate Zelle transfer between accounts
  async initiateZelleTransfer(fromAccountId, toRecipient, amount, memo, accessToken) {
    if (!accessToken) {
      throw new Error('Access token required to initiate Zelle transfer');
    }

    if (!fromAccountId || !toRecipient || !amount) {
      throw new Error('From account ID, recipient, and amount are required for Zelle transfer');
    }

    if (amount <= 0) {
      throw new Error('Transfer amount must be greater than zero');
    }

    try {
      // Validate the from account exists and is accessible
      const accounts = await this.getAccounts(accessToken);
      const fromAccount = accounts.find(account => account.id === fromAccountId);
      
      if (!fromAccount) {
        throw new Error(`Source account ${fromAccountId} not found or not accessible`);
      }

      // Check if account supports Zelle transfers
      if (!fromAccount.capabilities || !fromAccount.capabilities.includes('transfer')) {
        throw new Error('Source account does not support transfers');
      }

      // Prepare transfer payload
      const transferPayload = {
        account_id: fromAccountId,
        counterparty: {
          name: toRecipient.name || 'Transfer Recipient',
          routing_number: toRecipient.routingNumber || null,
          account_number: toRecipient.accountNumber || null,
          email: toRecipient.email || null,
          phone: toRecipient.phone || null
        },
        amount: amount.toString(),
        memo: memo || 'Zelle transfer',
        type: 'zelle'
      };

      // For Zelle, we need either email or phone number
      if (!toRecipient.email && !toRecipient.phone) {
        throw new Error('Recipient must have either email or phone number for Zelle transfer');
      }

      // Initiate the transfer
      const transfer = await this.makeAuthenticatedRequest(
        'POST', 
        '/transfers', 
        transferPayload, 
        accessToken
      );

      return {
        transferId: transfer.id,
        status: transfer.status,
        amount: parseFloat(transfer.amount),
        fromAccount: fromAccountId,
        toRecipient: toRecipient,
        memo: memo,
        createdAt: transfer.created_at || new Date().toISOString(),
        estimatedDelivery: transfer.estimated_delivery,
        fees: transfer.fees || 0
      };

    } catch (error) {
      console.error('Error initiating Zelle transfer:', error);
      throw error;
    }
  }

  // Get transfer status by transfer ID
  async getTransferStatus(transferId, accessToken) {
    if (!accessToken) {
      throw new Error('Access token required to check transfer status');
    }

    if (!transferId) {
      throw new Error('Transfer ID is required');
    }

    try {
      const transfer = await this.makeAuthenticatedRequest(
        'GET', 
        `/transfers/${transferId}`, 
        null, 
        accessToken
      );

      return {
        transferId: transfer.id,
        status: transfer.status,
        amount: parseFloat(transfer.amount),
        createdAt: transfer.created_at,
        updatedAt: transfer.updated_at,
        estimatedDelivery: transfer.estimated_delivery,
        actualDelivery: transfer.actual_delivery,
        fees: transfer.fees || 0,
        errorDetails: transfer.error_details || null
      };

    } catch (error) {
      console.error('Error getting transfer status:', error);
      throw error;
    }
  }

  // Test basic certificate authentication
  async testCertificateAuth() {
    try {
      if (!this.isConfigured()) {
        throw new Error('Certificates not configured');
      }

      // Try a simple request to test certificate auth
      const response = await this.client.get('/accounts');
      return response.data;
    } catch (error) {
      if (error.response?.status === 401) {
        throw new Error('Certificate authentication failed - check your certificate files');
      } else if (error.response?.status === 403) {
        throw new Error('Certificate valid but access forbidden - may need access token');
      } else {
        throw new Error(`Request failed: ${error.message}`);
      }
    }
  }

  // Find account by last 4 digits
  async findAccountByLastFour(lastFour, accessToken) {
    if (!accessToken) {
      throw new Error('Access token required to find account');
    }
    
    if (!lastFour) {
      throw new Error('Last 4 digits required to find account');
    }
    
    console.log(`🔍 Searching for account with last 4: ${lastFour}`);
    
    try {
      const accounts = await this.getAccounts(accessToken);
      console.log(`🔍 Found ${accounts.length} total accounts`);
      
      const matchingAccount = accounts.find(account => {
        console.log(`🔍 Checking account: ${account.name} (${account.id}) - last_four: ${account.last_four}`);
        return account.last_four === lastFour;
      });
      
      if (!matchingAccount) {
        const availableLastFours = accounts.map(acc => acc.last_four).join(', ');
        throw new Error(`No account found with last 4 digits ${lastFour}. Available accounts: ${availableLastFours}`);
      }
      
      console.log(`✅ Found matching account: ${matchingAccount.name} (${matchingAccount.id})`);
      return matchingAccount;
      
    } catch (error) {
      console.error('❌ Error finding account by last 4:', error);
      throw error;
    }
  }

  // Smart methods using stored tokens
  async getUberEatsBalance() {
    const accessToken = this.bankTokens.ubereats;
    const lastFour = process.env.TELLER_BANK1_UBER_EATS_LAST_FOUR;
    
    console.log('🔍 Getting UberEats balance:');
    console.log(`🔍 Stored UberEats token: ${accessToken ? 'AVAILABLE' : 'NOT SET'}`);
    console.log(`🔍 UberEats last 4: ${lastFour ? lastFour : 'NOT SET'}`);
    
    if (!accessToken) {
      throw new Error('No UberEats token available. Please authenticate with your UberEats bank first.');
    }
    
    if (!lastFour) {
      throw new Error('TELLER_BANK1_UBER_EATS_LAST_FOUR environment variable is required');
    }
    
    const account = await this.findAccountByLastFour(lastFour, accessToken);
    return await this.getAccountBalance(account.id, accessToken);
  }

  async getCheckingBalance() {
    const accessToken = this.bankTokens.checking;
    const lastFour = process.env.TELLER_BANK1_CHECKING_LAST_FOUR;
    
    console.log('🔍 Getting checking balance:');
    console.log(`🔍 Stored checking token: ${accessToken ? 'AVAILABLE' : 'NOT SET'}`);
    console.log(`🔍 Checking last 4: ${lastFour ? lastFour : 'NOT SET'}`);
    
    if (!accessToken) {
      throw new Error('No checking account token available. Please authenticate with your checking account bank first.');
    }
    
    if (!lastFour) {
      throw new Error('TELLER_BANK1_CHECKING_LAST_FOUR environment variable is required');
    }
    
    const account = await this.findAccountByLastFour(lastFour, accessToken);
    return await this.getAccountBalance(account.id, accessToken);
  }

  async transferZelle(toRecipient, amount, memo, fromLastFour = null) {
    const accessToken = this.bankTokens.zelle;
    const defaultLastFour = process.env.TELLER_BANK2_ZELLE_SOURCE_LAST_FOUR;
    
    console.log('🔍 Initiating Zelle transfer:');
    console.log(`🔍 Stored Zelle token: ${accessToken ? 'AVAILABLE' : 'NOT SET'}`);
    
    if (!accessToken) {
      throw new Error('No Zelle token available. Please authenticate with your Zelle bank first.');
    }
    
    // Use provided fromLastFour or default to Zelle source account last 4
    const sourceLastFour = fromLastFour || defaultLastFour;
    
    if (!sourceLastFour) {
      throw new Error('fromLastFour parameter or TELLER_BANK2_ZELLE_SOURCE_LAST_FOUR environment variable is required');
    }
    
    // Find the account by last 4 digits
    const sourceAccount = await this.findAccountByLastFour(sourceLastFour, accessToken);
    
    return await this.initiateZelleTransfer(sourceAccount.id, toRecipient, amount, memo, accessToken);
  }

  async getTransferStatusSimple(transferId) {
    const accessToken = this.bankTokens.zelle;
    
    if (!accessToken) {
      throw new Error('No Zelle token available for transfer status check');
    }
    
    return await this.getTransferStatus(transferId, accessToken);
  }

  // Super simple Zelle transfer - just provide amount, everything else is configured
  async transferToCheckingSimple(amount, memo = 'Auto transfer') {
    const accessToken = this.bankTokens.zelle;
    const sourceLastFour = process.env.TELLER_BANK2_ZELLE_SOURCE_LAST_FOUR;
    const recipientName = process.env.ZELLE_RECIPIENT_NAME;
    const recipientEmail = process.env.ZELLE_RECIPIENT_EMAIL;
    const recipientPhone = process.env.ZELLE_RECIPIENT_PHONE;

    console.log('🔍 Simple Zelle transfer setup:');
    console.log(`🔍 Stored Zelle token: ${accessToken ? 'AVAILABLE' : 'NOT SET'}`);
    console.log(`🔍 Zelle source last 4: ${sourceLastFour ? sourceLastFour : 'NOT SET'}`);
    console.log(`🔍 Recipient: ${recipientName ? recipientName : 'NOT SET'}`);
    console.log(`🔍 Amount: $${amount}`);

    if (!accessToken) {
      throw new Error('No Zelle token available. Please authenticate with your Zelle bank first.');
    }

    if (!sourceLastFour) {
      throw new Error('TELLER_BANK2_ZELLE_SOURCE_LAST_FOUR environment variable is required');
    }

    if (!recipientName) {
      throw new Error('ZELLE_RECIPIENT_NAME environment variable is required');
    }

    if (!recipientEmail && !recipientPhone) {
      throw new Error('Either ZELLE_RECIPIENT_EMAIL or ZELLE_RECIPIENT_PHONE environment variable is required');
    }

    if (!amount || amount <= 0) {
      throw new Error('Amount must be greater than zero');
    }

    // Build recipient object
    const toRecipient = {
      name: recipientName,
      email: recipientEmail || null,
      phone: recipientPhone || null
    };

    // Find source account and initiate transfer
    const sourceAccount = await this.findAccountByLastFour(sourceLastFour, accessToken);
    
    console.log(`🚀 Initiating Zelle transfer: $${amount} from ${sourceAccount.name} (${sourceLastFour}) to ${recipientName}`);
    
    return await this.initiateZelleTransfer(sourceAccount.id, toRecipient, amount, memo, accessToken);
  }

  // Auto-detect and store token based on accounts
  async detectAndStoreToken(accessToken) {
    try {
      console.log('🔍 Detecting bank type for new token...');
      const accounts = await this.getAccounts(accessToken);
      
      let detectedBank = null;
      const detectedAccounts = [];
      
      // Check for target accounts by last 4 digits
      const checkingLastFour = process.env.TELLER_BANK1_CHECKING_LAST_FOUR;
      const uberEatsLastFour = process.env.TELLER_BANK1_UBER_EATS_LAST_FOUR;  
      const zelleSourceLastFour = process.env.TELLER_BANK2_ZELLE_SOURCE_LAST_FOUR;
      
      for (const account of accounts) {
        console.log(`🔍 Found account: ${account.name} (${account.id}) - last_four: ${account.last_four}`);
        
        if (account.last_four === checkingLastFour) {
          detectedBank = 'checking';
          detectedAccounts.push(`checking account (${account.last_four})`);
          this.bankTokens.checking = accessToken;
        }
        
        if (account.last_four === uberEatsLastFour) {
          detectedBank = 'ubereats';
          detectedAccounts.push(`UberEats account (${account.last_four})`);
          this.bankTokens.ubereats = accessToken;
        }
        
        if (account.last_four === zelleSourceLastFour) {
          detectedBank = 'zelle';
          detectedAccounts.push(`Zelle source account (${account.last_four})`);
          this.bankTokens.zelle = accessToken;
        }
      }
      
      if (detectedAccounts.length > 0) {
        console.log(`✅ Token stored for: ${detectedAccounts.join(', ')}`);
        return {
          success: true,
          detectedBank,
          detectedAccounts,
          accounts: accounts.map(acc => ({
            id: acc.id,
            name: acc.name,
            last_four: acc.last_four,
            type: acc.type,
            subtype: acc.subtype
          }))
        };
      } else {
        console.log('⚠️ No matching accounts found for this token');
        return {
          success: false,
          message: 'No accounts match configured last 4 digits',
          accounts: accounts.map(acc => ({
            id: acc.id,
            name: acc.name,
            last_four: acc.last_four,
            type: acc.type,
            subtype: acc.subtype
          })),
          expectedLastFours: {
            checking: checkingLastFour,
            ubereats: uberEatsLastFour,
            zelle: zelleSourceLastFour
          }
        };
      }
      
    } catch (error) {
      console.error('❌ Error detecting token bank:', error);
      throw error;
    }
  }

  // Get current token status
  getTokenStatus() {
    return {
      checking: this.bankTokens.checking ? 'SET' : 'NOT SET',
      ubereats: this.bankTokens.ubereats ? 'SET' : 'NOT SET', 
      zelle: this.bankTokens.zelle ? 'SET' : 'NOT SET',
      tokens: {
        checking: this.bankTokens.checking?.substring(0, 10) + '...' || null,
        ubereats: this.bankTokens.ubereats?.substring(0, 10) + '...' || null,
        zelle: this.bankTokens.zelle?.substring(0, 10) + '...' || null
      }
    };
  }

  // Clear all stored tokens
  clearTokens() {
    this.bankTokens = {
      checking: null,
      ubereats: null,
      zelle: null
    };
    console.log('🗑️ All tokens cleared');
  }

  // Sandbox-specific methods (requires proper setup)
  async getSandboxAccounts() {
    if (this.environment !== 'sandbox') {
      throw new Error('This method only works in sandbox environment');
    }
    
    try {
      return await this.testCertificateAuth();
    } catch (error) {
      throw new Error(`Sandbox accounts request failed: ${error.message}`);
    }
  }
}

module.exports = new TellerService();