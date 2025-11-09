// Test script to manually add a notification token
const fetch = require('node-fetch');

const BACKEND_URL = 'https://tippit-production.up.railway.app';

async function addNotificationToken() {
  console.log('🧪 Testing notification token addition...\n');
  
  try {
    // Simulate what happens when a user adds the mini app
    const webhookResponse = await fetch(`${BACKEND_URL}/webhook/farcaster`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        event: 'miniapp_added',
        notificationDetails: {
          url: 'https://api.farcaster.xyz/v1/frame-notifications',
          token: 'test-token-' + Date.now()
        },
        fid: 242597 // Your FID
      })
    });
    
    const webhookResult = await webhookResponse.json();
    console.log('📋 Webhook response:', webhookResult);
    
    // Check if the token was added
    const statusResponse = await fetch(`${BACKEND_URL}/api/notification-status/0x3cF87B76d2A1D36F9542B4Da2a6B4B3Dc0f0Bb2e`);
    const statusResult = await statusResponse.json();
    console.log('📊 User status:', statusResult);
    
    // Check all notification users
    const usersResponse = await fetch(`${BACKEND_URL}/api/notification-users`);
    const usersResult = await usersResponse.json();
    console.log('👥 All notification users:', usersResult);
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

// Run the test
addNotificationToken();