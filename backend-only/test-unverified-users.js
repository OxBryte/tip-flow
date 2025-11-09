// Test script to remove users without verified addresses
const fetch = require('node-fetch');

async function testRemoveUnverifiedUsers() {
  try {
    console.log('🔍 Testing removal of users without verified addresses...');
    
    const response = await fetch('https://tippit-production.up.railway.app/api/remove-unverified-users', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    const result = await response.json();
    
    console.log('📊 Results:');
    console.log(JSON.stringify(result, null, 2));
    
    if (result.success) {
      console.log(`✅ Successfully processed ${result.totalUsers} users`);
      console.log(`🗑️ Removed ${result.removedCount} users without verified addresses`);
      console.log(`❌ ${result.errorCount} errors occurred`);
      
      if (result.removedCount > 0) {
        console.log('\n📋 Users removed:');
        result.results
          .filter(r => r.removed)
          .forEach(r => console.log(`  - ${r.userAddress}: ${r.reason}`));
      }
    } else {
      console.log('❌ Failed to remove unverified users:', result.message);
    }
    
  } catch (error) {
    console.error('❌ Error testing unverified users removal:', error);
  }
}

testRemoveUnverifiedUsers();