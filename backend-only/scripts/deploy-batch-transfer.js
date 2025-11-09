const { ethers } = require('hardhat');

async function main() {
  console.log('🚀 Deploying BatchTransfer contract...');
  
  // Get the deployer account
  const [deployer] = await ethers.getSigners();
  console.log('📝 Deploying with account:', deployer.address);
  
  // Deploy the contract
  const BatchTransfer = await ethers.getContractFactory('BatchTransfer');
  const batchTransfer = await BatchTransfer.deploy();
  
  await batchTransfer.waitForDeployment();
  
  const contractAddress = await batchTransfer.getAddress();
  console.log('✅ BatchTransfer deployed to:', contractAddress);
  
  // Verify the contract (optional)
  console.log('🔍 Contract verification would go here...');
  
  return contractAddress;
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Deployment failed:', error);
    process.exit(1);
  });