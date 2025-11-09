// Test Neynar SDK with the failing address
const testAddress = '0x3cF87B76d2A1D36F9542B4Da2a6B4B3Dc0f0Bb2e';

async function testNeynarSDK() {
  try {
    console.log(`🔍 Testing Neynar SDK for address: ${testAddress}`);
    
    const { NeynarAPIClient, Configuration } = require('@neynar/nodejs-sdk');
    
    const config = new Configuration({
      apiKey: process.env.NEYNAR_API_KEY,
    });
    
    const client = new NeynarAPIClient(config);
    
    console.log(`🔑 API Key exists: ${!!process.env.NEYNAR_API_KEY}`);
    console.log(`🔑 API Key length: ${process.env.NEYNAR_API_KEY ? process.env.NEYNAR_API_KEY.length : 0}`);
    
    // Check available methods
    console.log('🔍 Available methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(client)).filter(name => name.includes('User') || name.includes('Address')));
    
    // Try different methods
    let result;
    try {
      result = await client.lookupUserByCustodyAddress({
        address: testAddress
      });
      console.log('✅ lookupUserByCustodyAddress succeeded');
    } catch (error) {
      console.log('❌ lookupUserByCustodyAddress failed:', error.message);
      
      try {
        result = await client.fetchBulkUsersByEthOrSolAddress({
          addresses: [testAddress]
        });
        console.log('✅ fetchBulkUsersByEthOrSolAddress succeeded');
      } catch (error2) {
        console.log('❌ fetchBulkUsersByEthOrSolAddress failed:', error2.message);
        throw error2;
      }
    }
    
    console.log('📊 Neynar SDK response:', JSON.stringify(result, null, 2));
    
    if (result && result[testAddress.toLowerCase()]) {
      const user = result[testAddress.toLowerCase()];
      console.log(`✅ Found user:`, {
        fid: user.fid,
        username: user.username,
        displayName: user.displayName
      });
    } else {
      console.log(`❌ No user found for address ${testAddress}`);
    }
    
  } catch (error) {
    console.error('❌ Error testing Neynar SDK:', error);
    
    if (error.message.includes('401') || error.message.includes('Unauthorized')) {
      console.log('❌ API Key issue - check NEYNAR_API_KEY environment variable');
    }
  }
}

testNeynarSDK();