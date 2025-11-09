const { ethers } = require('ethers');
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

class TipQueueManager {
  constructor() {
    this.provider = new ethers.JsonRpcProvider(process.env.BASE_RPC_URL);
    if (process.env.NODE_ENV === 'debug') {
      this.wallet = null;
    } else {
      this.wallet = new ethers.Wallet(process.env.BACKEND_WALLET_PRIVATE_KEY, this.provider);
    }
    
    // Per-user queues to ensure sequential processing
    this.userQueues = new Map();
    this.processingUsers = new Set();
    
    console.log(`🔄 Tip Queue Manager initialized`);
    if (this.wallet) {
      console.log(`💰 Backend wallet address: ${this.wallet.address}`);
    } else {
      console.log(`🔧 Debug mode: No wallet initialized`);
    }
  }

  async addTipToQueue(interaction, authorConfig) {
    const userKey = interaction.authorAddress.toLowerCase();
    
    // Initialize queue for user if it doesn't exist
    if (!this.userQueues.has(userKey)) {
      this.userQueues.set(userKey, []);
    }
    
    // Add tip to user's queue
    const queueItem = {
      interaction,
      authorConfig,
      timestamp: Date.now(),
      retryCount: 0,
      maxRetries: 3
    };
    
    this.userQueues.get(userKey).push(queueItem);
    console.log(`📝 Added tip to queue for ${userKey}. Queue length: ${this.userQueues.get(userKey).length}`);
    
    // Start processing if not already processing this user
    if (!this.processingUsers.has(userKey)) {
      this.processUserQueue(userKey);
    }
    
    return { success: true, queued: true };
  }

  async processUserQueue(userKey) {
    if (this.processingUsers.has(userKey)) {
      console.log(`⏳ Already processing queue for ${userKey}`);
      return;
    }
    
    this.processingUsers.add(userKey);
    console.log(`🔄 Starting to process queue for ${userKey}`);
    
    try {
      const queue = this.userQueues.get(userKey) || [];
      
      while (queue.length > 0) {
        const queueItem = queue.shift();
        console.log(`🔄 Processing tip from queue for ${userKey}. Remaining: ${queue.length}`);
        
        try {
          const result = await this.processTipWithRetry(queueItem);
          
          if (result.success) {
            console.log(`✅ Tip processed successfully for ${userKey}`);
          } else {
            console.log(`❌ Tip failed for ${userKey}: ${result.reason}`);
          }
        } catch (error) {
          console.error(`❌ Error processing tip for ${userKey}:`, error.message);
        }
        
        // Add small delay between tips to avoid nonce conflicts
        await this.delay(1000);
      }
      
    } finally {
      this.processingUsers.delete(userKey);
      console.log(`✅ Finished processing queue for ${userKey}`);
    }
  }

  async processTipWithRetry(queueItem) {
    const { interaction, authorConfig, retryCount, maxRetries } = queueItem;
    
    try {
      return await this.processTipInstantly(interaction, authorConfig);
    } catch (error) {
      console.error(`❌ Tip processing failed (attempt ${retryCount + 1}/${maxRetries + 1}):`, error.message);
      
      if (retryCount < maxRetries) {
        // Increment retry count and add back to queue
        queueItem.retryCount++;
        const userKey = interaction.authorAddress.toLowerCase();
        const queue = this.userQueues.get(userKey) || [];
        queue.unshift(queueItem); // Add back to front of queue
        
        // Wait before retry (exponential backoff)
        const delayMs = Math.pow(2, retryCount) * 1000;
        console.log(`⏳ Retrying in ${delayMs}ms...`);
        await this.delay(delayMs);
        
        return { success: false, reason: `Retrying (attempt ${retryCount + 1})` };
      } else {
        return { success: false, reason: `Max retries exceeded: ${error.message}` };
      }
    }
  }

  async processTipInstantly(interaction, authorConfig) {
    try {
      console.log(`⚡ Processing queued tip: ${interaction.interactionType} from ${interaction.interactorFid} to ${interaction.authorFid}`);

      // Check if interactor has a verified address (required for sending tips)
      if (!interaction.interactorAddress) {
        console.log(`❌ Interactor ${interaction.interactorFid} has no verified address - cannot send tip`);
        return { success: false, reason: 'Interactor has no verified address' };
      }

      // Use the already-validated config from webhook
      if (!authorConfig || !authorConfig.isActive) {
        console.log(`❌ No active config provided`);
        return { success: false, reason: 'No active configuration' };
      }

      // Get user data for validation
      const userData = await this.getUserData(interaction.interactorFid);
      if (!userData) {
        console.log(`❌ Could not fetch user data for FID ${interaction.interactorFid}`);
        return { success: false, reason: 'Could not fetch user data' };
      }

      // Check follower count
      if (userData.followerCount < authorConfig.minFollowerCount) {
        console.log(`❌ FOLLOWER CHECK FAILED: Interactor ${interaction.interactorFid} has ${userData.followerCount} followers (required: ${authorConfig.minFollowerCount})`);
        return { success: false, reason: 'Insufficient follower count' };
      }
      console.log(`✅ FOLLOWER CHECK PASSED: Interactor ${interaction.interactorFid} has ${userData.followerCount} followers (required: ${authorConfig.minFollowerCount})`);

      // Check Neynar score
      if (userData.neynarScore < authorConfig.minNeynarScore) {
        console.log(`❌ NEYNAR SCORE CHECK FAILED: Interactor ${interaction.interactorFid} has Neynar score ${userData.neynarScore} (required: ${authorConfig.minNeynarScore})`);
        return { success: false, reason: 'Insufficient Neynar score' };
      }
      console.log(`✅ NEYNAR SCORE CHECK PASSED: Interactor ${interaction.interactorFid} has Neynar score ${userData.neynarScore} (required: ${authorConfig.minNeynarScore})`);

      // Check audience criteria - SKIP for follow events
      if (interaction.interactionType !== 'follow') {
        const meetsAudience = await this.checkAudienceCriteria(interaction.authorFid, interaction.interactorFid, authorConfig.audience);
        if (!meetsAudience) {
          const audienceText = authorConfig.audience === 0 ? 'Following' : authorConfig.audience === 1 ? 'Followers' : 'Anyone';
          console.log(`❌ AUDIENCE CHECK FAILED: Interactor ${interaction.interactorFid} is not in caster's ${audienceText} list`);
          return { success: false, reason: `Not in ${audienceText} list` };
        }
        const audienceText = authorConfig.audience === 0 ? 'Following' : authorConfig.audience === 1 ? 'Followers' : 'Anyone';
        console.log(`✅ AUDIENCE CHECK PASSED: Interactor ${interaction.interactorFid} is in caster's ${audienceText} list`);
      } else {
        console.log(`✅ AUDIENCE CHECK SKIPPED: Follow events don't need audience check (they just started following!)`);
      }

      // Get tip amount
      const amount = this.getTipAmount(authorConfig, interaction.interactionType);
      console.log(`💰 Tip calculation: ${interaction.interactionType} = $${amount} (from config: like=${authorConfig.likeAmount}, recast=${authorConfig.recastAmount})`);
      if (amount <= 0) {
        console.log(`❌ No tip amount set for ${interaction.interactionType} - skipping tip`);
        return { success: false, reason: 'No tip amount set' };
      }

      // Check if user has already been tipped for this cast and action type
      const hasBeenTipped = await database.hasUserBeenTippedForCast(
        interaction.authorAddress, 
        interaction.interactorAddress, 
        interaction.castHash, 
        interaction.interactionType
      );
      
      if (hasBeenTipped) {
        console.log(`🚫 DUPLICATE TIP BLOCKED: ${interaction.interactorAddress} already received ${interaction.interactionType} tip for cast ${interaction.castHash}`);
        return { success: false, reason: 'Already tipped for this cast' };
      }

      // Check spending limit
      if (authorConfig.totalSpent + amount > authorConfig.spendingLimit) {
        console.log(`❌ Spending limit reached for ${interaction.authorAddress}`);
        return { success: false, reason: 'Spending limit reached' };
      }

      // Check user allowance
      const userAllowance = await this.getUserTokenAllowance(interaction.authorAddress, authorConfig.tokenAddress);
      if (userAllowance < amount) {
        console.log(`❌ User ${interaction.authorAddress} has insufficient allowance: ${userAllowance} < ${amount}`);
        return { success: false, reason: 'Insufficient allowance' };
      }

      // Execute the tip transfer with proper nonce management
      console.log(`💸 Executing queued transfer: ${amount} USDC from ${interaction.authorAddress} to ${interaction.interactorAddress}`);
      const tx = await this.executeTransferWithNonceManagement(
        authorConfig.tokenAddress,
        interaction.authorAddress,
        interaction.interactorAddress,
        amount
      );

      console.log(`⏳ Transaction submitted: ${tx.hash}`);
      const receipt = await tx.wait();
      console.log(`✅ Transaction confirmed: ${tx.hash} (Gas: ${receipt.gasUsed.toString()})`);

      // Update user spending
      await this.updateUserSpending(interaction.authorAddress, amount);

      // Add to tip history
      await database.addTipHistory({
        fromAddress: interaction.authorAddress,
        toAddress: interaction.interactorAddress,
        tokenAddress: authorConfig.tokenAddress,
        amount: amount.toString(),
        actionType: interaction.interactionType,
        castHash: interaction.castHash,
        transactionHash: tx.hash,
        timestamp: Date.now()
      });

      console.log(`🎉 QUEUED TIP SUCCESS: ${amount} USDC sent to ${interaction.interactorAddress} for ${interaction.interactionType}`);
      return { 
        success: true, 
        transactionHash: tx.hash,
        amount: amount
      };

    } catch (error) {
      console.error(`❌ Queued tip processing failed:`, error);
      throw error; // Re-throw to trigger retry logic
    }
  }

  async executeTransferWithNonceManagement(tokenAddress, fromAddress, toAddress, amount) {
    const tokenContract = new ethers.Contract(tokenAddress, [
      "function transferFrom(address from, address to, uint256 amount) returns (bool)"
    ], this.wallet);

    // Get the current nonce for the wallet
    const nonce = await this.provider.getTransactionCount(this.wallet.address, 'pending');
    
    // Create transaction with explicit nonce and higher gas price
    const gasPrice = await this.provider.getGasPrice();
    const increasedGasPrice = gasPrice * 120n / 100n; // 20% higher gas price
    
    return await tokenContract.transferFrom(
      fromAddress,
      toAddress,
      ethers.parseUnits(amount.toString(), 6), // USDC has 6 decimals
      {
        nonce: nonce,
        gasPrice: increasedGasPrice,
        gasLimit: 100000 // Set explicit gas limit
      }
    );
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
      case 'quote': return parseFloat(config.quoteAmount);
      case 'follow': return parseFloat(config.followAmount);
      default: return 0;
    }
  }

  async getUserTokenAllowance(userAddress, tokenAddress) {
    try {
      const tokenContract = new ethers.Contract(tokenAddress, [
        "function allowance(address owner, address spender) view returns (uint256)"
      ], this.provider);
      
      const allowance = await tokenContract.allowance(userAddress, this.wallet.address);
      return parseFloat(ethers.formatUnits(allowance, 6)); // USDC has 6 decimals
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

  // Get queue status for debugging
  getQueueStatus() {
    const status = {};
    for (const [userKey, queue] of this.userQueues.entries()) {
      status[userKey] = {
        queueLength: queue.length,
        isProcessing: this.processingUsers.has(userKey),
        nextTip: queue[0] ? {
          interactionType: queue[0].interaction.interactionType,
          timestamp: queue[0].timestamp,
          retryCount: queue[0].retryCount
        } : null
      };
    }
    return status;
  }
}

module.exports = new TipQueueManager();
