const { Pool } = require('pg');

class PostgresDatabase {
  constructor() {
    this.pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    });
    
    console.log('🗄️ PostgreSQL Database initialized - Updated with all functions');
    this.init();
  }

  async init() {
    try {
      // Create tables if they don't exist
      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS user_configs (
          user_address TEXT PRIMARY KEY,
          config JSONB NOT NULL,
          updated_at TIMESTAMP DEFAULT NOW()
        )
      `);

      // Create user profiles table to store Farcaster user data
      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS user_profiles (
          fid BIGINT PRIMARY KEY,
          username TEXT,
          display_name TEXT,
          pfp_url TEXT,
          follower_count INTEGER DEFAULT 0,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        )
      `);
      
      // Add user_address column if it doesn't exist
      await this.pool.query(`
        ALTER TABLE user_profiles 
        ADD COLUMN IF NOT EXISTS user_address VARCHAR(255)
      `);
      
      // Add latest cast tracking columns
      await this.pool.query(`
        ALTER TABLE user_profiles 
        ADD COLUMN IF NOT EXISTS latest_cast_hash VARCHAR(66)
      `);
      
      await this.pool.query(`
        ALTER TABLE user_profiles 
        ADD COLUMN IF NOT EXISTS latest_cast_timestamp TIMESTAMP
      `);
      
      await this.pool.query(`
        ALTER TABLE user_profiles 
        ADD COLUMN IF NOT EXISTS is_tracking BOOLEAN DEFAULT true
      `);
      
      // Fix the created_at column issue - rename it to match what the code expects
      try {
        await this.pool.query(`
          ALTER TABLE user_profiles 
          RENAME COLUMN created_at TO created_at
        `);
      } catch (error) {
        // Column might already exist with correct name, ignore error
        console.log('created_at column already exists or renamed');
      }
      
      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS pending_tips (
          id SERIAL PRIMARY KEY,
          interaction_type TEXT NOT NULL,
          author_fid INTEGER NOT NULL,
          interactor_fid INTEGER NOT NULL,
          author_address TEXT NOT NULL,
          interactor_address TEXT NOT NULL,
          cast_hash TEXT,
          amount TEXT,
          token_address TEXT,
          added_at TIMESTAMP DEFAULT NOW()
        )
      `);
      
      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS tip_history (
          id SERIAL PRIMARY KEY,
          from_address TEXT NOT NULL,
          to_address TEXT NOT NULL,
          token_address TEXT NOT NULL,
          amount TEXT NOT NULL,
          action_type TEXT NOT NULL,
          cast_hash TEXT,
          transaction_hash TEXT,
          processed_at TIMESTAMP DEFAULT NOW()
        )
      `);

      // Create user_earnings table for leaderboard optimization
      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS user_earnings (
          fid INTEGER PRIMARY KEY,
          total_earnings DECIMAL(18,6) DEFAULT 0,
          earnings_24h DECIMAL(18,6) DEFAULT 0,
          earnings_7d DECIMAL(18,6) DEFAULT 0,
          earnings_30d DECIMAL(18,6) DEFAULT 0,
          total_tippings DECIMAL(18,6) DEFAULT 0,
          tippings_24h DECIMAL(18,6) DEFAULT 0,
          tippings_7d DECIMAL(18,6) DEFAULT 0,
          tippings_30d DECIMAL(18,6) DEFAULT 0,
          last_updated TIMESTAMP DEFAULT NOW()
        )
      `);
      
      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS webhook_config (
          id SERIAL PRIMARY KEY,
          webhook_id TEXT,
          tracked_fids INTEGER[],
          updated_at TIMESTAMP DEFAULT NOW()
        )
      `);
      
      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS user_casts (
          id SERIAL PRIMARY KEY,
          user_fid INTEGER NOT NULL,
          cast_hash TEXT NOT NULL,
          is_main_cast BOOLEAN DEFAULT true,
          created_at TIMESTAMP DEFAULT NOW(),
          UNIQUE(user_fid, cast_hash)
        )
      `);
      
      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS follow_tips (
          id SERIAL PRIMARY KEY,
          author_fid INTEGER NOT NULL,
          follower_fid INTEGER NOT NULL,
          author_address TEXT NOT NULL,
          follower_address TEXT NOT NULL,
          tip_amount DECIMAL(18,6) NOT NULL,
          token_symbol TEXT NOT NULL,
          created_at TIMESTAMP DEFAULT NOW(),
          UNIQUE(author_fid, follower_fid)
        )
      `);
      
      // Using webhook filtering based on allowance and balance checks

      // Create notification tokens table
      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS notification_tokens (
          id SERIAL PRIMARY KEY,
          user_address TEXT NOT NULL,
          fid INTEGER NOT NULL,
          token TEXT NOT NULL,
          notification_url TEXT NOT NULL,
          is_active BOOLEAN DEFAULT true,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW(),
          UNIQUE(user_address, fid)
        )
      `);
      
      console.log('✅ Database tables initialized');
    } catch (error) {
      
      console.error('❌ Database initialization error:', error);
    }
  }

  // User profiles management
  async saveUserProfile(fid, username, displayName, pfpUrl, followerCount = 0, userAddress = null) {
    try {
      await this.pool.query(`
        INSERT INTO user_profiles (fid, username, display_name, pfp_url, follower_count, user_address, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
        ON CONFLICT (fid) 
        DO UPDATE SET 
          username = EXCLUDED.username,
          display_name = EXCLUDED.display_name,
          pfp_url = EXCLUDED.pfp_url,
          follower_count = EXCLUDED.follower_count,
          user_address = EXCLUDED.user_address,
          updated_at = NOW()
      `, [fid, username, displayName, pfpUrl, followerCount, userAddress]);
      
      console.log(`✅ Saved user profile for FID ${fid}: ${username} (${displayName})`);
    } catch (error) {
      console.error('Error saving user profile:', error);
    }
  }

  async getUserProfile(fid) {
    try {
      const result = await this.pool.query(
        'SELECT * FROM user_profiles WHERE fid = $1',
        [fid]
      );
      return result.rows[0] || null;
    } catch (error) {
      console.error('Error getting user profile:', error);
      return null;
    }
  }

  async getUserProfiles(fids) {
    try {
      if (fids.length === 0) return [];
      
      console.log('🔍 getUserProfiles called with FIDs:', fids.slice(0, 5));
      const result = await this.pool.query(
        'SELECT * FROM user_profiles WHERE fid = ANY($1)',
        [fids]
      );
      console.log('📊 getUserProfiles found:', result.rows.length, 'profiles');
      
      // If no profiles found in database, try to get them from Neynar API
      if (result.rows.length === 0) {
        console.log('❌ No profiles in database, trying Neynar API...');
        // For now, return empty array - we'll handle this in the leaderboard
        return [];
      }
      
      return result.rows;
    } catch (error) {
      console.error('Error getting user profiles:', error);
      return [];
    }
  }

  async getTopTippers(timeFilter = '30d') {
    try {
      const timeMs = timeFilter === '24h' ? '24 hours' :
                     timeFilter === '7d' ? '7 days' : '30 days';
      
      const result = await this.pool.query(`
        SELECT 
          from_address as user_address,
          token_address,
          SUM(CAST(amount AS DECIMAL)) as total_amount,
          COUNT(*) as tip_count
        FROM tip_history 
        WHERE processed_at > NOW() - INTERVAL '${timeMs}'
        AND LOWER(token_address) = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913'
        GROUP BY from_address, token_address 
        ORDER BY total_amount DESC 
        LIMIT 50
      `);
      
      return result.rows.map(row => ({
        userAddress: row.user_address,
        tokenAddress: row.token_address,
        totalAmount: parseFloat(row.total_amount),
        tipCount: parseInt(row.tip_count)
      }));
    } catch (error) {
      console.error('Error getting top tippers:', error);
      return [];
    }
  }

  async getTopEarners(timeFilter = '30d') {
    try {
      const timeMs = timeFilter === '24h' ? '24 hours' :
                     timeFilter === '7d' ? '7 days' : '30 days';
      
      const result = await this.pool.query(`
        SELECT 
          to_address as user_address,
          token_address,
          SUM(CAST(amount AS DECIMAL)) as total_amount,
          COUNT(*) as tip_count
        FROM tip_history 
        WHERE processed_at > NOW() - INTERVAL '${timeMs}'
        AND LOWER(token_address) = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913'
        GROUP BY to_address, token_address 
        ORDER BY total_amount DESC 
        LIMIT 50
      `);
      
      return result.rows.map(row => ({
        userAddress: row.user_address,
        tokenAddress: row.token_address,
        totalAmount: parseFloat(row.total_amount),
        tipCount: parseInt(row.tip_count)
      }));
    } catch (error) {
      console.error('Error getting top earners:', error);
      return [];
    }
  }

  async getUserEarnings(fid) {
    try {
      console.log(`🔍 getUserEarnings called with fid: ${fid}`);
      
      // Get user's address from user_profiles
      const userResult = await this.pool.query(`
        SELECT user_address FROM user_profiles WHERE fid = $1
      `, [fid]);
      
      console.log(`🔍 User query result:`, userResult.rows);
      
      if (userResult.rows.length === 0) {
        console.log(`❌ No user found for fid: ${fid}`);
        return null;
      }
      
      const userAddress = userResult.rows[0].user_address;
      console.log(`🔍 User address: ${userAddress}`);
      
      // Calculate all time periods from tip_history directly
      const totalEarnings = await this.calculateUserEarnings(userAddress, 'total');
      const earnings24h = await this.calculateUserEarnings(userAddress, '24h');
      const earnings7d = await this.calculateUserEarnings(userAddress, '7d');
      const earnings30d = await this.calculateUserEarnings(userAddress, '30d');
      
      return {
        fid,
        totalEarnings: totalEarnings.totalEarnings,
        earnings24h: earnings24h.totalEarnings,
        earnings7d: earnings7d.totalEarnings,
        earnings30d: earnings30d.totalEarnings,
        totalTippings: totalEarnings.totalTippings,
        tippings24h: earnings24h.totalTippings,
        tippings7d: earnings7d.totalTippings,
        tippings30d: earnings30d.totalTippings
      };
    } catch (error) {
      console.error('Error getting user earnings:', error);
      return null;
    }
  }

  // Calculate earnings for a specific user address from tip_history
  async calculateUserEarnings(userAddress, timeFilter = 'total') {
    try {
      let timeCondition = '';
      if (timeFilter === '24h') {
        timeCondition = "AND processed_at >= NOW() - INTERVAL '24 hours'";
      } else if (timeFilter === '7d') {
        timeCondition = "AND processed_at >= NOW() - INTERVAL '7 days'";
      } else if (timeFilter === '30d') {
        timeCondition = "AND processed_at >= NOW() - INTERVAL '30 days'";
      }

      console.log(`🔍 Calculating earnings for ${userAddress} with timeFilter: ${timeFilter}`);

      const result = await this.pool.query(`
        SELECT 
          SUM(CASE WHEN LOWER(to_address) = LOWER($1) THEN amount::NUMERIC ELSE 0 END) as total_earnings,
          SUM(CASE WHEN LOWER(from_address) = LOWER($1) THEN amount::NUMERIC ELSE 0 END) as total_tippings
        FROM tip_history 
        WHERE token_address = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913'
        ${timeCondition}
      `, [userAddress]);

      const stats = result.rows[0];
      const earnings = {
        totalEarnings: parseFloat(stats.total_earnings) || 0,
        totalTippings: parseFloat(stats.total_tippings) || 0
      };
      
      console.log(`📊 Earnings for ${userAddress}:`, earnings);
      return earnings;
    } catch (error) {
      console.error('Error calculating user earnings:', error);
      return { totalEarnings: 0, totalTippings: 0 };
    }
  }

  // Get leaderboard data with real-time earnings calculation
  async getLeaderboardData(timeFilter = 'total', page = 1, limit = 10) {
    try {
      console.log(`🔍 Getting leaderboard data for timeFilter: ${timeFilter}, page: ${page}, limit: ${limit}`);

      // Get all unique addresses from tip_history
      let timeCondition = '';
      if (timeFilter === '24h') {
        timeCondition = "AND processed_at >= NOW() - INTERVAL '24 hours'";
      } else if (timeFilter === '7d') {
        timeCondition = "AND processed_at >= NOW() - INTERVAL '7 days'";
      } else if (timeFilter === '30d') {
        timeCondition = "AND processed_at >= NOW() - INTERVAL '30 days'";
      }

      const addressesResult = await this.pool.query(`
        SELECT DISTINCT from_address, to_address
        FROM tip_history 
        WHERE token_address = '0x833589fCD6eDb6E08f4c7C32D4f71b54bd'
        ${timeCondition}
      `);

      // Get all unique addresses
      const allAddresses = new Set();
      addressesResult.rows.forEach(row => {
        allAddresses.add(row.from_address);
        allAddresses.add(row.to_address);
      });

      console.log(`📊 Found ${allAddresses.size} unique addresses in tip_history`);

      if (allAddresses.size === 0) {
        return { users: [], pagination: { page: 1, limit: 10, total: 0, totalPages: 0 } };
      }

      // Calculate earnings for each address
      const addressEarnings = [];
      for (const address of allAddresses) {
        const earnings = await this.calculateUserEarnings(address, timeFilter);
        if (earnings.totalEarnings > 0 || earnings.totalTippings > 0) {
          addressEarnings.push({
            address,
            ...earnings
          });
        }
      }

      // Sort by earnings
      addressEarnings.sort((a, b) => b.totalEarnings - a.totalTippings);

      // Get user data from Neynar for addresses with earnings
      const addressesToFetch = addressEarnings.slice(0, 50).map(item => item.address); // Limit to 50 for API
      const neynar = require('./neynar');
      const userData = await neynar.fetchBulkUsersByEthOrSolAddress(addressesToFetch);

      // Combine earnings with user data
      const usersWithEarnings = addressEarnings.map(item => {
        const user = userData[item.address]?.[0] || {};
        return {
          fid: user.fid || null,
          username: user.username || null,
          display_name: user.display_name || null,
          pfp_url: user.pfp_url || null,
          follower_count: user.follower_count || 0,
          user_address: item.address,
          totalEarnings: item.totalEarnings,
          totalTippings: item.totalTippings
        };
      });

      // Pagination
      const startIndex = (page - 1) * limit;
      const endIndex = startIndex + limit;
      const paginatedUsers = usersWithEarnings.slice(startIndex, endIndex);

      console.log(`📊 Returning ${paginatedUsers.length} users with earnings`);

      return {
        users: paginatedUsers,
        pagination: {
          page,
          limit,
          total: usersWithEarnings.length,
          totalPages: Math.ceil(usersWithEarnings.length / limit)
        }
      };
    } catch (error) {
      console.error('Error getting leaderboard data:', error);
      return { users: [], pagination: { page: 1, limit: 10, total: 0, totalPages: 0 } };
    }
  }

  // User configurations
  async getUserConfig(userAddress) {
    try {
      const result = await this.pool.query(
        'SELECT config FROM user_configs WHERE user_address = $1',
        [userAddress.toLowerCase()]
      );
      let config = result.rows[0]?.config || null;
      
        // If config is a string (PostgreSQL JSONB), parse it
        if (typeof config === 'string') {
          config = JSON.parse(config);
        }
        
        // Ensure boolean fields are actual booleans (PostgreSQL might return strings)
        if (config) {
          config.likeEnabled = config.likeEnabled === true || config.likeEnabled === 'true' || config.likeEnabled === 1;
          config.replyEnabled = config.replyEnabled === true || config.replyEnabled === 'true' || config.replyEnabled === 1;
          config.recastEnabled = config.recastEnabled === true || config.recastEnabled === 'true' || config.recastEnabled === 1;
          config.followEnabled = config.followEnabled === true || config.followEnabled === 'true' || config.followEnabled === 1;
          config.isActive = config.isActive === true || config.isActive === 'true' || config.isActive === 1;
          config.tokenHistory = Array.isArray(config.tokenHistory)
            ? config.tokenHistory
                .map(address => (typeof address === 'string' ? address.toLowerCase() : address))
                .filter(Boolean)
            : [];
        }
      
      console.log(`📖 Retrieved config for ${userAddress}:`, !!config);
      return config;
    } catch (error) {
      console.error('📖 Error reading user config:', error.message);
      return null;
    }
  }

  async setUserConfig(userAddress, config) {
    try {
      await this.pool.query(`
        INSERT INTO user_configs (user_address, config, updated_at) 
        VALUES ($1, $2, NOW())
        ON CONFLICT (user_address) 
        DO UPDATE SET config = $2, updated_at = NOW()
      `, [userAddress.toLowerCase(), JSON.stringify({
        ...config,
        updatedAt: Date.now()
      })]);
      console.log(`💾 Saved config for ${userAddress}`);
    } catch (error) {
      console.error('💾 Error saving user config:', error.message);
      throw error;
    }
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
    try {
      const result = await this.pool.query(`
        SELECT user_address FROM user_configs 
        WHERE config->>'isActive' = 'true'
      `);
      return result.rows.map(row => row.user_address);
    } catch (error) {
      console.error('Error getting active users:', error);
      return [];
    }
  }

  async getAllUserConfigs() {
    try {
      const result = await this.pool.query('SELECT user_address, config FROM user_configs');
      const configs = {};
      result.rows.forEach(row => {
        configs[row.user_address] = row.config;
      });
      return configs;
    } catch (error) {
      console.error('Error getting all configs:', error);
      return {};
    }
  }

  // Homepage and leaderboard functions
  async getActiveUsers() {
    return this.getAllActiveUsers();
  }

  async getActiveUsersWithApprovals() {
    try {
      const result = await this.pool.query(`
        SELECT DISTINCT LOWER(user_address) as user_address FROM user_configs 
        WHERE config->>'isActive' = 'true' 
        AND config->>'tokenAddress' IS NOT NULL
      `);
      return result.rows.map(row => row.user_address);
    } catch (error) {
      console.error('Error getting users with approvals:', error);
      return [];
    }
  }

  // Pending tips
  async addPendingTip(tip) {
    try {
      const result = await this.pool.query(`
        INSERT INTO pending_tips 
        (interaction_type, author_fid, interactor_fid, author_address, interactor_address, cast_hash, amount, token_address)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id
      `, [
        tip.interactionType,
        tip.authorFid,
        tip.interactorFid,
        tip.authorAddress,
        tip.interactorAddress,
        tip.castHash,
        tip.amount,
        tip.tokenAddress
      ]);
      
      console.log(`📝 Added pending tip with ID: ${result.rows[0].id}`);
      return result.rows[0].id;
    } catch (error) {
      console.error('Error adding pending tip:', error);
      throw error;
    }
  }

  async getPendingTips() {
    try {
      const result = await this.pool.query('SELECT * FROM pending_tips ORDER BY added_at ASC');
      return result.rows.map(row => ({
        interactionType: row.interaction_type,
        actionType: row.interaction_type, // Add actionType for batch processor
        authorFid: row.author_fid,
        interactorFid: row.interactor_fid,
        authorAddress: row.author_address,
        interactorAddress: row.interactor_address,
        castHash: row.cast_hash,
        amount: row.amount,
        tokenAddress: row.token_address,
        timestamp: row.added_at
      }));
    } catch (error) {
      console.error('Error getting pending tips:', error);
      return [];
    }
  }

  async clearPendingTips() {
    try {
      await this.pool.query('DELETE FROM pending_tips');
      console.log('🧹 Cleared all pending tips');
    } catch (error) {
      console.error('Error clearing pending tips:', error);
    }
  }
  // Tip history
  async addTipHistory(tip) {
    try {
      const result = await this.pool.query(`
        INSERT INTO tip_history 
        (from_address, to_address, token_address, amount, action_type, cast_hash, transaction_hash)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id, processed_at
      `, [
        tip.fromAddress,
        tip.toAddress,
        tip.tokenAddress,
        tip.amount,
        tip.actionType,
        tip.castHash,
        tip.transactionHash
      ]);
      
      console.log(`💾 Tip recorded: ${tip.fromAddress} → ${tip.toAddress} (${tip.amount} ${tip.actionType})`);
      
      // If this is a follow tip, also record it in follow_tips table
      if (tip.actionType === 'follow' && tip.authorFid && tip.interactorFid) {
        await this.recordFollowTip(
          tip.authorFid,
          tip.interactorFid,
          tip.fromAddress,
          tip.toAddress,
          tip.amount,
          tip.tokenSymbol || 'USDC'
        );
      }
      
    } catch (error) {
      console.error('Error adding tip history:', error);
      throw error;
    }
  }

  async getTipHistory(userAddress, limit = 50) {
    try {
      const result = await this.pool.query(`
        SELECT * FROM tip_history 
        WHERE from_address = $1 OR to_address = $1 
        ORDER BY processed_at DESC 
        LIMIT $2
      `, [userAddress.toLowerCase(), limit]);
      
      return result.rows;
    } catch (error) {
      console.error('Error getting tip history:', error);
      return [];
    }
  }

  // Admin functions for total stats
  async getTotalTips() {
    try {
      const result = await this.pool.query('SELECT COUNT(*) as count FROM tip_history');
      return parseInt(result.rows[0].count);
    } catch (error) {
      console.error('Error getting total tips:', error);
      return 0;
    }
  }

  async getTotalAmountTipped() {
    try {
      const result = await this.pool.query('SELECT SUM(CAST(amount AS DECIMAL)) as total FROM tip_history');
      return parseFloat(result.rows[0].total || 0);
    } catch (error) {
      console.error('Error getting total amount tipped:', error);
      return 0;
    }
  }

  // User earnings functions for leaderboard optimization
  async initializeUserEarnings() {
    try {
      console.log('🔄 Initializing user_earnings table from existing tip_history...');
      
      // Get all unique FIDs from tip_history (both from and to addresses)
      const result = await this.pool.query(`
        SELECT DISTINCT from_address, to_address FROM tip_history
        WHERE LOWER(token_address) = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913'
      `);
      
      const allAddresses = new Set();
      result.rows.forEach(row => {
        allAddresses.add(row.from_address);
        allAddresses.add(row.to_address);
      });
      
      console.log(`📊 Found ${allAddresses.size} unique addresses in tip_history`);
      
      // Calculate earnings and tippings for each address
      for (const address of allAddresses) {
        await this.calculateUserEarnings(address);
      }
      
      console.log('✅ User earnings initialization completed');
    } catch (error) {
      console.error('❌ Error initializing user earnings:', error);
    }
  }

  // Duplicate calculateUserEarnings function removed - using the one with timeFilter parameter

  async getFidFromAddress(userAddress) {
    try {
      // Look up FID from Neynar API
      const response = await fetch(
        `https://api.neynar.com/v2/farcaster/user/bulk-by-address/?addresses=${userAddress}`,
        {
          headers: { 
            'x-api-key': process.env.NEYNAR_API_KEY,
            'x-neynar-experimental': 'false'
          }
        }
      );
      
      if (response.ok) {
        const data = await response.json();
        const user = data[userAddress]?.[0];
        if (user && user.fid) {
          return user.fid;
        }
      }
      
      // Fallback to hash if Neynar lookup fails
      return Math.abs(userAddress.split('').reduce((a, b) => {
        a = ((a << 5) - a) + b.charCodeAt(0);
        return a & a;
      }, 0));
    } catch (error) {
      console.error('Error getting FID from address:', error);
      return null;
    }
  }

  async updateUserEarningsAfterTip(fromAddress, toAddress, amount) {
    try {
      // Update earnings for recipient
      await this.calculateUserEarnings(toAddress);
      // Update tippings for sender
      await this.calculateUserEarnings(fromAddress);
    } catch (error) {
      console.error('Error updating user earnings after tip:', error);
    }
  }


  async getTotalUsers() {
    try {
      const result = await this.pool.query('SELECT COUNT(DISTINCT from_address) as count FROM tip_history');
      return parseInt(result.rows[0].count);
    } catch (error) {
      console.error('Error getting total users:', error);
      return 0;
    }
  }

  async getTotalTransactions() {
    try {
      const result = await this.pool.query('SELECT COUNT(DISTINCT transaction_hash) as count FROM tip_history WHERE transaction_hash IS NOT NULL');
      return parseInt(result.rows[0].count);
    } catch (error) {
      console.error('Error getting total transactions:', error);
      return 0;
    }
  }

  async getRecentTips(limit = 50) {
    try {
      const result = await this.pool.query(`
        SELECT 
          from_address,
          to_address,
          amount,
          token_address,
          transaction_hash,
          processed_at,
          action_type
        FROM tip_history 
        ORDER BY processed_at DESC 
        LIMIT $1
      `, [limit]);
      
      return result.rows.map(row => ({
        fromAddress: row.from_address,
        toAddress: row.to_address,
        amount: parseFloat(row.amount),
        tokenAddress: row.token_address,
        txHash: row.transaction_hash,
        processedAt: row.processed_at,
        interactionType: row.action_type
      }));
    } catch (error) {
      console.error('Error getting recent tips:', error);
      return [];
    }
  }

  // Clean up tips older than 30 days to save database space
  async cleanupOldTips() {
    try {
      // Only run cleanup once per day to avoid performance issues
      const lastCleanup = await this.pool.query(`
        SELECT value FROM app_settings WHERE key = 'last_cleanup' LIMIT 1
      `).catch(() => ({ rows: [] }));
      
      const today = new Date().toDateString();
      if (lastCleanup.rows.length > 0 && lastCleanup.rows[0].value === today) {
        return; // Already cleaned up today
      }
      
      // DO NOT DELETE tip history - we need all data for accurate calculations
      // Removed deletion to preserve all tip history data
      console.log(`ℹ️ Tip history cleanup skipped - preserving all data for accurate leaderboard`);
      
      // Update last cleanup date
      await this.pool.query(`
        INSERT INTO app_settings (key, value) 
        VALUES ('last_cleanup', $1)
        ON CONFLICT (key) DO UPDATE SET value = $1
      `, [today]).catch(() => {
        // Create table if it doesn't exist
        this.pool.query(`
          CREATE TABLE IF NOT EXISTS app_settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at TIMESTAMP DEFAULT NOW()
          )
        `).then(() => {
          this.pool.query(`
            INSERT INTO app_settings (key, value) VALUES ('last_cleanup', $1)
          `, [today]);
        });
      });
      
    } catch (error) {
      console.error('Error during cleanup:', error);
      // Don't fail the main query if cleanup fails
    }
  }
  
  // Webhook configuration methods
  async setWebhookId(webhookId) {
    try {
      console.log('💾 Saving webhook ID to database:', webhookId);
      await this.pool.query(`
        INSERT INTO webhook_config (webhook_id, tracked_fids) 
        VALUES ($1, $2)
        ON CONFLICT (id) DO UPDATE SET 
          webhook_id = EXCLUDED.webhook_id,
          updated_at = NOW()
      `, [webhookId, []]);
      console.log('✅ Webhook ID saved successfully');
    } catch (error) {
      console.error('❌ Error setting webhook ID:', error);
    }
  }
  
  async getWebhookId() {
    try {
      const result = await this.pool.query(`
        SELECT webhook_id FROM webhook_config ORDER BY updated_at DESC LIMIT 1
      `);
      const webhookId = result.rows[0]?.webhook_id || null;
      console.log('🔍 Retrieved webhook ID from database:', webhookId);
      return webhookId;
    } catch (error) {
      console.error('❌ Error getting webhook ID:', error);
      return null;
    }
  }
  
  async setTrackedFids(fids) {
    try {
      await this.pool.query(`
        INSERT INTO webhook_config (webhook_id, tracked_fids) 
        VALUES ($1, $2)
        ON CONFLICT (id) DO UPDATE SET 
          tracked_fids = EXCLUDED.tracked_fids,
          updated_at = NOW()
      `, [await this.getWebhookId(), fids]);
    } catch (error) {
      console.error('Error setting tracked FIDs:', error);
    }
  }
  
  async getTrackedFids() {
    try {
      const result = await this.pool.query(`
        SELECT tracked_fids FROM webhook_config ORDER BY updated_at DESC LIMIT 1
      `);
      return result.rows[0]?.tracked_fids || [];
    } catch (error) {
      console.error('Error getting tracked FIDs:', error);
      return [];
    }
  }
  
  // User casts management methods
  async addUserCast(userFid, castHash, isMainCast = true) {
    try {
      await this.pool.query(`
        INSERT INTO user_casts (user_fid, cast_hash, is_main_cast)
        VALUES ($1, $2, $3)
        ON CONFLICT (user_fid, cast_hash) DO NOTHING
      `, [userFid, castHash, isMainCast]);
      
      // Keep only latest 1 main cast for each user (since only latest cast is earnable)
      await this.pool.query(`
        DELETE FROM user_casts 
        WHERE user_fid = $1 AND is_main_cast = true
        AND id NOT IN (
          SELECT id FROM user_casts 
          WHERE user_fid = $1 AND is_main_cast = true
          ORDER BY created_at DESC 
          LIMIT 1
        )
      `, [userFid]);
    } catch (error) {
      console.error('Error adding user cast:', error);
    }
  }
  
  async getEligibleCasts(userFid) {
    try {
      const result = await this.pool.query(`
        SELECT cast_hash FROM user_casts 
        WHERE user_fid = $1 AND is_main_cast = true
        ORDER BY created_at DESC 
        LIMIT 1
      `, [userFid]);
      
      return result.rows.map(row => row.cast_hash);
    } catch (error) {
      console.error('Error getting eligible casts:', error);
      return [];
    }
  }
  
  async isCastEligibleForTips(userFid, castHash) {
    try {
      const eligibleCasts = await this.getEligibleCasts(userFid);
      const isEligible = eligibleCasts.includes(castHash);
      
      console.log(`🔍 Cast eligibility check for FID ${userFid}:`, {
        castHash,
        eligibleCasts,
        isEligible
      });
      
      return isEligible;
    } catch (error) {
      console.error('Error checking cast eligibility:', error);
      return false;
    }
  }

  // Check if user has already been tipped for this cast and action type
  async hasUserBeenTippedForCast(authorAddress, interactorAddress, castHash, actionType) {
    try {
      const result = await this.pool.query(`
        SELECT COUNT(*) as count FROM tip_history 
        WHERE from_address = $1 AND to_address = $2 AND cast_hash = $3 AND action_type = $4
      `, [authorAddress.toLowerCase(), interactorAddress.toLowerCase(), castHash, actionType]);
      
      const hasBeenTipped = parseInt(result.rows[0].count) > 0;
      console.log(`🔍 Duplicate check: ${interactorAddress} ${hasBeenTipped ? 'HAS' : 'HAS NOT'} been tipped for ${actionType} on cast ${castHash}`);
      return hasBeenTipped;
    } catch (error) {
      console.error('Error checking tip history:', error);
      return false;
    }
  }
  // Check if user has already been tipped for following
  async hasUserBeenTippedForFollow(authorFid, followerFid) {
    try {
      const result = await this.pool.query(
        'SELECT id FROM follow_tips WHERE author_fid = $1 AND follower_fid = $2',
        [authorFid, followerFid]
      );
      return result.rows.length > 0;
    } catch (error) {
      console.error('Error checking follow tip:', error);
      return false;
    }
  }

  // Record a follow tip
  async recordFollowTip(authorFid, followerFid, authorAddress, followerAddress, tipAmount, tokenSymbol) {
    try {
      await this.pool.query(
        'INSERT INTO follow_tips (author_fid, follower_fid, author_address, follower_address, tip_amount, token_symbol) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (author_fid, follower_fid) DO NOTHING',
        [authorFid, followerFid, authorAddress, followerAddress, tipAmount, tokenSymbol]
      );
      console.log(`✅ Recorded follow tip: ${followerFid} -> ${authorFid} (${tipAmount} ${tokenSymbol})`);
    } catch (error) {
      console.error('Error recording follow tip:', error);
    }
  }

  // Get tips since a specific date
  async getTipsSince(sinceDate) {
    try {
      const result = await this.pool.query(`
        SELECT 
          from_address as "fromAddress",
          to_address as "toAddress", 
          token_address as "tokenAddress",
          amount,
          action_type as "actionType",
          cast_hash as "castHash",
          timestamp
        FROM tip_history 
        WHERE timestamp >= $1
        ORDER BY timestamp DESC
      `, [sinceDate]);
      
      console.log(`📊 Found ${result.rows.length} tips since ${sinceDate.toISOString()}`);
      return result.rows;
    } catch (error) {
      console.error('Error getting tips since date:', error);
      return [];
    }
  }

  // Get a config value
  async getConfig(key) {
    try {
      const result = await this.pool.query(`
        SELECT value FROM app_settings WHERE key = $1
      `, [key]);
      
      return result.rows.length > 0 ? result.rows[0].value : null;
    } catch (error) {
      console.error('Error getting config:', error);
      return null;
    }
  }

  // Set a config value
  async setConfig(key, value) {
    try {
      await this.pool.query(`
        INSERT INTO app_settings (key, value) 
        VALUES ($1, $2) 
        ON CONFLICT (key) 
        DO UPDATE SET value = $2, updated_at = NOW()
      `, [key, value]);
      
      console.log(`💾 Config updated: ${key} = ${value}`);
    } catch (error) {
      console.error('Error setting config:', error);
    }
  }

  // Get all user addresses
  async getAllUsers() {
    try {
      const result = await this.pool.query(`
        SELECT user_address FROM user_configs
      `);
      
      return result.rows.map(row => row.user_address);
    } catch (error) {
      console.error('Error getting all users:', error);
      return [];
    }
  }

  // Using webhook filtering based on allowance and balance checks

  // Notification token methods
  async saveNotificationToken(userAddress, fid, token, notificationUrl) {
    try {
      await this.pool.query(`
        INSERT INTO notification_tokens (user_address, fid, token, notification_url, is_active, updated_at)
        VALUES ($1, $2, $3, $4, true, NOW())
        ON CONFLICT (user_address, fid)
        DO UPDATE SET 
          token = $3,
          notification_url = $4,
          is_active = true,
          updated_at = NOW()
      `, [userAddress.toLowerCase(), fid, token, notificationUrl]);
      
      console.log(`💾 Saved notification token for user ${userAddress} (FID: ${fid})`);
      return true;
    } catch (error) {
      console.error('Error saving notification token:', error.message);
      return false;
    }
  }

  async getNotificationToken(userAddress) {
    try {
      const result = await this.pool.query(`
        SELECT token, notification_url, fid
        FROM notification_tokens 
        WHERE user_address = $1 AND is_active = true
        ORDER BY updated_at DESC
        LIMIT 1
      `, [userAddress.toLowerCase()]);
      
      return result.rows[0] || null;
    } catch (error) {
      console.error('Error getting notification token:', error.message);
      return null;
    }
  }

  async getAllNotificationTokens() {
    try {
      const result = await this.pool.query(`
        SELECT user_address, fid, token, notification_url
        FROM notification_tokens 
        WHERE is_active = true
        ORDER BY updated_at DESC
      `);
      
      return result.rows;
    } catch (error) {
      console.error('Error getting all notification tokens:', error.message);
      return [];
    }
  }

  async deactivateNotificationToken(userAddress, fid = null) {
    try {
      let query, params;
      
      if (fid) {
        query = `
          UPDATE notification_tokens 
          SET is_active = false, updated_at = NOW()
          WHERE user_address = $1 AND fid = $2
        `;
        params = [userAddress.toLowerCase(), fid];
      } else {
        query = `
          UPDATE notification_tokens 
          SET is_active = false, updated_at = NOW()
          WHERE user_address = $1
        `;
        params = [userAddress.toLowerCase()];
      }
      
      const result = await this.pool.query(query, params);
      console.log(`🚫 Deactivated notification token for user ${userAddress} (FID: ${fid || 'all'})`);
      return result.rowCount > 0;
    } catch (error) {
      console.error('Error deactivating notification token:', error.message);
      return false;
    }
  }
}

module.exports = new PostgresDatabase();