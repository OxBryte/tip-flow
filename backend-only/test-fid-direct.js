// Direct test of FID lookup for the failing address

async function testFidLookup() {
  const testAddress = '0x3cF87B76d2A1D36F9542B4Da2a6B4B3Dc0f0Bb2e';
  
  console.log(`🔍 Testing FID lookup for: ${testAddress}`);
  
  try {
    // Test the verification endpoint (should be free)
    console.log('\n1. Testing verification endpoint...');
    const response1 = await fetch(
      `https://api.neynar.com/v2/farcaster/user/by-verification?address=${testAddress}`,
      {
        headers: { 
          "x-api-key": process.env.NEYNAR_API_KEY
        }
      }
    );
    
    console.log(`Verification endpoint status: ${response1.status}`);
    
    if (response1.ok) {
      const data1 = await response1.json();
      console.log('Verification response:', JSON.stringify(data1, null, 2));
      
      if (data1.fid) {
        console.log(`✅ Found FID via verification: ${data1.fid}`);
      } else {
        console.log(`❌ No FID found in verification response`);
      }
    } else {
      const errorText1 = await response1.text();
      console.log('Verification error:', errorText1);
    }
    
    // Test the bulk-by-address endpoint (requires payment)
    console.log('\n2. Testing bulk-by-address endpoint...');
    const response2 = await fetch(
      `https://api.neynar.com/v2/farcaster/user/bulk-by-address/?addresses=${testAddress}`,
      {
        headers: { 
          "x-api-key": process.env.NEYNAR_API_KEY,
          "x-neynar-experimental": "false"
        }
      }
    );
    
    console.log(`Bulk endpoint status: ${response2.status}`);
    
    if (response2.ok) {
      const data2 = await response2.json();
      console.log('Bulk response:', JSON.stringify(data2, null, 2));
    } else {
      const errorText2 = await response2.text();
      console.log('Bulk error:', errorText2);
    }
    
  } catch (error) {
    console.error('Error:', error);
  }
}

testFidLookup();