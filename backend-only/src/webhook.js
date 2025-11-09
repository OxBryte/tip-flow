const crypto = require('crypto');
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
const { getUserByFid, getCastByHash } = require('./neynar');
const instantTipProcessor = require('./instantTipProcessor');
const tipQueueManager = require('./tipQueueManager');
const batchTransferManager = require('./batchTransferManager');
// Using webhook filtering based on allowance and balance checks
const BASE_USDC_ADDRESS = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';

// Verify webhook signature from Neynar
function verifyWebhookSignature(req) {
  // Check all possible header variations
  const signature = req.headers['x-neynar-signature'] || 
                   req.headers['X-Neynar-Signature'] ||
                   req.headers['x-neynar-signature'] ||
                   req.headers['X-NEYNAR-SIGNATURE'];
  
  const webhookSecret = process.env.WEBHOOK_SECRET;
  
  // Reduced logging for rate limit
  // console.log('🔐 Signature verification:', { hasSignature: !!signature, hasSecret: !!webhookSecret });
  
  if (!signature || !webhookSecret) {
    console.log('❌ Missing signature or secret');
    return false;
  }
  
  // Use raw body for signature verification (as per Neynar docs)
  const rawBody = req.rawBody ? req.rawBody.toString() : 
                  (Buffer.isBuffer(req.body) ? req.body.toString() : JSON.stringify(req.body));
  
  const hmac = crypto.createHmac('sha512', webhookSecret);
  hmac.update(rawBody);
  const expectedSignature = hmac.digest('hex');
  
  const isValid = signature === expectedSignature;
  
  if (!isValid) {
    console.log('❌ Invalid webhook signature');
  }
  
  return isValid;
}

// Parse Neynar webhook event
async function parseWebhookEvent(event) {
  let interactionType = null;
  let authorFid = null;
  let interactorFid = null;
  let castHash = '';
  
  switch (event.type) {
    case 'reaction.created':
      // reaction_type: 1 = like, 2 = recast
      if (event.data.reaction_type === 1) {
        interactionType = 'like';
      } else if (event.data.reaction_type === 2) {
        interactionType = 'recast';
      }
      
      // Check if the cast being liked/recasted is an original cast (not a reply)
      const cast = event.data.cast;
      if (cast?.parent_hash) {
        console.log('❌ Skipping reaction to reply cast - only original casts get tips for reactions');
        return null;
      }
      
      authorFid = cast?.author?.fid;
      interactorFid = event.data.user?.fid;
      castHash = cast?.hash || '';
      
      console.log(`✅ Reaction to original cast: ${interactionType} by FID ${interactorFid} on cast by FID ${authorFid}`);
      break;
      
    case 'cast.created':
      console.log(`🔍 Processing cast.created event:`, {
        hash: event.data.hash,
        authorFid: event.data.author?.fid,
        parentHash: event.data.parent_hash,
        hasEmbeds: !!event.data.embeds?.length,
        embedTypes: event.data.embeds?.map(e => Object.keys(e))
      });
      
      // event.data is the full Cast object
      // Check if it's a reply to another cast
      if (event.data.parent_hash) {
        interactionType = 'reply';
        console.log(`🔍 Processing reply to parent cast: ${event.data.parent_hash}`);
        const parentCast = await getCastByHash(event.data.parent_hash);
        if (parentCast) {
          // For replies: the person being replied to (parent author) pays the tip
          // The person doing the replying gets the tip
          authorFid = parentCast.author.fid;  // Person being replied to (pays tip)
          interactorFid = event.data.author?.fid;  // Person doing the replying (gets tip)
          castHash = parentCast.hash;
          console.log(`✅ Reply parsed: ${interactionType} by FID ${interactorFid} to cast by FID ${authorFid}`);
        } else {
          console.log(`❌ Could not fetch parent cast: ${event.data.parent_hash}`);
        }
      } else {
        console.log(`ℹ️ Cast is not a reply - skipping tip processing`);
      }
      break;
      
    case 'follow.created':
      interactionType = 'follow';
      authorFid = event.data.target_user?.fid; // Fixed: target_user, not targetUser
      interactorFid = event.data.user?.fid; // Fixed: user, not author
      castHash = null; // Follows don't have cast hashes
      break;
  }
  
  if (!interactionType || !authorFid || !interactorFid) {
    console.log(`❌ Missing interaction data:`, {
      interactionType,
      authorFid,
      interactorFid,
      castHash
    });
    return null;
  }
  
  // Get user data to get Ethereum addresses
  const authorUser = await getUserByFid(authorFid);
  const interactorUser = await getUserByFid(interactorFid);
  
  // Get primary address (the address set as primary in Farcaster)
  const authorAddress = authorUser?.verified_addresses?.primary?.eth_address || 
                       authorUser?.verified_addresses?.eth_addresses?.[0];
  const interactorAddress = interactorUser?.verified_addresses?.primary?.eth_address || 
                           interactorUser?.verified_addresses?.eth_addresses?.[0];
  
  if (!authorAddress || !interactorAddress) {
    console.log('❌ No verified addresses found');
    return null;
  }
  
  return {
    interactionType,
    authorFid,
    interactorFid,
    authorAddress: authorAddress.toLowerCase(),
    interactorAddress: interactorAddress.toLowerCase(),
    castHash,
    timestamp: Date.now()
  };
}

// Main webhook handler
async function webhookHandler(req, res) {
  try {
    // Parse the raw body to JSON for processing
    let eventData;
    if (Buffer.isBuffer(req.body)) {
      eventData = JSON.parse(req.body.toString());
    } else if (typeof req.body === 'string') {
      eventData = JSON.parse(req.body);
    } else {
      eventData = req.body;
    }
    
    // Verify webhook signature
    const isValidSignature = verifyWebhookSignature(req);
    if (!isValidSignature) {
      console.log('❌ Webhook signature verification failed');
      return res.status(401).json({ error: 'Invalid signature' });
    }
    
    console.log('✅ Webhook:', eventData.type);
    
    // Handle cast.created events to track user's latest casts AND quote casts
    if (eventData.type === 'cast.created') {
      const castData = eventData.data;
      const authorFid = castData.author?.fid;
      const castHash = castData.hash;
      
      if (authorFid && castHash) {
        // Check if this is a main cast (not a reply)
        const isMainCast = !castData.parent_hash && (!castData.parent_author || !castData.parent_author.fid || castData.parent_author.fid === null);
        
        if (isMainCast) {
          // Check if this user has active tipping config
          const trackedFids = await database.getTrackedFids();
          if (trackedFids.includes(authorFid)) {
            console.log(`📝 Tracked user FID ${authorFid} posted new main cast: ${castHash}`);
            // Update this as their latest earnable cast
            await database.addUserCast(authorFid, castHash, true);
          }
        }
      }
    }
    
    // Parse the event
    const interaction = await parseWebhookEvent(eventData);
    
    if (!interaction) {
      return res.status(200).json({ 
        success: true, 
        processed: false,
        reason: 'Not a tippable interaction or missing data'
      });
    }
    
    // Check if author has tipping config
    console.log(`🔍 Checking config for author ${interaction.authorAddress} (FID: ${interaction.authorFid})...`);
    const authorConfig = await database.getUserConfig(interaction.authorAddress);
    
    if (!authorConfig) {
      console.log(`❌ Author ${interaction.authorAddress} has no tipping config`);
      return res.status(200).json({
        success: true,
        processed: false,
        reason: 'Author has no tipping config - please configure settings first'
      });
    }
    
    console.log(`✅ Author has config: ${JSON.stringify({
      likeEnabled: authorConfig.likeEnabled,
      recastEnabled: authorConfig.recastEnabled,
      replyEnabled: authorConfig.replyEnabled,
      isActive: authorConfig.isActive
    })}`);
    
    // If user is in webhook (follow.created), they're active - allow tips even if isActive is not explicitly set
    // For new users who just approved but haven't saved config yet, they won't have config, so this check will fail above
    // But if they have config, we should allow tips if they're in webhook (active users)
    console.log(`🔍 Checking if FID ${interaction.authorFid} is in webhook follow.created...`);
    const trackedFids = await database.getTrackedFids();
    const authorFid = interaction.authorFid;
    let isInWebhook = trackedFids.includes(authorFid);
    console.log(`📋 Tracked FIDs count: ${trackedFids.length}, Author FID ${authorFid} in webhook: ${isInWebhook}`);
    
    // If user has config but not in webhook, check allowance/balance BEFORE adding
    // This prevents adding users who don't have sufficient funds (which causes remove/add loop)
    if (!isInWebhook && authorConfig) {
      console.log(`⚠️ Author ${interaction.authorAddress} (FID: ${authorFid}) has config but not in webhook - checking allowance/balance before adding`);
      
      // Check if user has sufficient allowance and balance before adding to webhook
      const { ethers } = require('ethers');
      const { getProvider } = require('./rpcProvider');
      const provider = await getProvider();
      const ecionBatchAddress = process.env.ECION_BATCH_CONTRACT_ADDRESS || '0x2f47bcc17665663d1b63e8d882faa0a366907bb8';
      const tokenAddress = authorConfig.tokenAddress || BASE_USDC_ADDRESS;
      
      try {
        const tokenContract = new ethers.Contract(tokenAddress, [
          "function allowance(address owner, address spender) view returns (uint256)",
          "function balanceOf(address owner) view returns (uint256)"
        ], provider);
        
        const [allowance, balance] = await Promise.all([
          tokenContract.allowance(interaction.authorAddress, ecionBatchAddress),
          tokenContract.balanceOf(interaction.authorAddress)
        ]);
        
        const tokenLower = (tokenAddress || '').toLowerCase();
        const tokenDecimals = tokenLower === BASE_USDC_ADDRESS ? 6 : 18;
        const allowanceAmount = parseFloat(ethers.formatUnits(allowance, tokenDecimals));
        const balanceAmount = parseFloat(ethers.formatUnits(balance, tokenDecimals));
        
        const likeAmount = parseFloat(authorConfig.likeAmount || '0');
        const recastAmount = parseFloat(authorConfig.recastAmount || '0');
        const replyAmount = parseFloat(authorConfig.replyAmount || '0');
        const minTipAmount = likeAmount + recastAmount + replyAmount;
        
        const hasSufficientAllowance = allowanceAmount >= minTipAmount;
        const hasSufficientBalance = balanceAmount >= minTipAmount;
        
        console.log(`💰 Allowance check for ${interaction.authorAddress}: allowance=${allowanceAmount}, balance=${balanceAmount}, minTip=${minTipAmount}`);
        
        // Only add to webhook if user has BOTH sufficient allowance AND balance
        if (hasSufficientAllowance && hasSufficientBalance) {
          console.log(`✅ User has sufficient funds - adding FID ${authorFid} to webhook`);
          const { addFidToWebhook } = require('./index');
          const added = await addFidToWebhook(authorFid);
          console.log(`🔗 addFidToWebhook result for FID ${authorFid}: ${added}`);
          if (added) {
            isInWebhook = true;
            console.log(`✅ Added FID ${authorFid} to webhook during webhook processing`);
          } else {
            console.log(`❌ Failed to add FID ${authorFid} to webhook - addFidToWebhook returned false`);
          }
        } else {
          console.log(`❌ User ${interaction.authorAddress} has insufficient funds (allowance: ${allowanceAmount}, balance: ${balanceAmount}, required: ${minTipAmount}) - NOT adding to webhook to prevent loop`);
          // Don't add to webhook - user needs to top up allowance/balance first
        }
      } catch (error) {
        console.log(`❌ Error checking allowance/balance for ${interaction.authorAddress}: ${error.message}`);
        // On error, don't add to webhook to prevent issues
      }
    }
    
    if (!isInWebhook) {
      console.log(`❌ Author ${interaction.authorAddress} (FID: ${authorFid}) is not in webhook follow.created (not an active user)`);
      console.log(`📋 Current tracked FIDs: ${trackedFids.slice(0, 20).join(', ')}${trackedFids.length > 20 ? '...' : ''}`);
      return res.status(200).json({
        success: true,
        processed: false,
        reason: 'Author is not an active user (not in webhook)'
      });
    }
    
    console.log(`✅ Author FID ${authorFid} is in webhook - continuing tip processing`);
    
    // If user has config but isActive is false, set it to true (they're in webhook, so they should be active)
    if (!authorConfig.isActive) {
      console.log(`⚠️ Author ${interaction.authorAddress} has config but isActive=false - setting to true (user is in webhook)`);
      authorConfig.isActive = true;
      await database.setUserConfig(interaction.authorAddress, authorConfig);
      console.log(`✅ Set isActive=true for ${interaction.authorAddress}`);
    }
    
    // Check if action type is enabled
    console.log(`🔍 Checking if ${interaction.interactionType} is enabled for author...`);
    const isEnabled = getActionEnabled(authorConfig, interaction.interactionType);
    console.log(`📊 Action ${interaction.interactionType} enabled: ${isEnabled}`);
    if (!isEnabled) {
      console.log(`❌ ${interaction.interactionType} is not enabled for author ${interaction.authorAddress}`);
      return res.status(200).json({
        success: true,
        processed: false,
        reason: `${interaction.interactionType} not enabled`
      });
    }
    
    // Check if cast is eligible for tips (only latest main cast)
    // Special handling for follow casts - they are always eligible (one-time events)
    if (interaction.castHash) {
      if (interaction.castHash.startsWith("follow_")) {
        console.log(`✅ Follow cast ${interaction.castHash} is always eligible for tips`);
      } else {
        // Check if this cast is one of the latest casts we're tracking
        // For reactions: check if cast hash is in latest_cast_hash OR in webhook target_cast_hashes
        const isLatestCast = await database.pool.query(`
          SELECT fid, user_address, is_tracking FROM user_profiles 
          WHERE latest_cast_hash = $1
        `, [interaction.castHash]);
        
        if (isLatestCast.rows.length === 0) {
          console.log(`🚫 Cast ${interaction.castHash} not eligible for tips (not found in latest_cast_hash)`);
          console.log(`🔍 Checking webhook target_cast_hashes as fallback...`);
          
          // Fallback: Check if this cast is in webhook target_cast_hashes (for reactions)
          // This handles cases where cast was added to webhook but not yet in database
          const trackedFids = await database.getTrackedFids();
          if (trackedFids.includes(interaction.authorFid)) {
            console.log(`✅ Author FID ${interaction.authorFid} is in webhook - allowing tip (cast will be tracked)`);
            // Allow the tip - the cast will be tracked when user's latest cast is updated
          } else {
            console.log(`🚫 Cast ${interaction.castHash} not eligible - author not in webhook`);
            return res.status(200).json({
              success: true,
              processed: false,
              reason: "Cast not eligible for tips (not a latest tracked cast and author not in webhook)"
            });
          }
        } else {
          const castRow = isLatestCast.rows[0];
          if (!castRow.is_tracking) {
            console.log(`⚠️ Cast ${interaction.castHash} found but is_tracking=false - setting to true`);
            await database.pool.query(`
              UPDATE user_profiles SET is_tracking = true WHERE fid = $1
            `, [castRow.fid]);
          }
          console.log(`✅ Cast ${interaction.castHash} is eligible for tips (latest tracked cast for FID ${castRow.fid})`);
        }
      }
    }
    
    // For replies, also check if the parent cast is a latest tracked cast
    if (interaction.interactionType === 'reply' && interaction.parentHash) {
      const isParentLatestCast = await database.pool.query(`
        SELECT 1 FROM user_profiles 
        WHERE latest_cast_hash = $1 AND is_tracking = true
      `, [interaction.parentHash]);
      
      if (isParentLatestCast.rows.length === 0) {
        console.log(`🚫 Reply to cast ${interaction.parentHash} not eligible for tips (parent not a latest tracked cast)`);
        return res.status(200).json({
          success: true,
          processed: false,
          reason: "Reply not eligible for tips (parent cast not a latest tracked cast)"
        });
      }
      
      console.log(`✅ Reply to cast ${interaction.parentHash} is eligible for tips (parent is latest tracked cast)`);
    }
    
    // Check if interactor has verified address before processing
    if (!interaction.interactorAddress) {
      console.log(`⚠️ Cannot process tip: Interactor ${interaction.interactorFid} has no verified address`);
      return res.status(200).json({
        success: true,
        processed: false,
        instant: true,
        reason: 'Interactor has no verified address'
      });
    }

    // Check for duplicate tips based on interaction type
    // Check for duplicate tips based on interaction type
    if (interaction.interactionType === 'follow') {
      // For follows, check if we've already tipped this follower
      const hasBeenTippedForFollow = await database.hasUserBeenTippedForFollow(
        interaction.authorFid, 
        interaction.interactorFid
      );
      
      if (hasBeenTippedForFollow) {
        console.log(`⏭️ Skipping follow tip - already tipped follower ${interaction.interactorFid}`);
        return res.status(200).json({
          success: true,
          processed: false,
          instant: true,
          interactionType: interaction.interactionType,
          reason: 'Already tipped this follower'
        });
      }
    } else if (interaction.castHash) {
      // For other interactions, check cast-based duplicates
      const hasBeenTipped = await database.hasUserBeenTippedForCast(
        interaction.authorAddress, 
        interaction.interactorAddress, 
        interaction.castHash, 
        interaction.interactionType
      );
      
      if (hasBeenTipped) {
        console.log(`⏭️ Skipping tip - user ${interaction.interactorAddress} already tipped for ${interaction.interactionType} on cast ${interaction.castHash}`);
        return res.status(200).json({
          success: true,
          processed: false,
          instant: true,
          interactionType: interaction.interactionType,
          reason: `Already tipped for ${interaction.interactionType} on this cast`
        });
      }
    }

    // Check spam label requirement (Level 2 check)
    if (interaction.interactorFid) {
      const { meetsSpamLabelRequirement } = require('./spamLabelChecker');
      const minSpamLabel = authorConfig.minSpamLabel !== undefined ? authorConfig.minSpamLabel : null;
      
      // If user has set a spam label requirement, check it
      if (minSpamLabel !== null && minSpamLabel > 0) {
        const meetsRequirement = await meetsSpamLabelRequirement(interaction.interactorFid, minSpamLabel);
        
        if (!meetsRequirement) {
          console.log(`⏭️ Skipping tip - interactor FID ${interaction.interactorFid} does not meet spam label requirement (min: ${minSpamLabel})`);
          return res.status(200).json({
            success: true,
            processed: false,
            instant: true,
            interactionType: interaction.interactionType,
            reason: `Interactor does not meet spam label requirement (minimum Level ${minSpamLabel})`
          });
        }
        
        console.log(`✅ Interactor FID ${interaction.interactorFid} meets spam label requirement (min: ${minSpamLabel})`);
      }
    }

    // Webhook filtering handles allowance/balance checks automatically

    // Process tip through batch system (like Noice - 1 minute batches for gas efficiency)
    console.log(`🚀 Adding tip to batch: ${interaction.interactionType} | ${interaction.interactorFid}→${interaction.authorFid}`);
    console.log(`📊 Interaction details:`, {
      type: interaction.interactionType,
      authorFid: interaction.authorFid,
      interactorFid: interaction.interactorFid,
      castHash: interaction.castHash,
      authorAddress: interaction.authorAddress,
      interactorAddress: interaction.interactorAddress
    });
    
    const result = await batchTransferManager.addTipToBatch(interaction, authorConfig);
    
    console.log(`📊 Batch result:`, result);
    
    if (result.success) {
      console.log(`✅ BATCHED: ${interaction.interactionType} | ${interaction.interactorFid}→${interaction.authorFid} | Queue: ${result.batchSize}`);
      res.status(200).json({
        success: true,
        processed: true,
        batched: true,
        interactionType: interaction.interactionType,
        batchSize: result.batchSize,
        message: 'Tip added to batch for gas-efficient processing'
      });
    } else {
      console.log(`❌ REJECTED: ${interaction.interactionType} | Reason: ${result.reason}`);
      res.status(200).json({
        success: true,
        processed: false,
        batched: false,
        interactionType: interaction.interactionType,
        reason: result.reason
      });
    }
    
  } catch (error) {
    console.error('❌ Webhook processing error:', error);
    res.status(500).json({
      error: 'Failed to process webhook',
      details: error.message
    });
  }
}

function getActionEnabled(config, actionType) {
  // Handle boolean strings from database (PostgreSQL JSONB might store as strings)
  let enabled = false;
  switch (actionType) {
    case 'like': 
      enabled = config.likeEnabled === true || config.likeEnabled === 'true' || config.likeEnabled === 1;
      break;
    case 'reply': 
      enabled = config.replyEnabled === true || config.replyEnabled === 'true' || config.replyEnabled === 1;
      break;
    case 'recast': 
      enabled = config.recastEnabled === true || config.recastEnabled === 'true' || config.recastEnabled === 1;
      break;
    case 'follow': 
      enabled = config.followEnabled === true || config.followEnabled === 'true' || config.followEnabled === 1;
      break;
    default: 
      enabled = false;
  }
  console.log(`🔍 getActionEnabled(${actionType}): raw=${config[actionType + 'Enabled']}, parsed=${enabled}`);
  return enabled;
}

module.exports = webhookHandler;