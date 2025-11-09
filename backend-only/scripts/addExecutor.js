// Script to add backend wallet as executor to EcionBatch contract
const { ethers } = require('ethers');

async function addExecutor() {
  try {
    // Setup provider and wallet
    const provider = new ethers.JsonRpcProvider(process.env.BASE_RPC_URL || 'https://mainnet.base.org');
    const wallet = new ethers.Wallet(process.env.BACKEND_WALLET_PRIVATE_KEY, provider);
    
    // Contract address
    const contractAddress = '0x2f47bcc17665663d1b63e8d882faa0a366907bb8';
    
    // Contract ABI (from deployed contract)
    const contractABI = [
      {
        "inputs": [
          {
            "internalType": "address",
            "name": "executor",
            "type": "address"
          }
        ],
        "name": "addExecutor",
        "outputs": [],
        "stateMutability": "nonpayable",
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
      },
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
      }
    ];
    
    // Create contract instance
    const contract = new ethers.Contract(contractAddress, contractABI, wallet);
    
    console.log(`🔍 Checking contract owner...`);
    const owner = await contract.owner();
    console.log(`📋 Contract owner: ${owner}`);
    console.log(`📋 Backend wallet: ${wallet.address}`);
    
    if (owner.toLowerCase() !== wallet.address.toLowerCase()) {
      console.log(`❌ Backend wallet is not the contract owner. Only the owner can add executors.`);
      console.log(`💡 You need to call addExecutor(${wallet.address}) from the owner wallet.`);
      return;
    }
    
    console.log(`🔍 Checking if backend wallet is already an executor...`);
    const isAlreadyExecutor = await contract.isExecutor(wallet.address);
    
    if (isAlreadyExecutor) {
      console.log(`✅ Backend wallet is already an executor!`);
      return;
    }
    
    console.log(`➕ Adding backend wallet as executor...`);
    const tx = await contract.addExecutor(wallet.address, {
      gasLimit: 100000
    });
    
    console.log(`⏳ Transaction submitted: ${tx.hash}`);
    console.log(`⏳ Waiting for confirmation...`);
    
    const receipt = await tx.wait();
    
    if (receipt.status === 1) {
      console.log(`✅ Backend wallet successfully added as executor!`);
      console.log(`📋 Transaction hash: ${tx.hash}`);
      console.log(`📋 Gas used: ${receipt.gasUsed.toString()}`);
    } else {
      console.log(`❌ Transaction failed!`);
    }
    
  } catch (error) {
    console.error(`❌ Error adding executor:`, error.message);
  }
}

// Run the script
addExecutor();