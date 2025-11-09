// Test database file loading
try {
  const database = require('./backend-only/src/database-pg.js');
  console.log('✅ Database loaded successfully');
  console.log('Available functions:', Object.getOwnPropertyNames(Object.getPrototypeOf(database)).filter(name => typeof database[name] === 'function'));
  
  // Test specific functions
  if (typeof database.getLeaderboardData === 'function') {
    console.log('✅ getLeaderboardData function exists');
  } else {
    console.log('❌ getLeaderboardData function missing');
  }
  
  if (typeof database.getUserConfig === 'function') {
    console.log('✅ getUserConfig function exists');
  } else {
    console.log('❌ getUserConfig function missing');
  }
  
  // Blocklist functions removed - using webhook filtering instead
  
} catch (error) {
  console.error('❌ Error loading database:', error.message);
}