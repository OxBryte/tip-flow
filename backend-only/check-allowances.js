const { Pool } = require('pg');
const { ethers } = require('ethers');
const fetch = require('node-fetch');

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Configuration
const ECION_BATCH_CONTRACT = process.env.ECION_BATCH_CONTRACT_ADDRESS || '0x2f47bcc17665663d1b63e8d882faa0a366907bb8';
const BASE_RPC_URL = process.env.BASE_RPC_URL;
const NEYNAR_API_KEY = process.env.NEYNAR_API_KEY;

// The 23 FIDs to check
const FIDS_TO_CHECK = [
  249432, 15086, 250869, 564447, 1052964, 200375, 849116, 1161826,
  520364, 1351395, 1007471, 1104000, 507756, 243108, 306502, 963470,
  230238, 472963, 240486, 441699, 476026, 242597, 4163
];

// Specific address to check
const SPECIFIC_ADDRESS = '0x275aB0037e50BDA1cdA147e3Ac9AeaeFB3D21E85';

// ERC20 ABI
const ERC20_ABI = [
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)"
];

// Check token allowance
async function checkTokenAllowance(userAddress, tokenAddress) {
  try {
    const provider = new ethers.JsonRpcProvider(BASE_RPC_URL);
    const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
    
    const allowance = await tokenContract.allowance(userAddress, ECION_BATCH_CONTRACT);
    
    // Get token decimals
    let tokenDecimals = 18;
    try {
      tokenDecimals = await tokenContract.decimals();
    } catch (e) {
      // Default to USDC decimals (6) if it's USDC, otherwise 18
      tokenDecimals = tokenAddress.toLowerCase() === '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913' ? 6 : 18;
    }
    
    const allowanceAmount = parseFloat(ethers.formatUnits(allowance, tokenDecimals));
    return allowanceAmount;
  } catch (error) {
    console.error(`❌ Error checking allowance for ${userAddress}:`, error.message);
    return 0;
  }
}

// Check token balance
async function checkTokenBalance(userAddress, tokenAddress) {
  try {
    const provider = new ethers.JsonRpcProvider(BASE_RPC_URL);
    const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
    
    const balance = await tokenContract.balanceOf(userAddress);
    
    // Get token decimals
    let tokenDecimals = 18;
    try {
      tokenDecimals = await tokenContract.decimals();
    } catch (e) {
      tokenDecimals = tokenAddress.toLowerCase() === '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913' ? 6 : 18;
    }
    
    const balanceAmount = parseFloat(ethers.formatUnits(balance, tokenDecimals));
    return balanceAmount;
  } catch (error) {
    console.error(`❌ Error checking balance for ${userAddress}:`, error.message);
    return 0;
  }
}

// Get user by FID from Neynar API
async function getUserByFid(fid) {
  try {
    const response = await fetch(`https://api.neynar.com/v2/farcaster/user/bulk?fids=${fid}`, {
      headers: {
        'x-api-key': NEYNAR_API_KEY,
      },
    });
    
    const data = await response.json();
    return data.users?.[0] || null;
  } catch (error) {
    console.error(`Error fetching user by FID ${fid}:`, error);
    return null;
  }
}

// Get user address from FID
async function getUserAddressFromFid(fid) {
  try {
    // First try to get from database
    const dbResult = await pool.query(`
      SELECT user_address, fid
      FROM user_profiles
      WHERE fid = $1
    `, [fid]);
    
    if (dbResult.rows.length > 0 && dbResult.rows[0].user_address) {
      return dbResult.rows[0].user_address.toLowerCase();
    }
    
    // If not in database, get from Neynar API
    const user = await getUserByFid(fid);
    if (user) {
      const address = user.verified_addresses?.primary?.eth_address || 
                     user.verified_addresses?.eth_addresses?.[0];
      return address ? address.toLowerCase() : null;
    }
    
    return null;
  } catch (error) {
    console.error(`Error getting user address for FID ${fid}:`, error);
    return null;
  }
}

// Get user config and minTip
async function getUserConfigAndMinTip(userAddress) {
  try {
    const result = await pool.query(`
      SELECT config
      FROM user_configs
      WHERE LOWER(user_address) = LOWER($1)
    `, [userAddress]);
    
    if (result.rows.length === 0 || !result.rows[0].config) {
      return { config: null, tokenAddress: null, minTip: 0 };
    }
    
    const config = result.rows[0].config;
    const tokenAddress = config.tokenAddress || '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
    const likeAmount = parseFloat(config.likeAmount || '0');
    const recastAmount = parseFloat(config.recastAmount || '0');
    const replyAmount = parseFloat(config.replyAmount || '0');
    const minTip = likeAmount + recastAmount + replyAmount;
    
    return { config, tokenAddress, minTip };
  } catch (error) {
    console.error(`Error getting user config for ${userAddress}:`, error);
    return { config: null, tokenAddress: null, minTip: 0 };
  }
}

// Main function to check all users
async function checkAllUsers() {
  console.log('🔍 Starting allowance check for 23 FIDs...\n');
  
  const results = [];
  const usersToAddBack = [];
  
  // Check each FID
  for (const fid of FIDS_TO_CHECK) {
    console.log(`\n📋 Checking FID ${fid}...`);
    
    const userAddress = await getUserAddressFromFid(fid);
    
    if (!userAddress) {
      console.log(`❌ No address found for FID ${fid}`);
      results.push({
        fid,
        userAddress: null,
        allowance: 0,
        balance: 0,
        minTip: 0,
        tokenAddress: null,
        hasSufficientAllowance: false,
        hasSufficientBalance: false,
        canAddBack: false,
        reason: 'No address found'
      });
      continue;
    }
    
    console.log(`  Address: ${userAddress}`);
    
    // Get user config
    const { config, tokenAddress, minTip } = await getUserConfigAndMinTip(userAddress);
    
    if (!config) {
      console.log(`  ⚠️ No config found for ${userAddress}`);
      results.push({
        fid,
        userAddress,
        allowance: 0,
        balance: 0,
        minTip: 0,
        tokenAddress,
        hasSufficientAllowance: false,
        hasSufficientBalance: false,
        canAddBack: false,
        reason: 'No config found'
      });
      continue;
    }
    
    console.log(`  Token: ${tokenAddress}`);
    console.log(`  MinTip: ${minTip}`);
    
    // Check allowance and balance
    const [allowance, balance] = await Promise.all([
      checkTokenAllowance(userAddress, tokenAddress),
      checkTokenBalance(userAddress, tokenAddress)
    ]);
    
    const hasSufficientAllowance = allowance >= minTip && allowance > 0;
    const hasSufficientBalance = balance >= minTip;
    const canAddBack = hasSufficientAllowance && hasSufficientBalance;
    
    console.log(`  Allowance: ${allowance}`);
    console.log(`  Balance: ${balance}`);
    console.log(`  ✅ Sufficient Allowance: ${hasSufficientAllowance}`);
    console.log(`  ✅ Sufficient Balance: ${hasSufficientBalance}`);
    console.log(`  ✅ Can Add Back: ${canAddBack}`);
    
    results.push({
      fid,
      userAddress,
      allowance,
      balance,
      minTip,
      tokenAddress,
      hasSufficientAllowance,
      hasSufficientBalance,
      canAddBack,
      reason: canAddBack ? 'Ready to add back' : `Insufficient ${!hasSufficientAllowance ? 'allowance' : 'balance'}`
    });
    
    if (canAddBack) {
      usersToAddBack.push({ fid, userAddress, tokenAddress, allowance, balance, minTip });
    }
  }
  
  // Check specific address
  console.log(`\n\n🔍 Checking specific address: ${SPECIFIC_ADDRESS}...\n`);
  
  const { config, tokenAddress, minTip } = await getUserConfigAndMinTip(SPECIFIC_ADDRESS);
  
  if (config) {
    const [allowance, balance] = await Promise.all([
      checkTokenAllowance(SPECIFIC_ADDRESS, tokenAddress),
      checkTokenBalance(SPECIFIC_ADDRESS, tokenAddress)
    ]);
    
    const hasSufficientAllowance = allowance >= minTip && allowance > 0;
    const hasSufficientBalance = balance >= minTip;
    
    console.log(`  Token: ${tokenAddress}`);
    console.log(`  MinTip: ${minTip}`);
    console.log(`  Allowance: ${allowance}`);
    console.log(`  Balance: ${balance}`);
    console.log(`  ✅ Sufficient Allowance: ${hasSufficientAllowance}`);
    console.log(`  ✅ Sufficient Balance: ${hasSufficientBalance}`);
    
    results.push({
      fid: null,
      userAddress: SPECIFIC_ADDRESS,
      allowance,
      balance,
      minTip,
      tokenAddress,
      hasSufficientAllowance,
      hasSufficientBalance,
      canAddBack: hasSufficientAllowance && hasSufficientBalance,
      reason: 'Specific address check'
    });
  } else {
    console.log(`  ⚠️ No config found for ${SPECIFIC_ADDRESS}`);
    results.push({
      fid: null,
      userAddress: SPECIFIC_ADDRESS,
      allowance: 0,
      balance: 0,
      minTip: 0,
      tokenAddress: null,
      hasSufficientAllowance: false,
      hasSufficientBalance: false,
      canAddBack: false,
      reason: 'No config found'
    });
  }
  
  // Summary
  console.log('\n\n📊 SUMMARY\n');
  console.log('='.repeat(80));
  
  const canAddBackCount = results.filter(r => r.canAddBack).length;
  const insufficientAllowance = results.filter(r => !r.hasSufficientAllowance && r.userAddress).length;
  const insufficientBalance = results.filter(r => r.hasSufficientBalance === false && r.userAddress && r.hasSufficientAllowance).length;
  
  console.log(`Total Checked: ${results.length}`);
  console.log(`Can Add Back: ${canAddBackCount}`);
  console.log(`Insufficient Allowance: ${insufficientAllowance}`);
  console.log(`Insufficient Balance: ${insufficientBalance}`);
  
  console.log('\n\n📋 DETAILED RESULTS\n');
  console.log('='.repeat(80));
  
  for (const result of results) {
    if (result.fid) {
      console.log(`\nFID: ${result.fid}`);
    } else {
      console.log(`\nAddress: ${result.userAddress}`);
    }
    console.log(`  Address: ${result.userAddress || 'N/A'}`);
    console.log(`  Token: ${result.tokenAddress || 'N/A'}`);
    console.log(`  Allowance: ${result.allowance}`);
    console.log(`  Balance: ${result.balance}`);
    console.log(`  MinTip: ${result.minTip}`);
    console.log(`  Sufficient Allowance: ${result.hasSufficientAllowance ? '✅' : '❌'}`);
    console.log(`  Sufficient Balance: ${result.hasSufficientBalance ? '✅' : '❌'}`);
    console.log(`  Can Add Back: ${result.canAddBack ? '✅ YES' : '❌ NO'}`);
    console.log(`  Reason: ${result.reason}`);
  }
  
  if (usersToAddBack.length > 0) {
    console.log('\n\n✅ USERS READY TO ADD BACK\n');
    console.log('='.repeat(80));
    for (const user of usersToAddBack) {
      console.log(`FID: ${user.fid}, Address: ${user.userAddress}, Allowance: ${user.allowance}, Balance: ${user.balance}, MinTip: ${user.minTip}`);
    }
  }
  
  // Return results for potential automation
  return {
    results,
    usersToAddBack,
    summary: {
      total: results.length,
      canAddBack: canAddBackCount,
      insufficientAllowance,
      insufficientBalance
    }
  };
}

// Run the check
if (require.main === module) {
  checkAllUsers()
    .then(() => {
      console.log('\n✅ Check completed!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Error:', error);
      process.exit(1);
    })
    .finally(() => {
      pool.end();
    });
}

module.exports = { checkAllUsers, checkTokenAllowance, checkTokenBalance };
