const { ethers } = require('ethers');
const BatchTipManager = require('./batchTipManager');
const EcionBatchManager = require('./ecionBatchManager');

// Token decimals mapping (to avoid circular dependency) - all lowercase keys
const TOKEN_DECIMALS = {
  '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913': 6, // USDC
  '0x4200000000000000000000000000000000000006': 18, // WETH
  '0x50c5725949a6f0c72e6c4a641f24049a917db0cb': 18, // DAI
  '0x940181a94a35a4569e4529a3cdfb74e38fd98631': 18, // AERO
};

function getTokenDecimals(tokenAddress) {
  return TOKEN_DECIMALS[tokenAddress.toLowerCase()] || 18; // Default to 18 decimals
}

// Use PostgreSQL database if available, fallback to file storage
let database;
try {
  if (process.env.DATABASE_URL) {
    database = require('./database-pg');
  } else {
    database = require('./database');
  }
} catch (error) {
  database = require('./database');
}

class BatchTransferManager {
  constructor() {
    this.provider = new ethers.JsonRpcProvider(process.env.BASE_RPC_URL);
    this.wallet = new ethers.Wallet(process.env.BACKEND_WALLET_PRIVATE_KEY, this.provider);
    
    // Initialize batch managers
    this.batchTipManager = new BatchTipManager(this.provider, this.wallet);
    this.ecionBatchManager = new EcionBatchManager(this.provider, this.wallet);
    
    // Batch configuration
    this.batchIntervalMs = 60000; // 1 minute batches like Noice
    this.maxBatchSize = 100; // Maximum tips per batch
    this.minBatchSize = 1; // Minimum tips to trigger batch
    
    // Pending tips queue
    this.pendingTips = [];
    
    // Blocked users (insufficient allowance) - load from database on startup
    this.blockedUsers = new Set();
    this.isProcessing = false;
    
    // Load blocklist from database on startup
    this.loadBlocklistFromDatabase();
    
    // Clean up blocklist - remove users with sufficient allowance
    setTimeout(() => {
      this.cleanupBlocklist();
    }, 5000); // Wait 5 seconds for database to be ready
    
    // Batch processing is handled by EcionBatch contract
    
    // Start batch processing timer
    this.startBatchTimer();
    
    console.log(`🔄 Batch Transfer Manager initialized`);
    console.log(`💰 Backend wallet address: ${this.wallet.address}`);
    console.log(`⏰ Batch interval: ${this.batchIntervalMs / 1000} seconds`);
  }

  startBatchTimer() {
    setInterval(async () => {
      if (!this.isProcessing && this.pendingTips.length > 0) {
        console.log(`⏰ Timer triggered - processing ${this.pendingTips.length} pending tips`);
        await this.processBatch();
      }
    }, this.batchIntervalMs);
    
    console.log(`⏰ Batch timer started - processing every ${this.batchIntervalMs / 1000} seconds`);
  }

  async addTipToBatch(interaction, authorConfig) {
    const userKey = interaction.authorAddress.toLowerCase();
    
    // Check if user is in blocklist (insufficient allowance)
    if (this.blockedUsers.has(userKey)) {
      console.log(`⏭️ Skipping tip - user ${interaction.authorAddress} is in blocklist (insufficient allowance)`);
      return { success: false, reason: 'User blocked - insufficient allowance' };
    }
    
    // Check both allowance and balance in one blockchain call
    const tokenAddress = authorConfig.tokenAddress || '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
    const likeAmount = parseFloat(authorConfig.likeAmount || '0');
    const recastAmount = parseFloat(authorConfig.recastAmount || '0');
    const replyAmount = parseFloat(authorConfig.replyAmount || '0');
    const requiredAmount = likeAmount + recastAmount + replyAmount;
    
    const allowanceBalanceCheck = await this.checkAllowanceAndBalance(interaction.authorAddress, tokenAddress, requiredAmount);
    if (!allowanceBalanceCheck.canAfford) {
      let reason = 'Insufficient funds';
      if (!allowanceBalanceCheck.hasSufficientAllowance) {
        reason = 'Insufficient allowance';
      } else if (!allowanceBalanceCheck.hasSufficientBalance) {
        reason = 'Insufficient balance';
      }
      
      console.log(`⏭️ Skipping tip - user ${interaction.authorAddress} - ${reason}`);
      
      // Clean up webhook and homepage immediately when insufficient funds
      await this.cleanupInactiveUser(interaction.authorAddress);
      
      return { success: false, reason };
    }
    
    // Validate the tip first
    const validation = await this.validateTip(interaction, authorConfig);
    if (!validation.valid) {
      console.log(`❌ Tip validation failed: ${validation.reason}`);
      return { success: false, reason: validation.reason };
    }

    // Add to pending tips
    const tipData = {
      interaction,
      authorConfig,
      amount: validation.amount,
      tokenAddress: authorConfig.tokenAddress,
      timestamp: Date.now(),
      id: `${userKey}_${interaction.interactorAddress}_${interaction.castHash}_${interaction.interactionType}_${Date.now()}`
    };

    this.pendingTips.push(tipData);
    console.log(`📝 Added tip to batch. Total pending: ${this.pendingTips.length}`);
    console.log(`💡 New tip details:`, {
      from: interaction.authorAddress,
      to: interaction.interactorAddress,
      amount: validation.amount,
      type: interaction.interactionType,
      token: authorConfig.tokenAddress,
      timestamp: new Date().toISOString()
    });

    // Process immediately if batch is full (but not for single tips)
    if (this.pendingTips.length >= this.maxBatchSize) {
      console.log(`🚀 Batch size reached (${this.maxBatchSize}), processing immediately`);
      await this.processBatch();
    } else {
      console.log(`⏳ Tip queued. Processing in ${this.batchIntervalMs / 1000} seconds or when batch is full`);
    }

    return { success: true, queued: true, batchSize: this.pendingTips.length };
  }

  // NEW: Check allowance from database (NO API CALLS)
  async checkDatabaseAllowance(userAddress, authorConfig) {
    try {
      const userConfig = await database.getUserConfig(userAddress);
      if (!userConfig) {
        return { canAfford: false, allowanceAmount: 0, minTipAmount: 0 };
      }
      
      // Get REAL blockchain allowance (most accurate)
      const { ethers } = require('ethers');
      const provider = new ethers.JsonRpcProvider(process.env.BASE_RPC_URL);
      const ecionBatchAddress = process.env.ECION_BATCH_CONTRACT_ADDRESS || '0x2f47bcc17665663d1b63e8d882faa0a366907bb8';
      
      // Force USDC token address for now to fix decimal issue
      const tokenAddress = userConfig.tokenAddress || '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
      const tokenContract = new ethers.Contract(tokenAddress, [
        "function allowance(address owner, address spender) view returns (uint256)"
      ], provider);
      
      const allowance = await tokenContract.allowance(userAddress, ecionBatchAddress);
      const tokenDecimals = getTokenDecimals(tokenAddress);
      const allowanceAmount = parseFloat(ethers.formatUnits(allowance, tokenDecimals));
      
      // Calculate total tip amount (like + recast + reply)
      const likeAmount = parseFloat(authorConfig.likeAmount || '0');
      const recastAmount = parseFloat(authorConfig.recastAmount || '0');
      const replyAmount = parseFloat(authorConfig.replyAmount || '0');
      const minTipAmount = likeAmount + recastAmount + replyAmount;
      
      console.log(`💾 Database allowance check: ${userAddress} - allowance: ${allowanceAmount}, total tip: ${minTipAmount} (like: ${likeAmount}, recast: ${recastAmount}, reply: ${replyAmount})`);
      
      return {
        canAfford: allowanceAmount >= minTipAmount,
        allowanceAmount,
        minTipAmount
      };
    } catch (error) {
      console.error('❌ Error checking database allowance:', error);
      return { canAfford: false, allowanceAmount: 0, minTipAmount: 0 };
    }
  }

  // NEW: Check allowance directly from blockchain (most accurate)
  async checkBlockchainAllowance(userAddress, authorConfig) {
    try {
      const userConfig = await database.getUserConfig(userAddress);
      if (!userConfig) {
        return { canAfford: false, allowanceAmount: 0, minTipAmount: 0 };
      }
      
      // Get allowance directly from blockchain
      const { ethers } = require('ethers');
      const provider = new ethers.JsonRpcProvider(process.env.BASE_RPC_URL);
      const ecionBatchAddress = process.env.ECION_BATCH_CONTRACT_ADDRESS || '0x2f47bcc17665663d1b63e8d882faa0a366907bb8';
      
      // Force USDC token address for now to fix decimal issue
      const tokenAddress = userConfig.tokenAddress || '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
      const tokenContract = new ethers.Contract(tokenAddress, [
        "function allowance(address owner, address spender) view returns (uint256)"
      ], provider);
      
      const allowance = await tokenContract.allowance(userAddress, ecionBatchAddress);
      const tokenDecimals = getTokenDecimals(tokenAddress);
      
      console.log(`🔍 DEBUG checkBlockchainAllowance for ${userAddress}:`);
      console.log(`  - Token address: ${tokenAddress}`);
      console.log(`  - Token address (lowercase): ${tokenAddress.toLowerCase()}`);
      console.log(`  - Raw allowance: ${allowance.toString()}`);
      console.log(`  - Token decimals: ${tokenDecimals}`);
      console.log(`  - TOKEN_DECIMALS map:`, TOKEN_DECIMALS);
      console.log(`  - TOKEN_DECIMALS lookup result:`, TOKEN_DECIMALS[tokenAddress.toLowerCase()]);
      
      // Manual calculation to debug
      const rawAllowance = allowance.toString();
      const divisor = Math.pow(10, tokenDecimals);
      const manualCalculation = parseFloat(rawAllowance) / divisor;
      
      console.log(`  - Manual calculation: ${rawAllowance} / ${divisor} = ${manualCalculation}`);
      
      // Use ethers.formatUnits like the working frontend code
      const allowanceAmount = parseFloat(ethers.formatUnits(allowance, tokenDecimals));
      console.log(`  - ethers.formatUnits result: ${ethers.formatUnits(allowance, tokenDecimals)}`);
      console.log(`  - Final parsed allowance (manual): ${allowanceAmount}`);
      
      // Calculate total tip amount (like + recast + reply)
      const likeAmount = parseFloat(authorConfig.likeAmount || '0');
      const recastAmount = parseFloat(authorConfig.recastAmount || '0');
      const replyAmount = parseFloat(authorConfig.replyAmount || '0');
      const minTipAmount = likeAmount + recastAmount + replyAmount;
      
      console.log(`💰 Blockchain allowance check: ${userAddress} - allowance: ${allowanceAmount}, total tip: ${minTipAmount} (like: ${likeAmount}, recast: ${recastAmount}, reply: ${replyAmount})`);
      
      return {
        canAfford: allowanceAmount >= minTipAmount,
        allowanceAmount: allowanceAmount,
        minTipAmount: minTipAmount
      };
    } catch (error) {
      console.error(`❌ Error checking blockchain allowance for ${userAddress}:`, error);
      return { canAfford: false, allowanceAmount: 0, minTipAmount: 0 };
    }
  }


  // NEW: Check both allowance and balance in one blockchain call
  async checkAllowanceAndBalance(userAddress, tokenAddress, requiredAmount) {
    try {
      console.log(`🔍 Checking allowance and balance for ${userAddress} - token: ${tokenAddress}, required: ${requiredAmount}`);
      
      const { ethers } = require('ethers');
      const provider = new ethers.JsonRpcProvider(process.env.BASE_RPC_URL);
      const ecionBatchAddress = process.env.ECION_BATCH_CONTRACT_ADDRESS || '0x2f47bcc17665663d1b63e8d882faa0a366907bb8';
      
      const tokenContract = new ethers.Contract(tokenAddress, [
        "function allowance(address owner, address spender) view returns (uint256)",
        "function balanceOf(address owner) view returns (uint256)"
      ], provider);
      
      // Get both allowance and balance in parallel
      const [allowance, balance] = await Promise.all([
        tokenContract.allowance(userAddress, ecionBatchAddress),
        tokenContract.balanceOf(userAddress)
      ]);
      
      const tokenDecimals = getTokenDecimals(tokenAddress);
      const allowanceAmount = parseFloat(ethers.formatUnits(allowance, tokenDecimals));
      const balanceAmount = parseFloat(ethers.formatUnits(balance, tokenDecimals));
      
      const hasSufficientAllowance = allowanceAmount >= requiredAmount;
      const hasSufficientBalance = balanceAmount >= requiredAmount;
      const canAfford = hasSufficientAllowance && hasSufficientBalance;
      
      console.log(`💰 Allowance & Balance check: ${userAddress}`);
      console.log(`  - Allowance: ${allowanceAmount} (required: ${requiredAmount}) - ${hasSufficientAllowance ? '✅' : '❌'}`);
      console.log(`  - Balance: ${balanceAmount} (required: ${requiredAmount}) - ${hasSufficientBalance ? '✅' : '❌'}`);
      console.log(`  - Can afford: ${canAfford ? '✅' : '❌'}`);
      
      return {
        canAfford,
        allowanceAmount,
        balanceAmount,
        requiredAmount,
        hasSufficientAllowance,
        hasSufficientBalance
      };
    } catch (error) {
      console.error(`❌ Error checking allowance and balance for ${userAddress}:`, error.message);
      return { 
        canAfford: false, 
        allowanceAmount: 0, 
        balanceAmount: 0, 
        requiredAmount,
        hasSufficientAllowance: false,
        hasSufficientBalance: false
      };
    }
  }

  // NEW: Clean up blocklist - remove users with sufficient allowance
  async cleanupBlocklist() {
    try {
      console.log(`🧹 Cleaning up blocklist - checking users with sufficient allowance...`);
      const usersToRemove = [];
      
      for (const userAddress of this.blockedUsers) {
        try {
          const userConfig = await database.getUserConfig(userAddress);
          if (!userConfig) continue;
          
          const allowanceCheck = await this.checkBlockchainAllowance(userAddress, userConfig);
          if (allowanceCheck.canAfford) {
            usersToRemove.push(userAddress);
            console.log(`✅ User ${userAddress} now has sufficient allowance: ${allowanceCheck.allowanceAmount} >= ${allowanceCheck.minTipAmount}`);
          }
        } catch (error) {
          console.log(`⚠️ Error checking allowance for ${userAddress}: ${error.message}`);
        }
      }
      
      // Remove users with sufficient allowance from blocklist
      for (const userAddress of usersToRemove) {
        this.blockedUsers.delete(userAddress.toLowerCase());
        console.log(`🗑️ Removed ${userAddress} from blocklist - sufficient allowance`);
      }
      
      if (usersToRemove.length > 0) {
        await this.saveBlocklistToDatabase();
        console.log(`✅ Blocklist cleanup complete - removed ${usersToRemove.length} users with sufficient allowance`);
      } else {
        console.log(`✅ Blocklist cleanup complete - no users to remove`);
      }
      
      return usersToRemove.length;
    } catch (error) {
      console.error(`❌ Error cleaning up blocklist:`, error);
      return 0;
    }
  }

  // NEW: Clean up inactive user (add to blocklist, update database, remove from webhook and homepage)
  async cleanupInactiveUser(userAddress) {
    try {
      console.log(`🧹 Cleaning up inactive user: ${userAddress}`);
      const userKey = userAddress.toLowerCase();
      
      // 1. Add user to blocklist (prevents all future tip processing)
      this.blockedUsers.add(userKey);
      console.log(`🚫 Added ${userAddress} to blocklist - insufficient allowance`);
      
      // Save blocklist to database
      this.saveBlocklistToDatabase();
      
      // 2. No database update needed - blocklist handles everything
      
      // 3. Remove from homepage cache (no Neynar call needed - blocklist handles webhook filtering)
      const { removeUserFromHomepageCache } = require('./index');
      if (removeUserFromHomepageCache) {
        try {
          await removeUserFromHomepageCache(userAddress);
          console.log(`🏠 Removed ${userAddress} from homepage cache - insufficient allowance`);
        } catch (error) {
          console.log(`⚠️ Error removing ${userAddress} from homepage cache: ${error.message} - continuing`);
        }
      }
      
      console.log(`✅ User ${userAddress} cleanup complete - blocklist prevents future webhook processing`);
      
      return true;
    } catch (error) {
      console.error('❌ Error cleaning up inactive user:', error);
      return false;
    }
  }

  // KEEP: Original blockchain allowance check (for other uses)
  async checkUserAllowance(userAddress, authorConfig) {
    try {
      const { ethers } = require('ethers');
      const ecionBatchAddress = process.env.ECION_BATCH_CONTRACT_ADDRESS || '0x2f47bcc17665663d1b63e8d882faa0a366907bb8';
      const tokenAddress = authorConfig.tokenAddress || '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
      
      // Get token decimals
      const tokenContract = new ethers.Contract(tokenAddress, [
        "function decimals() view returns (uint8)"
      ], this.provider);
      const decimals = await tokenContract.decimals();
      
      // Get allowance
      const allowanceContract = new ethers.Contract(tokenAddress, [
        "function allowance(address owner, address spender) view returns (uint256)"
      ], this.provider);
      const allowance = await allowanceContract.allowance(userAddress, ecionBatchAddress);
      const allowanceAmount = parseFloat(ethers.formatUnits(allowance, decimals));
      
      // Calculate total tip amount (like + recast + reply)
      const likeAmount = parseFloat(authorConfig.likeAmount || '0');
      const recastAmount = parseFloat(authorConfig.recastAmount || '0');
      const replyAmount = parseFloat(authorConfig.replyAmount || '0');
      const minTipAmount = likeAmount + recastAmount + replyAmount;
      
      return {
        canAfford: allowanceAmount >= minTipAmount,
        allowanceAmount,
        minTipAmount
      };
    } catch (error) {
      console.error('❌ Error checking allowance:', error);
      return { canAfford: false, allowanceAmount: 0, minTipAmount: 0 };
    }
  }

  async validateTip(interaction, authorConfig) {
    try {
      // Check if interactor has a verified address
      if (!interaction.interactorAddress) {
        return { valid: false, reason: 'Interactor has no verified address' };
      }

      // Check if author has active config
      if (!authorConfig || !authorConfig.isActive) {
        return { valid: false, reason: 'No active configuration' };
      }

      // Get user data for validation
      const userData = await this.getUserData(interaction.interactorFid);
      if (!userData) {
        return { valid: false, reason: 'Could not fetch user data' };
      }

      // Check follower count
      if (userData.followerCount < authorConfig.minFollowerCount) {
        return { valid: false, reason: 'Insufficient follower count' };
      }

      // Check Neynar score
      if (userData.neynarScore < authorConfig.minNeynarScore) {
        return { valid: false, reason: 'Insufficient Neynar score' };
      }

      // Check audience criteria (skip for follow events)
      if (interaction.interactionType !== 'follow') {
        const meetsAudience = await this.checkAudienceCriteria(interaction.authorFid, interaction.interactorFid, authorConfig.audience);
        if (!meetsAudience) {
          const audienceText = authorConfig.audience === 0 ? 'Following' : authorConfig.audience === 1 ? 'Followers' : 'Anyone';
          return { valid: false, reason: `Not in ${audienceText} list` };
        }
      }

      // Get tip amount
      const amount = this.getTipAmount(authorConfig, interaction.interactionType);
      if (amount <= 0) {
        return { valid: false, reason: 'No tip amount set' };
      }

      // Check if user has already been tipped for this cast and action type
      const hasBeenTipped = await database.hasUserBeenTippedForCast(
        interaction.authorAddress, 
        interaction.interactorAddress, 
        interaction.castHash, 
        interaction.interactionType
      );
      
      if (hasBeenTipped) {
        return { valid: false, reason: 'Already tipped for this cast' };
      }

      // Check spending limit
      if (authorConfig.totalSpent + amount > authorConfig.spendingLimit) {
        return { valid: false, reason: 'Spending limit reached' };
      }

      // Check user allowance
      const userAllowance = await this.getUserTokenAllowance(interaction.authorAddress, authorConfig.tokenAddress);
      if (userAllowance < amount) {
        return { valid: false, reason: 'Insufficient allowance' };
      }

      return { valid: true, amount: amount };

    } catch (error) {
      console.error('Tip validation error:', error);
      return { valid: false, reason: error.message };
    }
  }

  async processBatch() {
    if (this.isProcessing || this.pendingTips.length === 0) {
      console.log(`⏭️ Batch processing skipped: isProcessing=${this.isProcessing}, pendingTips=${this.pendingTips.length}`);
      return;
    }

    this.isProcessing = true;
    console.log(`🔄 Processing batch of ${this.pendingTips.length} tips in ONE transaction...`);
    console.log(`📋 Tips in batch:`, this.pendingTips.map(tip => ({
      from: tip.interaction.authorAddress,
      to: tip.interaction.interactorAddress,
      amount: tip.amount,
      type: tip.interaction.interactionType,
      timestamp: new Date(tip.timestamp).toISOString()
    })));

    try {
      // Store tips before processing for webhook status update
      const tipsToProcess = [...this.pendingTips];
      
      // Process ALL tips in ONE transaction (even with different tokens)
      const result = await this.executeBatchTransfer(tipsToProcess);
      
      // Clear processed tips
      this.pendingTips = [];
      
      console.log(`✅ Batch processing complete: ${result.processed} processed, ${result.failed} failed`);
      
      // Update webhook status for users who might have insufficient allowance now
      await this.updateWebhookStatusForProcessedTips(tipsToProcess);

    } catch (error) {
      console.error('❌ Batch processing error:', error);
    } finally {
      this.isProcessing = false;
    }
  }


  async executeBatchTransfer(tips) {
    let processed = 0;
    let failed = 0;

    try {
      console.log(`🎯 EXECUTING ${tips.length} TIPS USING ONLY ECIONBATCH CONTRACT: 0x2f47bcc17665663d1b63e8d882faa0a366907bb8`);
      
      // Prepare transfer data for EcionBatch - ALL tips in one batch
      const transfers = tips.map(tip => ({
        tokenAddress: tip.tokenAddress,
        from: tip.interaction.authorAddress,
        to: tip.interaction.interactorAddress,
        amount: tip.amount
      }));

      const tipData = this.ecionBatchManager.prepareTokenTips(transfers);
      const results = await this.ecionBatchManager.executeBatchTips(tipData);
      
      console.log(`✅ EcionBatch successful: ${results.successfulCount || results.results.length} tips processed`);
      if (results.failedCount > 0) {
        console.log(`❌ EcionBatch had ${results.failedCount} failed tips`);
      }
      
      // Update database for all successful tips
      for (const result of results.results) {
        if (result.success) {
          const tip = tips.find(t => t.interaction.interactorAddress === result.to);
          if (tip) {
            await this.updateUserSpending(tip.interaction.authorAddress, tip.amount);
            await database.addTipHistory({
              fromAddress: tip.interaction.authorAddress,
              toAddress: tip.interaction.interactorAddress,
              tokenAddress: tip.tokenAddress,
              amount: tip.amount.toString(),
              actionType: tip.interaction.interactionType,
              castHash: tip.interaction.castHash,
              transactionHash: results.hash
            });
            
            // Update lastActivity and allowance for the user
            const userConfig = await database.getUserConfig(tip.interaction.authorAddress);
            if (userConfig) {
              userConfig.lastActivity = Date.now();
              
              // Get current blockchain allowance and update database with it
              const { ethers } = require('ethers');
              const provider = new ethers.JsonRpcProvider(process.env.BASE_RPC_URL);
              const ecionBatchAddress = process.env.ECION_BATCH_CONTRACT_ADDRESS || '0x2f47bcc17665663d1b63e8d882faa0a366907bb8';
              
              const tokenContract = new ethers.Contract(tip.tokenAddress, [
                "function allowance(address owner, address spender) view returns (uint256)"
              ], provider);
              
              const allowance = await tokenContract.allowance(tip.interaction.authorAddress, ecionBatchAddress);
              const tokenDecimals = tip.tokenAddress === '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' ? 6 : 18;
              const currentBlockchainAllowance = parseFloat(ethers.formatUnits(allowance, tokenDecimals));
              
              userConfig.lastAllowance = currentBlockchainAllowance;
              userConfig.lastAllowanceCheck = Date.now();
              
              await database.setUserConfig(tip.interaction.authorAddress, userConfig);
              console.log(`💾 Updated allowance for ${tip.interaction.authorAddress}: ${userConfig.lastAllowance || 0} → ${currentBlockchainAllowance} (from blockchain)`);
              
              // Check if user should be removed from webhook
              const likeAmount = parseFloat(userConfig.likeAmount || '0');
              const recastAmount = parseFloat(userConfig.recastAmount || '0');
              const replyAmount = parseFloat(userConfig.replyAmount || '0');
              const minTipAmount = likeAmount + recastAmount + replyAmount;
              
              if (currentBlockchainAllowance < minTipAmount) {
                console.log(`🚫 User ${tip.interaction.authorAddress} allowance ${currentBlockchainAllowance} < min tip ${minTipAmount} - adding to blocklist`);
                
                // Add to blocklist to prevent future tip processing
                this.blockedUsers.add(tip.interaction.authorAddress.toLowerCase());
                console.log(`🚫 Added ${tip.interaction.authorAddress} to blocklist - insufficient allowance after tip`);
                console.log(`✅ Blocklist prevents future webhook processing - no Neynar call needed`);
              }
              
              // Send earned tip notification to recipient
              try {
                const { sendNeynarNotification, getUserFid } = require('./index');
                const recipientFid = await getUserFid(tip.interaction.interactorAddress);
                if (recipientFid) {
                  await sendNeynarNotification(
                    recipientFid,
                    "Earned from Ecion!",
                    `You earned ${tip.amount} USDC from a ${tip.interaction.interactionType}!`,
                    "https://ecion.vercel.app/logo.png"
                  );
                }
              } catch (notificationError) {
                console.log(`⚠️ Error sending earned notification: ${notificationError.message}`);
              }
            }
            processed++;
          }
        } else {
          failed++;
        }
      }

    } catch (error) {
      console.error('❌ EcionBatch transfer failed:', error);
      failed = tips.length; // All tips failed if EcionBatch fails
    }

    console.log(`✅ Batch processing complete: ${processed} processed, ${failed} failed`);
    return { processed, failed };
  }

  async executeIndividualTransfers(tokenAddress, tips) {
    const tokenContract = new ethers.Contract(tokenAddress, [
      "function transferFrom(address from, address to, uint256 amount) returns (bool)"
    ], this.wallet);

    let processed = 0;
    let failed = 0;

    try {
      console.log(`🔄 Executing ${tips.length} individual transfers for token ${tokenAddress}...`);
      
      // Group tips by author address to handle nonce management
      const tipsByAuthor = {};
      for (const tip of tips) {
        const authorAddress = tip.interaction.authorAddress.toLowerCase();
        if (!tipsByAuthor[authorAddress]) {
          tipsByAuthor[authorAddress] = [];
        }
        tipsByAuthor[authorAddress].push(tip);
      }
      
        // Process each author's tips sequentially
        for (const [authorAddress, authorTips] of Object.entries(tipsByAuthor)) {
          console.log(`👤 Processing ${authorTips.length} tips for author ${authorAddress}`);

          for (let i = 0; i < authorTips.length; i++) {
            const tip = authorTips[i];
            try {
              console.log(`📤 Transfer ${i + 1}/${authorTips.length}: ${tip.amount} tokens to ${tip.interaction.interactorAddress}`);
              
              // Add a small delay to ensure nonce is fresh
              if (i > 0) {
                await this.delay(2000);
              }
              
              // Get fresh nonce right before the transaction
              const finalNonce = await this.provider.getTransactionCount(authorAddress, 'pending');
              console.log(`🔢 Using nonce ${finalNonce} for author ${authorAddress}`);
            
            // Final check before transfer - both allowance and balance
            const finalCheck = await this.checkAllowanceAndBalance(tip.interaction.authorAddress, tip.tokenAddress, tip.amount);
            if (!finalCheck.canAfford) {
              let reason = 'Insufficient funds';
              if (!finalCheck.hasSufficientAllowance) {
                reason = 'Insufficient allowance';
              } else if (!finalCheck.hasSufficientBalance) {
                reason = 'Insufficient balance';
              }
              console.log(`❌ Transfer failed - user ${tip.interaction.authorAddress} - ${reason}`);
              failed++;
              continue;
            }
            
            // Debug logging for amount calculation
            console.log(`📊 Amount breakdown for tip ${i + 1}:`);
            console.log(`  - Author: ${tip.interaction.authorAddress}`);
            console.log(`  - Raw amount: ${tip.amount}`);
            console.log(`  - After parseUnits(6): ${ethers.parseUnits(tip.amount.toString(), 6)}`);
            console.log(`  - Final check: Allowance: ${finalCheck.allowanceAmount}, Balance: ${finalCheck.balanceAmount}`);
            
            // Get dynamic gas price for Base network
            const gasPrice = await this.provider.getGasPrice();
            const increasedGasPrice = gasPrice * 110n / 100n; // 10% higher for reliability
            
            const tx = await tokenContract.transferFrom(
              tip.interaction.authorAddress,
              tip.interaction.interactorAddress,
              ethers.parseUnits(tip.amount.toString(), 6),
              { 
                gasLimit: 200000, // Increased gas limit for Base
                gasPrice: increasedGasPrice,
                nonce: finalNonce
              }
            );
            
            console.log(`✅ Transfer ${i + 1} submitted: ${tx.hash}`);
            
            // Check if transaction was actually submitted
            if (!tx.hash) {
              throw new Error(`Transfer ${i + 1} failed: no transaction hash returned`);
            }
            
            // Wait for confirmation with polling approach
            console.log(`⏳ Waiting for confirmation of ${tx.hash}...`);
            let confirmed = false;
            let attempts = 0;
            const maxAttempts = 15; // 15 attempts = 15 seconds
            
            while (!confirmed && attempts < maxAttempts) {
              try {
                const receipt = await this.provider.getTransactionReceipt(tx.hash);
                if (receipt) {
                  if (receipt.status === 1) {
                    console.log(`✅ Transfer ${i + 1} confirmed: ${tx.hash} (Gas: ${receipt.gasUsed.toString()})`);
                    confirmed = true;
                  } else if (receipt.status === 0) {
                    throw new Error(`Transfer ${i + 1} failed: transaction reverted`);
                  }
                } else {
                  // Transaction not mined yet, wait 1 second
                  console.log(`⏳ Transaction ${tx.hash} not mined yet, attempt ${attempts + 1}/${maxAttempts}...`);
                  await this.delay(1000);
                  attempts++;
                }
              } catch (error) {
                console.error(`❌ Error checking receipt:`, error.message);
                throw new Error(`Transfer ${i + 1} failed: ${error.message}`);
              }
            }
            
            if (!confirmed) {
              throw new Error(`Transfer ${i + 1} failed: confirmation timeout after ${maxAttempts} seconds`);
            }
            
            // Update database
            await this.updateUserSpending(tip.interaction.authorAddress, tip.amount);
            await database.addTipHistory({
              fromAddress: tip.interaction.authorAddress,
              toAddress: tip.interaction.interactorAddress,
              tokenAddress: tip.tokenAddress,
              amount: tip.amount.toString(),
              actionType: tip.interaction.interactionType,
              castHash: tip.interaction.castHash,
              transactionHash: tx.hash,
              timestamp: Date.now()
            });
            
            processed++;
            
            // Small delay between transactions from same author to ensure proper sequencing
            if (i < authorTips.length - 1) {
              console.log(`⏳ Waiting 2 seconds before next transaction...`);
              await this.delay(2000); // 2 second delay
            }
            
          } catch (error) {
            console.error(`❌ Transfer ${i + 1} failed:`, error.message);
            failed++;
            
            // If it's a nonce error, wait a bit and retry
            if (error.code === 'NONCE_EXPIRED' || error.code === 'REPLACEMENT_UNDERPRICED') {
              console.log(`⏳ Nonce error, waiting 2 seconds before retry...`);
              await this.delay(2000);
            }
          }
        }
      }

    } catch (error) {
      console.error('❌ Individual transfers failed:', error);
      console.error('❌ Error details:', error.message);
      console.error('❌ Error code:', error.code);
      failed = tips.length;
    }

    return { processed, failed };
  }


  async getUserData(fid) {
    try {
      const response = await fetch(`https://api.neynar.com/v2/farcaster/user/bulk?fids=${fid}`, {
        headers: { 'x-api-key': process.env.NEYNAR_API_KEY }
      });
      
      if (!response.ok) {
        console.error(`Failed to fetch user data for FID ${fid}: ${response.status}`);
        return null;
      }
      
      const data = await response.json();
      const user = data.users[0];
      
      return {
        followerCount: user.follower_count || 0,
        neynarScore: user.score || 0
      };
    } catch (error) {
      console.error(`Error fetching user data for FID ${fid}:`, error);
      return null;
    }
  }

  async checkAudienceCriteria(authorFid, interactorFid, audience) {
    try {
      if (audience === 2) {
        return true; // Anyone
      }
      
      const response = await fetch(`https://api.neynar.com/v2/farcaster/user/bulk?fids=${interactorFid}&viewer_fid=${authorFid}`, {
        headers: { 'x-api-key': process.env.NEYNAR_API_KEY }
      });
      
      if (!response.ok) {
        console.error(`Failed to fetch user relationship for FID ${interactorFid}: ${response.status}`);
        return false;
      }
      
      const data = await response.json();
      const user = data.users[0];
      
      if (audience === 0) {
        return user.viewer_context?.following || false; // Following
      } else if (audience === 1) {
        return user.viewer_context?.followed_by || false; // Followers
      }
      
      return false;
    } catch (error) {
      console.error(`Error checking audience criteria:`, error);
      return false;
    }
  }

  getTipAmount(config, actionType) {
    switch (actionType) {
      case 'like': return parseFloat(config.likeAmount);
      case 'reply': return parseFloat(config.replyAmount);
      case 'recast': return parseFloat(config.recastAmount);
      case 'follow': return parseFloat(config.followAmount);
      default: return 0;
    }
  }

  async getUserTokenAllowance(userAddress, tokenAddress) {
    try {
      const tokenContract = new ethers.Contract(tokenAddress, [
        "function allowance(address owner, address spender) view returns (uint256)"
      ], this.provider);
      
      // Check allowance for ECION BATCH CONTRACT, not backend wallet!
      const ecionBatchAddress = process.env.ECION_BATCH_CONTRACT_ADDRESS || '0x2f47bcc17665663d1b63e8d882faa0a366907bb8';
      
      const allowance = await tokenContract.allowance(userAddress, ecionBatchAddress);
      const formattedAllowance = parseFloat(ethers.formatUnits(allowance, 6)); // USDC has 6 decimals
      
      console.log(`💰 Allowance check: User ${userAddress} has ${formattedAllowance} approved to contract ${ecionBatchAddress}`);
      
      return formattedAllowance;
    } catch (error) {
      console.error('Error fetching token allowance:', error);
      return 0;
    }
  }

  async updateUserSpending(userAddress, amount) {
    const config = await database.getUserConfig(userAddress);
    if (config) {
      config.totalSpent = (parseFloat(config.totalSpent) + parseFloat(amount)).toString();
      await database.setUserConfig(userAddress, config);
    }
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Get batch status for debugging
  getBatchStatus() {
    return {
      pendingTips: this.pendingTips.length,
      isProcessing: this.isProcessing,
      batchIntervalMs: this.batchIntervalMs,
      maxBatchSize: this.maxBatchSize,
      nextBatchIn: this.isProcessing ? 'Processing...' : `${Math.max(0, this.batchIntervalMs - (Date.now() % this.batchIntervalMs))}ms`
    };
  }

  // Force process current batch (for testing)
  async forceProcessBatch() {
    if (this.pendingTips.length > 0) {
      console.log('🚀 Force processing batch...');
      await this.processBatch();
    } else {
      console.log('📭 No pending tips to process');
    }
  }

  // Update webhook status for users after tip processing
  async updateWebhookStatusForProcessedTips(tips) {
    try {
      console.log('🔄 Updating webhook status for processed tips...');
      
      // Get unique user addresses from processed tips
      const uniqueUsers = [...new Set(tips.map(tip => tip.interaction.authorAddress))];
      
      let processedCount = 0;
      let errorCount = 0;
      
      for (const userAddress of uniqueUsers) {
        try {
          // Validate address format
          if (!userAddress || !userAddress.startsWith('0x') || userAddress.length !== 42) {
            console.log(`⚠️ Invalid address format in webhook update: ${userAddress} - skipping`);
            continue;
          }
          
          // Check if user still has sufficient allowance using blockchain (most accurate)
          const allowanceCheck = await this.checkBlockchainAllowance(userAddress, tips.find(t => t.interaction.authorAddress === userAddress).authorConfig);
          
          if (!allowanceCheck.canAfford) {
            console.log(`🔄 User ${userAddress} has insufficient database allowance after tip - cleaning up`);
            // Clean up webhook and homepage immediately
            await this.cleanupInactiveUser(userAddress);
          }
          processedCount++;
        } catch (error) {
          errorCount++;
          console.log(`⚠️ Error updating webhook status for user ${userAddress}: ${error.message} - continuing`);
        }
      }
      
      console.log(`✅ Webhook status update completed - processed: ${processedCount}, errors: ${errorCount}`);
    } catch (error) {
      console.log(`⚠️ Error in webhook status update: ${error.message} - continuing`);
    }
  }

  // NEW: Remove user from blocklist when allowance increases
  async removeFromBlocklist(userAddress) {
    const userKey = userAddress.toLowerCase();
    console.log(`🔄 Attempting to remove ${userAddress} from blocklist`);
    console.log(`🔍 Blocklist before removal:`, Array.from(this.blockedUsers));
    console.log(`🔍 Looking for key: ${userKey}`);
    
    if (this.blockedUsers.has(userKey)) {
      this.blockedUsers.delete(userKey);
      console.log(`✅ Removed ${userAddress} from blocklist - allowance sufficient`);
      console.log(`🔍 Blocklist after removal:`, Array.from(this.blockedUsers));
      
      // Save to database
      await this.saveBlocklistToDatabase();
      return true;
    } else {
      console.log(`⚠️ User ${userAddress} not found in blocklist`);
      return false;
    }
  }

  // NEW: Load blocklist from database on startup
  async loadBlocklistFromDatabase() {
    try {
      console.log(`🔄 Loading blocklist from database...`);
      
      // ALWAYS check current blockchain allowance and update database
      console.log(`ℹ️ Checking all users' current blockchain allowance...`);
      
      // Get all users and check their current blockchain allowance
      const allUsers = await database.getAllUsers();
      const newBlocklist = [];
      let loadedCount = 0;
      
      for (const userAddress of allUsers) {
        try {
          // Skip invalid addresses (double 0x, empty, etc.)
          if (!userAddress || userAddress === '0x' || userAddress.startsWith('0x0x') || userAddress.length < 42) {
            console.log(`⚠️ Skipping invalid address: ${userAddress}`);
            continue;
          }
          
          const userConfig = await database.getUserConfig(userAddress);
          if (!userConfig) continue;
          
          // Check current blockchain allowance
          const allowanceCheck = await this.checkBlockchainAllowance(userAddress, userConfig);
          if (!allowanceCheck.canAfford) {
            newBlocklist.push(userAddress.toLowerCase());
            loadedCount++;
            console.log(`🚫 User ${userAddress} has insufficient allowance: ${allowanceCheck.allowanceAmount} < ${allowanceCheck.minTipAmount}`);
          } else {
            console.log(`✅ User ${userAddress} has sufficient allowance: ${allowanceCheck.allowanceAmount} >= ${allowanceCheck.minTipAmount}`);
          }
        } catch (error) {
          console.log(`⚠️ Error checking allowance for ${userAddress}: ${error.message}`);
        }
      }
      
      // Update database with current blocklist
      await database.setBlocklist(newBlocklist);
      
      // Update memory to match database
      this.blockedUsers = new Set(newBlocklist);
      
      console.log(`✅ Blocklist updated in database and memory: ${loadedCount} users with insufficient allowance`);
    } catch (error) {
      console.error(`❌ Error loading blocklist from database:`, error);
    }
  }

  // NEW: Save blocklist to database (for persistence)
  async saveBlocklistToDatabase() {
    try {
      // Clean up blocklist - remove invalid addresses
      const validBlockedUsers = Array.from(this.blockedUsers).filter(address => {
        return address && address !== '0x' && !address.startsWith('0x0x') && address.length >= 42;
      });
      
      // Update the in-memory blocklist with cleaned addresses
      this.blockedUsers = new Set(validBlockedUsers);
      
      await database.setBlocklist(validBlockedUsers);
      console.log(`💾 Saved cleaned blocklist to database: ${validBlockedUsers.length} users`);
    } catch (error) {
      console.error(`❌ Error saving blocklist to database:`, error);
    }
  }

  // NEW: Check if user is blocked - Simple memory check
  isUserBlocked(userAddress) {
    const userKey = userAddress.toLowerCase();
    const isBlocked = this.blockedUsers.has(userKey);
    
    if (isBlocked) {
      console.log(`⏭️ Skipping webhook event - user ${userAddress} is in blocklist (insufficient allowance)`);
      console.log(`🔍 Blocklist contents:`, Array.from(this.blockedUsers));
    }
    
    return isBlocked;
  }
}

module.exports = new BatchTransferManager();
