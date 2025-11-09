const { Pool } = require('pg');

class PostgresDatabase {
  constructor() {
    this.pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    });
    
    console.log('🗄️ PostgreSQL Database initialized');
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

      // user_earnings table removed - we calculate directly from tip_history now
      
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
      
      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS blocklist (
          id SERIAL PRIMARY KEY,
          user_address TEXT NOT NULL UNIQUE,
          reason TEXT,
          added_at TIMESTAMP DEFAULT NOW()
        )
      `);

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

      const result = await this.pool.query(`
        SELECT 
          SUM(CASE WHEN LOWER(to_address) = LOWER($1) THEN amount::NUMERIC ELSE 0 END) as total_earnings,
          SUM(CASE WHEN LOWER(from_address) = LOWER($1) THEN amount::NUMERIC ELSE 0 END) as total_tippings
        FROM tip_history 
        WHERE token_address = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913'
        ${timeCondition}
      `, [userAddress]);

      const stats = result.rows[0];
      return {
        totalEarnings: parseFloat(stats.total_earnings) || 0,
        totalTippings: parseFloat(stats.total_tippings) || 0
      };
    } catch (error) {
      console.error('Error calculating user earnings:', error);
      return { totalEarnings: 0, totalTippings: 0 };
    }
  }

  // Get leaderboard data with real-time earnings calculation
  async getLeaderboardData(timeFilter = 'total', page = 1, limit = 10) {
    try {
      // Get all users from user_profiles
      const usersResult = await this.pool.query(`
        SELECT fid, username, display_name, pfp_url, follower_count, user_address
        FROM user_profiles 
        ORDER BY fid DESC
      `);

      const users = usersResult.rows;
      const usersWithEarnings = [];

      // Calculate earnings for each user using their address
      for (const user of users) {
        if (user.user_address) {
          const earnings = await this.calculateUserEarnings(user.user_address, timeFilter);
          usersWithEarnings.push({
            ...user,
            ...earnings
          });
        }
      }

      // Sort by earnings
      usersWithEarnings.sort((a, b) => b.totalEarnings - a.totalEarnings);

      // Pagination
      const startIndex = (page - 1) * limit;
      const endIndex = startIndex + limit;
      const paginatedUsers = usersWithEarnings.slice(startIndex, endIndex);

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
      const config = result.rows[0]?.config || null;
      console.log(`📖 Retrieved config for ${userAddress}:`, !!config);
      return config;
    } catch (error) {
      console.error('📖 Error reading user config:', error.message);
      return null;
    }
  }

  // Save user profile when they approve USDC (called from backend)
  async saveUserProfileFromApproval(userAddress, fid, username, displayName, pfpUrl) {
    try {
      const result = await this.pool.query(`
        INSERT INTO user_profiles (fid, username, display_name, pfp_url, user_address, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
        ON CONFLICT (fid) 
        DO UPDATE SET 
          username = EXCLUDED.username,
          display_name = EXCLUDED.display_name,
          pfp_url = EXCLUDED.pfp_url,
          user_address = EXCLUDED.user_address,
          updated_at = NOW()
      `, [fid, username, displayName, pfpUrl, userAddress]);

      console.log(`✅ Saved user profile for FID ${fid} with address ${userAddress}`);
      return true;
    } catch (error) {
      console.error('Error saving user profile from approval:', error);
      return false;
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

  // getTopTippers removed - use getLeaderboardData instead

  async getTopEarners(timeFilter = 'total') {
    try {
      // First check if user_earnings has data
      const earningsCount = await this.pool.query('SELECT COUNT(*) FROM user_earnings');
      const hasEarningsData = parseInt(earningsCount.rows[0].count) > 0;
      
      if (hasEarningsData) {
        // Use user_earnings table
        let columnName;
        switch (timeFilter) {
          case '24h': columnName = 'earnings_24h'; break;
          case '7d': columnName = 'earnings_7d'; break;
          case '30d': columnName = 'earnings_30d'; break;
          case 'total': 
          default: columnName = 'total_earnings'; break;
        }
        
        const result = await this.pool.query(`
          SELECT 
            ue.fid,
            ue.${columnName} as total_amount,
            ue.last_updated
          FROM user_earnings ue
          WHERE ue.${columnName} > 0
          ORDER BY ue.${columnName} DESC 
          LIMIT 50
        `);
        
        return result.rows.map(row => ({
          fid: row.fid,
          totalAmount: parseFloat(row.total_amount),
          lastUpdated: row.last_updated
        }));
      } else {
        // Fallback to tip_history calculation
        console.log('📊 user_earnings empty, calculating from tip_history...');
        let timeCondition = '';
        switch (timeFilter) {
          case '24h': timeCondition = "AND created_at >= NOW() - INTERVAL '24 hours'"; break;
          case '7d': timeCondition = "AND created_at >= NOW() - INTERVAL '7 days'"; break;
          case '30d': timeCondition = "AND created_at >= NOW() - INTERVAL '30 days'"; break;
          case 'total': 
          default: timeCondition = ''; break;
        }
        
        const result = await this.pool.query(`
          SELECT 
            (uc.config->>'fid')::bigint as fid,
            uc.user_address,
            SUM(CAST(th.amount AS DECIMAL)) as total_amount,
            MAX(th.created_at) as last_updated
          FROM tip_history th
          JOIN user_configs uc ON LOWER(uc.user_address) = LOWER(th.to_address)
          WHERE LOWER(th.token_address) = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913'
          AND uc.config->>'fid' IS NOT NULL
          ${timeCondition}
          GROUP BY (uc.config->>'fid')::bigint, uc.user_address
          HAVING SUM(CAST(th.amount AS DECIMAL)) > 0
          ORDER BY total_amount DESC
          LIMIT 50
        `);
        
        return result.rows.map(row => ({
          fid: row.fid,
          userAddress: row.user_address,
          totalAmount: parseFloat(row.total_amount),
          lastUpdated: row.last_updated
        }));
      }
    } catch (error) {
      console.error('Error getting top earners:', error);
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

  async calculateUserEarnings(userAddress) {
    try {
      // Get FID for this address (you'll need to implement this)
      const fid = await this.getFidFromAddress(userAddress);
      if (!fid) return;

      // Calculate earnings (received tips)
      const earningsResult = await this.pool.query(`
        SELECT 
          SUM(CASE WHEN processed_at > NOW() - INTERVAL '24 hours' THEN CAST(amount AS DECIMAL) ELSE 0 END) as earnings_24h,
          SUM(CASE WHEN processed_at > NOW() - INTERVAL '7 days' THEN CAST(amount AS DECIMAL) ELSE 0 END) as earnings_7d,
          SUM(CASE WHEN processed_at > NOW() - INTERVAL '30 days' THEN CAST(amount AS DECIMAL) ELSE 0 END) as earnings_30d,
          SUM(CAST(amount AS DECIMAL)) as total_earnings
        FROM tip_history 
        WHERE to_address = $1 
        AND LOWER(token_address) = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913'
      `, [userAddress]);

      // Calculate tippings (sent tips)
      const tippingsResult = await this.pool.query(`
        SELECT 
          SUM(CASE WHEN processed_at > NOW() - INTERVAL '24 hours' THEN CAST(amount AS DECIMAL) ELSE 0 END) as tippings_24h,
          SUM(CASE WHEN processed_at > NOW() - INTERVAL '7 days' THEN CAST(amount AS DECIMAL) ELSE 0 END) as tippings_7d,
          SUM(CASE WHEN processed_at > NOW() - INTERVAL '30 days' THEN CAST(amount AS DECIMAL) ELSE 0 END) as tippings_30d,
          SUM(CAST(amount AS DECIMAL)) as total_tippings
        FROM tip_history 
        WHERE from_address = $1 
        AND LOWER(token_address) = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913'
      `, [userAddress]);

      const earnings = earningsResult.rows[0];
      const tippings = tippingsResult.rows[0];

      // Insert or update user earnings
      await this.pool.query(`
        INSERT INTO user_earnings (fid, total_earnings, earnings_24h, earnings_7d, earnings_30d, total_tippings, tippings_24h, tippings_7d, tippings_30d, last_updated)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
        ON CONFLICT (fid) 
        DO UPDATE SET 
          total_earnings = EXCLUDED.total_earnings,
          earnings_24h = EXCLUDED.earnings_24h,
          earnings_7d = EXCLUDED.earnings_7d,
          earnings_30d = EXCLUDED.earnings_30d,
          total_tippings = EXCLUDED.total_tippings,
          tippings_24h = EXCLUDED.tippings_24h,
          tippings_7d = EXCLUDED.tippings_7d,
          tippings_30d = EXCLUDED.tippings_30d,
          last_updated = NOW()
      `, [
        fid,
        parseFloat(earnings.total_earnings || 0),
        parseFloat(earnings.earnings_24h || 0),
        parseFloat(earnings.earnings_7d || 0),
        parseFloat(earnings.earnings_30d || 0),
        parseFloat(tippings.total_tippings || 0),
        parseFloat(tippings.tippings_24h || 0),
        parseFloat(tippings.tippings_7d || 0),
        parseFloat(tippings.tippings_30d || 0)
      ]);

    } catch (error) {
      console.error(`❌ Error calculating earnings for ${userAddress}:`, error);
    }
  }

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

  async getUserEarnings(fid) {
    try {
      console.log(`🔍 Getting user earnings for FID: ${fid}`);
      const result = await this.pool.query(`
        SELECT 
          fid,
          total_earnings,
          earnings_24h,
          earnings_7d,
          earnings_30d,
          total_tippings,
          tippings_24h,
          tippings_7d,
          tippings_30d,
          last_updated
        FROM user_earnings 
        WHERE fid = $1
      `, [fid]);
      
      console.log(`📊 User earnings query result:`, result.rows);
      
      if (result.rows.length === 0) {
        console.log(`❌ No user earnings found for FID: ${fid}, checking if user has tip history...`);
        
        // First check if user has a wallet address linked to their FID
        const userAddressResult = await this.pool.query(`
          SELECT user_address FROM user_configs WHERE config->>'fid' = $1 LIMIT 1
        `, [fid.toString()]);
        
        console.log(`🔍 User address for FID ${fid}:`, userAddressResult.rows);
        
        if (userAddressResult.rows.length === 0) {
          console.log(`❌ No wallet address found for FID: ${fid}`);
          return {
            fid,
            totalEarnings: 0,
            earnings24h: 0,
            earnings7d: 0,
            earnings30d: 0,
            totalTippings: 0,
            tippings24h: 0,
            tippings7d: 0,
            tippings30d: 0
          };
        }
        
        const userAddress = userAddressResult.rows[0].user_address;
        console.log(`💰 User wallet address: ${userAddress}`);
        
        // Calculate all time periods from tip_history
        const tipHistoryResult = await this.pool.query(`
          SELECT 
            SUM(CASE WHEN LOWER(to_address) = LOWER($2) THEN CAST(amount AS DECIMAL) ELSE 0 END) as total_earnings,
            SUM(CASE WHEN LOWER(to_address) = LOWER($2) AND created_at >= NOW() - INTERVAL '24 hours' THEN CAST(amount AS DECIMAL) ELSE 0 END) as earnings_24h,
            SUM(CASE WHEN LOWER(to_address) = LOWER($2) AND created_at >= NOW() - INTERVAL '7 days' THEN CAST(amount AS DECIMAL) ELSE 0 END) as earnings_7d,
            SUM(CASE WHEN LOWER(to_address) = LOWER($2) AND created_at >= NOW() - INTERVAL '30 days' THEN CAST(amount AS DECIMAL) ELSE 0 END) as earnings_30d,
            SUM(CASE WHEN LOWER(from_address) = LOWER($2) THEN CAST(amount AS DECIMAL) ELSE 0 END) as total_tippings,
            SUM(CASE WHEN LOWER(from_address) = LOWER($2) AND created_at >= NOW() - INTERVAL '24 hours' THEN CAST(amount AS DECIMAL) ELSE 0 END) as tippings_24h,
            SUM(CASE WHEN LOWER(from_address) = LOWER($2) AND created_at >= NOW() - INTERVAL '7 days' THEN CAST(amount AS DECIMAL) ELSE 0 END) as tippings_7d,
            SUM(CASE WHEN LOWER(from_address) = LOWER($2) AND created_at >= NOW() - INTERVAL '30 days' THEN CAST(amount AS DECIMAL) ELSE 0 END) as tippings_30d
          FROM tip_history 
          WHERE LOWER(token_address) = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913'
        `, [fid, userAddress]);
        
        console.log(`📊 Tip history check result:`, tipHistoryResult.rows[0]);
        
        const totalEarnings = parseFloat(tipHistoryResult.rows[0]?.total_earnings || 0);
        const earnings24h = parseFloat(tipHistoryResult.rows[0]?.earnings_24h || 0);
        const earnings7d = parseFloat(tipHistoryResult.rows[0]?.earnings_7d || 0);
        const earnings30d = parseFloat(tipHistoryResult.rows[0]?.earnings_30d || 0);
        const totalTippings = parseFloat(tipHistoryResult.rows[0]?.total_tippings || 0);
        const tippings24h = parseFloat(tipHistoryResult.rows[0]?.tippings_24h || 0);
        const tippings7d = parseFloat(tipHistoryResult.rows[0]?.tippings_7d || 0);
        const tippings30d = parseFloat(tipHistoryResult.rows[0]?.tippings_30d || 0);
        
        console.log(`📈 Calculated from tip_history - Earnings: ${totalEarnings}, Tippings: ${totalTippings}`);
        
        return {
          fid,
          totalEarnings,
          earnings24h,
          earnings7d,
          earnings30d,
          totalTippings,
          tippings24h,
          tippings7d,
          tippings30d
        };
      }
      
      const row = result.rows[0];
      const userStats = {
        fid: row.fid,
        totalEarnings: parseFloat(row.total_earnings),
        earnings24h: parseFloat(row.earnings_24h),
        earnings7d: parseFloat(row.earnings_7d),
        earnings30d: parseFloat(row.earnings_30d),
        totalTippings: parseFloat(row.total_tippings),
        tippings24h: parseFloat(row.tippings_24h),
        tippings7d: parseFloat(row.tippings_7d),
        tippings30d: parseFloat(row.tippings_30d),
        lastUpdated: row.last_updated
      };
      console.log(`✅ User earnings data:`, userStats);
      return userStats;
    } catch (error) {
      console.error('Error getting user earnings:', error);
      return {
        fid,
        totalEarnings: 0,
        earnings24h: 0,
        earnings7d: 0,
        earnings30d: 0,
        totalTippings: 0,
        tippings24h: 0,
        tippings7d: 0,
        tippings30d: 0
      };
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
      
      // Delete tips older than 30 days
      const result = await this.pool.query(`
        DELETE FROM tip_history 
        WHERE processed_at < NOW() - INTERVAL '30 days'
      `);
      
      if (result.rowCount > 0) {
        console.log(`🧹 Cleaned up ${result.rowCount} old tips (older than 30 days)`);
      }
      
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

  // Save blocklist to database
  async setBlocklist(blockedUsers) {
    try {
      await this.pool.query(`
        INSERT INTO app_settings (key, value) 
        VALUES ('blocklist', $1) 
        ON CONFLICT (key) 
        DO UPDATE SET value = $1, updated_at = NOW()
      `, [JSON.stringify(blockedUsers)]);
      
      console.log(`💾 Blocklist saved: ${blockedUsers.length} users`);
    } catch (error) {
      console.error('Error saving blocklist:', error);
    }
  }

  // Get blocklist from database
  async getBlocklist() {
    try {
      const result = await this.pool.query(`
        SELECT value FROM app_settings WHERE key = 'blocklist'
      `);
      
      if (result.rows.length > 0) {
        return JSON.parse(result.rows[0].value);
      }
      return [];
    } catch (error) {
      console.error('Error getting blocklist:', error);
      return [];
    }
  }

  // Add user to blocklist
  async addToBlocklist(userAddress) {
    try {
      const normalizedAddress = userAddress.toLowerCase();
      
      // Get current blocklist
      const currentBlocklist = await this.getBlocklist();
      
      // Add user if not already present
      if (!currentBlocklist.includes(normalizedAddress)) {
        currentBlocklist.push(normalizedAddress);
        await this.setBlocklist(currentBlocklist);
        console.log(`📝 Added ${normalizedAddress} to database blocklist`);
        return true;
      } else {
        console.log(`ℹ️ User ${normalizedAddress} already in database blocklist`);
        return false;
      }
    } catch (error) {
      console.error(`❌ Error adding ${userAddress} to blocklist:`, error);
      return false;
    }
  }

  // Remove user from blocklist
  async removeFromBlocklist(userAddress) {
    try {
      const normalizedAddress = userAddress.toLowerCase();
      
      // Get current blocklist
      const currentBlocklist = await this.getBlocklist();
      
      // Remove user if present
      const index = currentBlocklist.indexOf(normalizedAddress);
      if (index > -1) {
        currentBlocklist.splice(index, 1);
        await this.setBlocklist(currentBlocklist);
        console.log(`📝 Removed ${normalizedAddress} from database blocklist`);
        return true;
      } else {
        console.log(`ℹ️ User ${normalizedAddress} not in database blocklist`);
        return false;
      }
    } catch (error) {
      console.error(`❌ Error removing ${userAddress} from blocklist:`, error);
      return false;
    }
  }

  // Check if user is in blocklist
  async isUserBlocked(userAddress) {
    try {
      const normalizedAddress = userAddress.toLowerCase();
      const blocklist = await this.getBlocklist();
      return blocklist.includes(normalizedAddress);
    } catch (error) {
      console.error(`❌ Error checking if ${userAddress} is blocked:`, error);
      return false;
    }
  }

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