// Script to test EcionBatch contract
const { ethers } = require('ethers');

async function testContract() {
  try {
    // Setup provider and wallet
    const provider = new ethers.JsonRpcProvider(process.env.BASE_RPC_URL || 'https://mainnet.base.org');
    const wallet = new ethers.Wallet(process.env.BACKEND_WALLET_PRIVATE_KEY, provider);
    
    // Contract address
    const contractAddress = '0x2f47bcc17665663d1b63e8d882faa0a366907bb8';
    
    // Contract ABI
    const contractABI = [
      {
        "inputs": [],
        "name": "owner",
        "outputs": [
          {
            "internalType": "address",
            "name": "",
            "type": "address"
          }
        ],
        "stateMutability": "view",
        "type": "function"
      },
      {
        "inputs": [
          {
            "internalType": "address",
            "name": "executor",
            "type": "address"
          }
        ],
        "name": "isExecutor",
        "outputs": [
          {
            "internalType": "bool",
            "name": "",
            "type": "bool"
          }
        ],
        "stateMutability": "view",
        "type": "function"
      }
    ];
    
    // Create contract instance
    const contract = new ethers.Contract(contractAddress, contractABI, wallet);
    
    console.log(`🔍 Testing EcionBatch contract...`);
    console.log(`📋 Contract address: ${contractAddress}`);
    console.log(`📋 Backend wallet: ${wallet.address}`);
    
    // Check owner
    console.log(`\n🔍 Checking contract owner...`);
    const owner = await contract.owner();
    console.log(`✅ Contract owner: ${owner}`);
    
    // Check if backend wallet is executor
    console.log(`\n🔍 Checking if backend wallet is executor...`);
    const isExecutor = await contract.isExecutor(wallet.address);
    console.log(`${isExecutor ? '✅' : '❌'} Backend wallet is ${isExecutor ? 'an' : 'not an'} executor`);
    
    if (!isExecutor) {
      console.log(`\n💡 To add backend wallet as executor, run:`);
      console.log(`   node scripts/addExecutor.js`);
    }
    
    console.log(`\n✅ Contract test complete!`);
    
  } catch (error) {
    console.error(`❌ Error testing contract:`, error.message);
  }
}

// Run the test
testContract();