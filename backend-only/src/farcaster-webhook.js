// Simple Farcaster notification webhook handler (without external dependencies)
const express = require('express');

async function handleFarcasterWebhook(req, res, database) {
  try {
    console.log('🔔 Farcaster notification webhook received');
    console.log('📋 Webhook body:', JSON.stringify(req.body, null, 2));
    
    // For now, accept simple JSON format for testing
    const { event, notificationDetails, fid } = req.body;
    
    if (!fid) {
      console.log('⚠️ No FID provided in webhook');
      return res.status(200).json({ success: true, message: 'No FID provided' });
    }
    
    // Get user address from FID using existing function
    const userAddress = await getUserAddressFromFid(fid);
    if (!userAddress) {
      console.log(`⚠️ Could not find user address for FID ${fid}`);
      return res.status(200).json({ success: true, message: 'FID not found' });
    }
    
    console.log(`✅ Found user address ${userAddress} for FID ${fid}`);
    
    switch (event) {
      case 'miniapp_added':
        console.log(`✅ Mini app added by user ${userAddress} (FID: ${fid})`);
        
        // If notification details are provided, save the token
        if (notificationDetails) {
          const { token, url } = notificationDetails;
          await database.saveNotificationToken(userAddress, fid, token, url);
          console.log(`💾 Saved notification token for ${userAddress}`);
        }
        break;
        
      case 'miniapp_removed':
        console.log(`❌ Mini app removed by user ${userAddress} (FID: ${fid})`);
        await database.deactivateNotificationToken(userAddress, fid);
        break;
        
      case 'notifications_enabled':
        console.log(`🔔 Notifications enabled by user ${userAddress} (FID: ${fid})`);
        
        if (notificationDetails) {
          const { token, url } = notificationDetails;
          await database.saveNotificationToken(userAddress, fid, token, url);
          console.log(`💾 Saved notification token for ${userAddress}`);
        }
        break;
        
      case 'notifications_disabled':
        console.log(`🚫 Notifications disabled by user ${userAddress} (FID: ${fid})`);
        await database.deactivateNotificationToken(userAddress, fid);
        break;
        
      default:
        console.log(`⚠️ Unknown event type: ${event}`);
    }
    
    res.status(200).json({ success: true, message: 'Event processed' });
    
  } catch (error) {
    console.error('❌ Error processing Farcaster webhook:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// Helper function to get user address from FID (reuse existing function)
async function getUserAddressFromFid(fid) {
  try {
    console.log(`🔍 Looking up address for FID: ${fid}`);
    
    const response = await fetch(`https://api.neynar.com/v2/farcaster/user/bulk?fids=${fid}`, {
      headers: {
        'x-api-key': process.env.NEYNAR_API_KEY
      }
    });
    
    console.log(`📡 Neynar API response status: ${response.status}`);
    
    if (response.ok) {
      const data = await response.json();
      console.log(`📋 Neynar API response:`, JSON.stringify(data, null, 2));
      
      const user = data.users?.[0];
      if (user) {
        const address = user.verified_addresses?.eth_addresses?.[0] || null;
        console.log(`✅ Found address for FID ${fid}: ${address}`);
        return address;
      } else {
        console.log(`❌ No user found for FID ${fid}`);
      }
    } else {
      const errorText = await response.text();
      console.error(`❌ Neynar API error: ${response.status} - ${errorText}`);
    }
  } catch (error) {
    console.error('❌ Error fetching user address from FID:', error);
  }
  
  return null;
}

module.exports = handleFarcasterWebhook;