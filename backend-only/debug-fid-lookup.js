// Debug script to test FID lookup for specific address

async function debugFidLookup() {
  const testAddress = '0x3cF87B76d2A1D36F9542B4Da2a6B4B3Dc0f0Bb2e';
  
  console.log(`🔍 Debugging FID lookup for address: ${testAddress}`);
  
  try {
    // Test bulk-by-address endpoint
    console.log('\n1. Testing bulk-by-address endpoint...');
    const response1 = await fetch(
      `https://api.neynar.com/v2/farcaster/user/bulk-by-address/?addresses=${testAddress}`,
      {
        headers: { 
          "x-api-key": process.env.NEYNAR_API_KEY,
          "x-neynar-experimental": "false"
        }
      }
    );
    
    console.log(`Status: ${response1.status}`);
    const data1 = await response1.json();
    console.log('Response:', JSON.stringify(data1, null, 2));
    
    // Test verification endpoint
    console.log('\n2. Testing verification endpoint...');
    const response2 = await fetch(
      `https://api.neynar.com/v2/farcaster/user/by-verification?address=${testAddress}`,
      {
        headers: { 
          "x-api-key": process.env.NEYNAR_API_KEY
        }
      }
    );
    
    console.log(`Status: ${response2.status}`);
    const data2 = await response2.json();
    console.log('Response:', JSON.stringify(data2, null, 2));
    
    // Test with different address formats
    console.log('\n3. Testing with lowercase address...');
    const response3 = await fetch(
      `https://api.neynar.com/v2/farcaster/user/bulk-by-address/?addresses=${testAddress.toLowerCase()}`,
      {
        headers: { 
          "x-api-key": process.env.NEYNAR_API_KEY,
          "x-neynar-experimental": "false"
        }
      }
    );
    
    console.log(`Status: ${response3.status}`);
    const data3 = await response3.json();
    console.log('Response:', JSON.stringify(data3, null, 2));
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

debugFidLookup();