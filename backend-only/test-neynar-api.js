// Test Neynar API directly to see what's happening
const testAddress = '0x3cF87B76d2A1D36F9542B4Da2a6B4B3Dc0f0Bb2e';

async function testNeynarAPI() {
  console.log(`🔍 Testing Neynar API for address: ${testAddress}`);
  console.log(`🔑 API Key exists: ${!!process.env.NEYNAR_API_KEY}`);
  console.log(`🔑 API Key length: ${process.env.NEYNAR_API_KEY ? process.env.NEYNAR_API_KEY.length : 0}`);
  console.log(`🔑 API Key starts with: ${process.env.NEYNAR_API_KEY ? process.env.NEYNAR_API_KEY.substring(0, 10) + '...' : 'undefined'}`);
  
  try {
    // Test verification endpoint
    console.log('\n1. Testing verification endpoint...');
    const response = await fetch(
      `https://api.neynar.com/v2/farcaster/user/by-verification?address=${testAddress}`,
      {
        headers: { 
          "x-api-key": process.env.NEYNAR_API_KEY
        }
      }
    );
    
    console.log(`Status: ${response.status}`);
    const data = await response.json();
    console.log('Response:', JSON.stringify(data, null, 2));
    
    if (response.status === 401) {
      console.log('❌ API Key is invalid or expired');
      console.log('🔧 You need to check your NEYNAR_API_KEY in Railway environment variables');
    } else if (response.status === 200) {
      console.log('✅ API Key is working!');
      if (data.fid) {
        console.log(`✅ Found FID: ${data.fid}`);
      } else {
        console.log('❌ No FID found - user has no verified Farcaster address');
      }
    }
    
  } catch (error) {
    console.error('❌ Error testing API:', error);
  }
}

testNeynarAPI();