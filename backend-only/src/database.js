const fs = require('fs').promises;
const path = require('path');

class Database {
  constructor() {
    // Use Railway volume mount or fallback to local
    this.dataDir = process.env.RAILWAY_VOLUME_MOUNT_PATH || path.join(__dirname, '../data');
    this.usersFile = path.join(this.dataDir, 'users.json');
    this.pendingTipsFile = path.join(this.dataDir, 'pendingTips.json');
    this.tipHistoryFile = path.join(this.dataDir, 'tipHistory.json');
    
    console.log('📁 Database directory:', this.dataDir);
    this.init();
  }

  async init() {
    try {
      await fs.mkdir(this.dataDir, { recursive: true });
      await this.ensureFiles();
    } catch (error) {
      console.error('Database initialization error:', error);
    }
  }

  async ensureFiles() {
    const files = [
      { path: this.usersFile, default: {} },
      { path: this.pendingTipsFile, default: [] },
      { path: this.tipHistoryFile, default: [] }
    ];

    for (const file of files) {
      try {
        await fs.access(file.path);
      } catch {
        await fs.writeFile(file.path, JSON.stringify(file.default, null, 2));
      }
    }
  }

  // User configurations
  async getUserConfig(userAddress) {
    try {
      const data = await fs.readFile(this.usersFile, 'utf8');
      const users = JSON.parse(data);
      const config = users[userAddress.toLowerCase()] || null;
      console.log(`📖 Retrieved config for ${userAddress}:`, !!config);
      return config;
    } catch (error) {
      console.error('📖 Error reading user config:', error.message);
      return null;
    }
  }

  async setUserConfig(userAddress, config) {
    const data = await fs.readFile(this.usersFile, 'utf8');
    const users = JSON.parse(data);
    users[userAddress.toLowerCase()] = {
      ...config,
      updatedAt: Date.now()
    };
    await fs.writeFile(this.usersFile, JSON.stringify(users, null, 2));
  }

  async updateUserConfig(userAddress, config) {
    const existing = await this.getUserConfig(userAddress);
    const updated = {
      ...existing,
      ...config,
      updatedAt: Date.now()
    };
    await this.setUserConfig(userAddress, updated);
  }

  async getAllActiveUsers() {
    const data = await fs.readFile(this.usersFile, 'utf8');
    const users = JSON.parse(data);
    return Object.values(users).filter(user => user.isActive);
  }

  async getAllUserConfigs() {
    const data = await fs.readFile(this.usersFile, 'utf8');
    return JSON.parse(data);
  }

  // Pending tips
  async addPendingTip(tip) {
    const data = await fs.readFile(this.pendingTipsFile, 'utf8');
    const pendingTips = JSON.parse(data);
    pendingTips.push({
      ...tip,
      id: Date.now() + Math.random(),
      addedAt: Date.now()
    });
    await fs.writeFile(this.pendingTipsFile, JSON.stringify(pendingTips, null, 2));
    return pendingTips.length;
  }

  async getPendingTips() {
    const data = await fs.readFile(this.pendingTipsFile, 'utf8');
    return JSON.parse(data);
  }

  async clearPendingTips() {
    await fs.writeFile(this.pendingTipsFile, JSON.stringify([], null, 2));
  }

  // Tip history
  async addTipHistory(tip) {
    const data = await fs.readFile(this.tipHistoryFile, 'utf8');
    const history = JSON.parse(data);
    history.push({
      ...tip,
      processedAt: Date.now()
    });
    await fs.writeFile(this.tipHistoryFile, JSON.stringify(history, null, 2));
  }

  async getTipHistory(userAddress, limit = 50) {
    const data = await fs.readFile(this.tipHistoryFile, 'utf8');
    const history = JSON.parse(data);
    return history
      .filter(tip => 
        tip.fromAddress?.toLowerCase() === userAddress.toLowerCase() ||
        tip.toAddress?.toLowerCase() === userAddress.toLowerCase()
      )
      .slice(0, limit);
  }

  // Token allowances
  async getUserTokenAllowance(userAddress, tokenAddress) {
    const config = await this.getUserConfig(userAddress);
    if (!config) return { allowance: 0, balance: 0 };
    
    // In a real system, you'd check the actual on-chain allowance
    // For now, we'll assume users have approved tokens to backend
    return {
      allowance: config.allowance || 0,
      balance: config.balance || 0
    };
  }

  // Homepage and leaderboard functions
  async getActiveUsers() {
    const data = await fs.readFile(this.usersFile, 'utf8');
    const users = JSON.parse(data);
    return Object.keys(users).filter(addr => {
      const user = users[addr];
      return user && user.isActive;
    });
  }

  async getActiveUsersWithApprovals() {
    const data = await fs.readFile(this.usersFile, 'utf8');
    const users = JSON.parse(data);
    return Object.keys(users).filter(addr => {
      const user = users[addr];
      // User must be active AND have approved tokens (we assume they have if they have a config)
      return user && user.isActive && user.tokenAddress;
    });
  }

  async getTopTippers(timeFilter = '30d') {
    const data = await fs.readFile(this.tipHistoryFile, 'utf8');
    const history = JSON.parse(data);
    
    // Filter by time
    const now = Date.now();
    const timeMs = timeFilter === '24h' ? 24 * 60 * 60 * 1000 :
                   timeFilter === '7d' ? 7 * 24 * 60 * 60 * 1000 :
                   30 * 24 * 60 * 60 * 1000;
    
    const filtered = history.filter(tip => 
      tip.processedAt > (now - timeMs) &&
      tip.tokenAddress?.toLowerCase() === '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913'
    );
    
    // Group by sender and sum amounts
    const tippers = {};
    filtered.forEach(tip => {
      const addr = tip.fromAddress?.toLowerCase();
      if (addr) {
        if (!tippers[addr]) {
          tippers[addr] = { userAddress: addr, totalAmount: 0, tipCount: 0 };
        }
        tippers[addr].totalAmount += parseFloat(tip.amount || 0);
        tippers[addr].tipCount += 1;
      }
    });
    
    return Object.values(tippers)
      .sort((a, b) => b.totalAmount - a.totalAmount)
      .slice(0, 50);
  }

  async getTopEarners(timeFilter = '30d') {
    const data = await fs.readFile(this.tipHistoryFile, 'utf8');
    const history = JSON.parse(data);
    
    // Filter by time
    const now = Date.now();
    const timeMs = timeFilter === '24h' ? 24 * 60 * 60 * 1000 :
                   timeFilter === '7d' ? 7 * 24 * 60 * 60 * 1000 :
                   30 * 24 * 60 * 60 * 1000;
    
    const filtered = history.filter(tip => 
      tip.processedAt > (now - timeMs) &&
      tip.tokenAddress?.toLowerCase() === '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913'
    );
    
    // Group by receiver and sum amounts
    const earners = {};
    filtered.forEach(tip => {
      const addr = tip.toAddress?.toLowerCase();
      if (addr) {
        if (!earners[addr]) {
          earners[addr] = { userAddress: addr, totalAmount: 0, tipCount: 0 };
        }
        earners[addr].totalAmount += parseFloat(tip.amount || 0);
        earners[addr].tipCount += 1;
      }
    });
    
    return Object.values(earners)
      .sort((a, b) => b.totalAmount - a.totalAmount)
      .slice(0, 50);
  }

  // Admin functions for total stats
  async getTotalTips() {
    try {
      const data = await fs.readFile(this.tipHistoryFile, 'utf8');
      const history = JSON.parse(data);
      return history.length;
    } catch (error) {
      console.error('Error getting total tips:', error);
      return 0;
    }
  }

  async getTotalAmountTipped() {
    try {
      const data = await fs.readFile(this.tipHistoryFile, 'utf8');
      const history = JSON.parse(data);
      return history.reduce((sum, tip) => sum + parseFloat(tip.amount || 0), 0);
    } catch (error) {
      console.error('Error getting total amount tipped:', error);
      return 0;
    }
  }

  async getTotalUsers() {
    try {
      const data = await fs.readFile(this.tipHistoryFile, 'utf8');
      const history = JSON.parse(data);
      const uniqueUsers = new Set(history.map(tip => tip.fromAddress).filter(Boolean));
      return uniqueUsers.size;
    } catch (error) {
      console.error('Error getting total users:', error);
      return 0;
    }
  }

  async getTotalTransactions() {
    try {
      const data = await fs.readFile(this.tipHistoryFile, 'utf8');
      const history = JSON.parse(data);
      const uniqueTxs = new Set(history.filter(tip => tip.txHash).map(tip => tip.txHash));
      return uniqueTxs.size;
    } catch (error) {
      console.error('Error getting total transactions:', error);
      return 0;
    }
  }

  async getRecentTips(limit = 50) {
    try {
      const data = await fs.readFile(this.tipHistoryFile, 'utf8');
      const history = JSON.parse(data);
      return history
        .sort((a, b) => b.processedAt - a.processedAt)
        .slice(0, limit)
        .map(tip => ({
          fromAddress: tip.fromAddress,
          toAddress: tip.toAddress,
          amount: parseFloat(tip.amount || 0),
          tokenAddress: tip.tokenAddress,
          txHash: tip.txHash,
          processedAt: tip.processedAt,
          interactionType: tip.interactionType
        }));
    } catch (error) {
      console.error('Error getting recent tips:', error);
      return [];
    }
  }

  // Get tips since a specific date
  async getTipsSince(sinceDate) {
    try {
      const data = await fs.readFile(this.tipHistoryFile, 'utf8');
      const history = JSON.parse(data);
      
      const sinceTimestamp = sinceDate.getTime();
      const filtered = history.filter(tip => 
        new Date(tip.timestamp).getTime() >= sinceTimestamp
      );
      
      console.log(`📊 Found ${filtered.length} tips since ${sinceDate.toISOString()}`);
      return filtered;
    } catch (error) {
      console.error('Error getting tips since date:', error);
      return [];
    }
  }

  // Get a config value
  async getConfig(key) {
    try {
      const configFile = path.join(__dirname, 'config.json');
      if (!fs.existsSync(configFile)) {
        return null;
      }
      
      const data = await fs.readFile(configFile, 'utf8');
      const config = JSON.parse(data);
      return config[key] || null;
    } catch (error) {
      console.error('Error getting config:', error);
      return null;
    }
  }

  // Set a config value
  async setConfig(key, value) {
    try {
      const configFile = path.join(__dirname, 'config.json');
      let config = {};
      
      if (fs.existsSync(configFile)) {
        const data = await fs.readFile(configFile, 'utf8');
        config = JSON.parse(data);
      }
      
      config[key] = value;
      await fs.writeFile(configFile, JSON.stringify(config, null, 2));
      
      console.log(`💾 Config updated: ${key} = ${value}`);
    } catch (error) {
      console.error('Error setting config:', error);
    }
  }

  // Cleanup old tips (placeholder for file-based database)
  async cleanupOldTips() {
    console.log('🧹 File-based database: cleanupOldTips called (no-op)');
    return { cleaned: 0 };
  }

  // Blocklist functions removed - using webhook filtering instead

  // Notification token methods (file-based fallback)
  async saveNotificationToken(userAddress, fid, token, notificationUrl) {
    try {
      const tokensFile = path.join(this.dataDir, 'notification_tokens.json');
      let tokens = {};
      
      try {
        const data = await fs.readFile(tokensFile, 'utf8');
        tokens = JSON.parse(data);
      } catch (error) {
        // File doesn't exist, start with empty object
      }
      
      const key = `${userAddress.toLowerCase()}_${fid}`;
      tokens[key] = {
        userAddress: userAddress.toLowerCase(),
        fid,
        token,
        notificationUrl,
        isActive: true,
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
      
      await fs.writeFile(tokensFile, JSON.stringify(tokens, null, 2));
      console.log(`💾 Saved notification token for user ${userAddress} (FID: ${fid})`);
      return true;
    } catch (error) {
      console.error('Error saving notification token:', error.message);
      return false;
    }
  }

  async getNotificationToken(userAddress) {
    try {
      const tokensFile = path.join(this.dataDir, 'notification_tokens.json');
      const data = await fs.readFile(tokensFile, 'utf8');
      const tokens = JSON.parse(data);
      
      // Find the most recent active token for this user
      const userTokens = Object.values(tokens).filter(t => 
        t.userAddress === userAddress.toLowerCase() && t.isActive
      );
      
      if (userTokens.length === 0) return null;
      
      // Return the most recently updated token
      return userTokens.sort((a, b) => b.updatedAt - a.updatedAt)[0];
    } catch (error) {
      console.error('Error getting notification token:', error.message);
      return null;
    }
  }

  async getAllNotificationTokens() {
    try {
      const tokensFile = path.join(this.dataDir, 'notification_tokens.json');
      const data = await fs.readFile(tokensFile, 'utf8');
      const tokens = JSON.parse(data);
      
      return Object.values(tokens).filter(t => t.isActive);
    } catch (error) {
      console.error('Error getting all notification tokens:', error.message);
      return [];
    }
  }

  async deactivateNotificationToken(userAddress, fid = null) {
    try {
      const tokensFile = path.join(this.dataDir, 'notification_tokens.json');
      let tokens = {};
      
      try {
        const data = await fs.readFile(tokensFile, 'utf8');
        tokens = JSON.parse(data);
      } catch (error) {
        return false;
      }
      
      let updated = false;
      Object.keys(tokens).forEach(key => {
        const token = tokens[key];
        if (token.userAddress === userAddress.toLowerCase() && 
            (fid === null || token.fid === fid)) {
          token.isActive = false;
          token.updatedAt = Date.now();
          updated = true;
        }
      });
      
      if (updated) {
        await fs.writeFile(tokensFile, JSON.stringify(tokens, null, 2));
        console.log(`🚫 Deactivated notification token for user ${userAddress} (FID: ${fid || 'all'})`);
      }
      
      return updated;
    } catch (error) {
      console.error('Error deactivating notification token:', error.message);
      return false;
    }
  }
}

module.exports = new Database();