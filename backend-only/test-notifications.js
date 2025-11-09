// Test script for Farcaster notifications
const fetch = require('node-fetch');

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8080';

async function testNotificationSystem() {
  console.log('🧪 Testing Farcaster notification system...\n');
  
  try {
    // 1. Check notification users
    console.log('1. Checking users with notification tokens...');
    const usersResponse = await fetch(`${BACKEND_URL}/api/notification-users`);
    const usersData = await usersResponse.json();
    
    if (usersData.success) {
      console.log(`✅ Found ${usersData.totalUsers} users with notification tokens:`);
      usersData.users.forEach(user => {
        console.log(`   - ${user.userAddress} (FID: ${user.fid})`);
      });
    } else {
      console.log('❌ Failed to get notification users');
    }
    
    console.log('\n2. Testing notification status for a specific user...');
    
    // Test with a specific user address (replace with actual address)
    const testUserAddress = '0xa272bc9d6f462F4f08849AdeAF6E49A5D4430C38';
    const statusResponse = await fetch(`${BACKEND_URL}/api/notification-status/${testUserAddress}`);
    const statusData = await statusResponse.json();
    
    if (statusData.success) {
      console.log(`✅ Notification status for ${testUserAddress}:`);
      console.log(`   - Has tokens: ${statusData.hasNotificationTokens}`);
      console.log(`   - Message: ${statusData.message}`);
      if (statusData.tokenData) {
        console.log(`   - FID: ${statusData.tokenData.fid}`);
      }
    } else {
      console.log('❌ Failed to check notification status');
    }
    
    console.log('\n3. Testing notification sending...');
    
    // Test sending a notification
    const testNotificationResponse = await fetch(`${BACKEND_URL}/api/test-notification`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        userAddress: testUserAddress,
        title: 'Test Notification',
        message: 'This is a test notification from Ecion!',
        targetUrl: 'https://ecion.vercel.app'
      })
    });
    
    const testNotificationData = await testNotificationResponse.json();
    
    if (testNotificationData.success) {
      console.log('✅ Test notification sent successfully!');
    } else {
      console.log(`❌ Test notification failed: ${testNotificationData.error}`);
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

// Run the test
testNotificationSystem();