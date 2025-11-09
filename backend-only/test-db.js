const { Pool } = require('pg');

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function testDatabase() {
  try {
    console.log('🔍 Testing database connection...');
    
    // Check user_profiles table
    const profilesResult = await pool.query('SELECT COUNT(*) FROM user_profiles');
    console.log(`📊 user_profiles count: ${profilesResult.rows[0].count}`);
    
    // Check user_earnings table
    const earningsResult = await pool.query('SELECT COUNT(*) FROM user_earnings');
    console.log(`📊 user_earnings count: ${earningsResult.rows[0].count}`);
    
    // Check tip_history table
    const tipHistoryResult = await pool.query('SELECT COUNT(*) FROM tip_history');
    console.log(`📊 tip_history count: ${tipHistoryResult.rows[0].count}`);
    
    // Check user_configs table
    const configsResult = await pool.query('SELECT COUNT(*) FROM user_configs');
    console.log(`📊 user_configs count: ${configsResult.rows[0].count}`);
    
    // Sample data from user_profiles
    const sampleProfiles = await pool.query('SELECT fid, username, display_name FROM user_profiles LIMIT 5');
    console.log('📊 Sample user_profiles:', sampleProfiles.rows);
    
    // Sample data from user_earnings
    const sampleEarnings = await pool.query('SELECT fid, total_earnings, total_tippings FROM user_earnings LIMIT 5');
    console.log('📊 Sample user_earnings:', sampleEarnings.rows);
    
    // Sample FIDs from tip_history via user_configs
    const sampleFids = await pool.query(`
      SELECT DISTINCT (uc.config->>'fid')::bigint as fid, uc.user_address
      FROM tip_history th
      JOIN user_configs uc ON LOWER(uc.user_address) = LOWER(th.from_address)
      WHERE LOWER(th.token_address) = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913'
      AND uc.config->>'fid' IS NOT NULL
      LIMIT 5
    `);
    console.log('📊 Sample FIDs from tip_history:', sampleFids.rows);
    
  } catch (error) {
    console.error('❌ Database test failed:', error);
  } finally {
    await pool.end();
  }
}

testDatabase();