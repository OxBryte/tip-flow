const { Pool } = require('pg');

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Check active users and their configs by FID
async function checkActiveUsersConfigs() {
  try {
    console.log('🔍 Checking active users and their configs by FID...\n');
    
    // Get tracked FIDs from webhook_config (active users)
    const trackedFidsResult = await pool.query(`
      SELECT tracked_fids 
      FROM webhook_config 
      ORDER BY updated_at DESC 
      LIMIT 1
    `);
    
    const trackedFids = trackedFidsResult.rows[0]?.tracked_fids || [];
    console.log(`📋 Found ${trackedFids.length} FIDs in follow.created (active users)\n`);
    
    if (trackedFids.length === 0) {
      console.log('⚠️ No active users found');
      return;
    }
    
    // Get user profiles for these FIDs
    const usersResult = await pool.query(`
      SELECT 
        up.fid,
        up.user_address,
        up.username,
        up.display_name,
        uc.config
      FROM user_profiles up
      LEFT JOIN user_configs uc ON LOWER(up.user_address) = LOWER(uc.user_address)
      WHERE up.fid = ANY($1)
      ORDER BY up.fid
    `, [trackedFids]);
    
    console.log(`📊 Found ${usersResult.rows.length} users in database\n`);
    console.log('='.repeat(80));
    console.log('ACTIVE USERS AND THEIR CONFIGS:\n');
    
    for (const user of usersResult.rows) {
      console.log(`FID: ${user.fid}`);
      console.log(`  Address: ${user.user_address || 'N/A'}`);
      console.log(`  Username: ${user.username || 'N/A'}`);
      console.log(`  Display Name: ${user.display_name || 'N/A'}`);
      
      if (user.config) {
        const config = user.config;
        console.log(`  ✅ HAS CONFIG:`);
        console.log(`    - isActive: ${config.isActive}`);
        console.log(`    - tokenAddress: ${config.tokenAddress || 'N/A'}`);
        console.log(`    - likeAmount: ${config.likeAmount || '0'}`);
        console.log(`    - recastAmount: ${config.recastAmount || '0'}`);
        console.log(`    - replyAmount: ${config.replyAmount || '0'}`);
        console.log(`    - likeEnabled: ${config.likeEnabled}`);
        console.log(`    - recastEnabled: ${config.recastEnabled}`);
        console.log(`    - replyEnabled: ${config.replyEnabled}`);
        console.log(`    - followEnabled: ${config.followEnabled}`);
      } else {
        console.log(`  ❌ NO CONFIG FOUND`);
      }
      
      // Also try to get config by address (to see the mismatch)
      if (user.user_address) {
        const configByAddress = await pool.query(`
          SELECT config
          FROM user_configs
          WHERE LOWER(user_address) = LOWER($1)
        `, [user.user_address]);
        
        if (configByAddress.rows.length > 0) {
          console.log(`  📖 Config by address exists: ${!!configByAddress.rows[0].config}`);
          if (configByAddress.rows[0].config) {
            console.log(`    - isActive: ${configByAddress.rows[0].config.isActive}`);
          }
        } else {
          console.log(`  ⚠️ NO CONFIG BY ADDRESS`);
        }
      }
      
      console.log('');
    }
    
    // Summary
    const withConfig = usersResult.rows.filter(u => u.config).length;
    const withoutConfig = usersResult.rows.filter(u => !u.config).length;
    
    console.log('='.repeat(80));
    console.log(`SUMMARY:`);
    console.log(`  Total Active Users: ${usersResult.rows.length}`);
    console.log(`  With Config: ${withConfig}`);
    console.log(`  Without Config: ${withoutConfig}`);
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await pool.end();
  }
}

checkActiveUsersConfigs();
