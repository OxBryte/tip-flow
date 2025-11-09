#!/usr/bin/env node
/**
 * EMERGENCY SCRIPT: Restore 23 deleted users
 * Run this with: node restore-users.js
 */

require('dotenv').config();
const { Pool } = require('pg');

const deletedFids = [
  249432, 15086, 250869, 564447, 1052964, 200375, 849116, 1161826,
  520364, 1351395, 1007471, 1104000, 507756, 243108, 306502, 963470,
  230238, 472963, 240486, 441699, 476026, 242597, 4163
];

async function restoreUsers() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  });

  try {
    console.log(`🚨 RESTORING ${deletedFids.length} DELETED USERS...`);
    
    // Step 1: Set is_tracking=true for all these users
    const updateResult = await pool.query(`
      UPDATE user_profiles 
      SET is_tracking = true, updated_at = NOW()
      WHERE fid = ANY($1)
      RETURNING fid, user_address, username, display_name
    `, [deletedFids]);
    
    console.log(`\n✅ Restored ${updateResult.rows.length} users in database:`);
    updateResult.rows.forEach(user => {
      console.log(`   - FID ${user.fid}: ${user.username || 'N/A'} (${user.display_name || 'N/A'})`);
    });
    
    // Step 2: Get webhook ID
    const webhookResult = await pool.query(`
      SELECT webhook_id FROM webhook_config ORDER BY updated_at DESC LIMIT 1
    `);
    
    if (webhookResult.rows.length === 0) {
      throw new Error('No webhook ID found in database');
    }
    
    const webhookId = webhookResult.rows[0].webhook_id;
    console.log(`\n🔍 Webhook ID: ${webhookId}`);
    
    // Step 3: Get current tracked FIDs
    const fidsResult = await pool.query(`
      SELECT tracked_fids FROM webhook_config ORDER BY updated_at DESC LIMIT 1
    `);
    
    const currentFids = fidsResult.rows[0]?.tracked_fids || [];
    const allFids = [...new Set([...currentFids, ...deletedFids])];
    
    console.log(`\n📊 Current FIDs in webhook: ${currentFids.length}`);
    console.log(`📊 Total FIDs after restore: ${allFids.length}`);
    
    // Step 4: Get latest cast hashes
    const castsResult = await pool.query(`
      SELECT latest_cast_hash 
      FROM user_profiles 
      WHERE latest_cast_hash IS NOT NULL 
      AND is_tracking = true
    `);
    
    const latestCasts = castsResult.rows.map(row => row.latest_cast_hash);
    console.log(`\n📋 Latest cast hashes: ${latestCasts.length}`);
    
    // Step 5: Update Neynar webhook
    console.log(`\n🔧 Updating Neynar webhook...`);
    
    const webhookResponse = await fetch(`https://api.neynar.com/v2/farcaster/webhook/`, {
      method: 'PUT',
      headers: {
        'x-api-key': process.env.NEYNAR_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        webhook_id: webhookId,
        name: "Ecion Farcaster Events Webhook",
        url: "https://tippit-production.up.railway.app/webhook/neynar",
        subscription: {
          "reaction.created": { 
            target_cast_hashes: latestCasts
          },
          "cast.created": { 
            parent_hashes: latestCasts
          },
          "follow.created": { 
            target_fids: allFids
          }
        }
      })
    });
    
    if (!webhookResponse.ok) {
      const errorText = await webhookResponse.text();
      throw new Error(`Webhook update failed: ${errorText}`);
    }
    
    const webhookData = await webhookResponse.json();
    console.log(`✅ Webhook updated successfully!`);
    
    // Step 6: Save updated FIDs to database
    await pool.query(`
      UPDATE webhook_config 
      SET tracked_fids = $1, updated_at = NOW()
      WHERE webhook_id = $2
    `, [allFids, webhookId]);
    
    console.log(`✅ Database updated with ${allFids.length} tracked FIDs`);
    
    console.log(`\n🎉 SUCCESS! All ${deletedFids.length} users have been restored!`);
    console.log(`\n📊 Final Status:`);
    console.log(`   - Restored users: ${updateResult.rows.length}`);
    console.log(`   - Total FIDs in webhook: ${allFids.length}`);
    console.log(`   - Latest casts tracked: ${latestCasts.length}`);
    
  } catch (error) {
    console.error(`\n❌ ERROR:`, error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

restoreUsers();
