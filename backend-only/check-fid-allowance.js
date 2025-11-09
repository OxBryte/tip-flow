const database = require('./src/database-pg');
const { ethers } = require('ethers');
const { getProvider } = require('./src/rpcProvider');

async function checkFidAllowance(fid) {
  try {
    // Get user address from FID
    const result = await database.pool.query(
      'SELECT user_address FROM user_profiles WHERE fid = $1',
      [fid]
    );
    
    if (result.rows.length === 0) {
      console.log(`❌ No user found with FID ${fid}`);
      return;
    }
    
    const userAddress = result.rows[0].user_address;
    if (!userAddress) {
      console.log(`❌ User FID ${fid} has no associated address`);
      return;
    }
    
    console.log(`\n👤 User FID: ${fid}`);
    console.log(`📍 Address: ${userAddress}`);
    
    // Get user config
    const userConfig = await database.getUserConfig(userAddress);
    if (userConfig) {
      const likeAmount = parseFloat(userConfig.likeAmount || '0');
      const recastAmount = parseFloat(userConfig.recastAmount || '0');
      const replyAmount = parseFloat(userConfig.replyAmount || '0');
      const minTipAmount = likeAmount + recastAmount + replyAmount;
      
      console.log(`\n📊 Config:`);
      console.log(`  - Like amount: ${likeAmount} USDC`);
      console.log(`  - Recast amount: ${recastAmount} USDC`);
      console.log(`  - Reply amount: ${replyAmount} USDC`);
      console.log(`  - Min tip amount: ${minTipAmount} USDC`);
      console.log(`  - isActive: ${userConfig.isActive}`);
    }
    
    // Check allowance and balance
    const provider = await getProvider();
    const tokenAddress = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'; // USDC on Base
    const ecionBatchAddress = process.env.ECION_BATCH_CONTRACT_ADDRESS || '0x2f47bcc17665663d1b63e8d882faa0a366907bb8';
    
    const tokenContract = new ethers.Contract(tokenAddress, [
      "function allowance(address owner, address spender) view returns (uint256)",
      "function balanceOf(address owner) view returns (uint256)"
    ], provider);
    
    const [allowance, balance] = await Promise.all([
      tokenContract.allowance(userAddress, ecionBatchAddress),
      tokenContract.balanceOf(userAddress)
    ]);
    
    const tokenDecimals = 6; // USDC has 6 decimals
    const allowanceAmount = parseFloat(ethers.formatUnits(allowance, tokenDecimals));
    const balanceAmount = parseFloat(ethers.formatUnits(balance, tokenDecimals));
    
    console.log(`\n💰 Token Info:`);
    console.log(`  - Token: USDC (${tokenAddress})`);
    console.log(`  - Contract: ${ecionBatchAddress}`);
    console.log(`  - Allowance: ${allowanceAmount} USDC`);
    console.log(`  - Balance: ${balanceAmount} USDC`);
    
    if (userConfig) {
      const minTipAmount = parseFloat(userConfig.likeAmount || '0') + 
                          parseFloat(userConfig.recastAmount || '0') + 
                          parseFloat(userConfig.replyAmount || '0');
      
      console.log(`\n✅ Status:`);
      console.log(`  - Has sufficient allowance: ${allowanceAmount >= minTipAmount ? '✅' : '❌'} (${allowanceAmount} >= ${minTipAmount})`);
      console.log(`  - Has sufficient balance: ${balanceAmount >= minTipAmount ? '✅' : '❌'} (${balanceAmount} >= ${minTipAmount})`);
      console.log(`  - Can afford tips: ${(allowanceAmount >= minTipAmount && balanceAmount >= minTipAmount) ? '✅' : '❌'}`);
    }
    
    // Check if in webhook
    const trackedFids = await database.getTrackedFids();
    const isInWebhook = trackedFids.includes(fid);
    console.log(`\n🔗 Webhook:`);
    console.log(`  - In webhook (follow.created): ${isInWebhook ? '✅' : '❌'}`);
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

// Get FID from command line argument
const fid = process.argv[2] ? parseInt(process.argv[2]) : 1024900;
checkFidAllowance(fid);
