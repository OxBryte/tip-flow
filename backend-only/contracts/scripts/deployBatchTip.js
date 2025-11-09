const hre = require("hardhat");

async function main() {
  console.log("🚀 Deploying EcionBatchTip contract...");
  
  // Get the contract factory
  const EcionBatchTip = await hre.ethers.getContractFactory("EcionBatchTip");
  
  // Deploy the contract
  const batchTip = await EcionBatchTip.deploy();
  await batchTip.waitForDeployment();
  
  const contractAddress = await batchTip.getAddress();
  console.log(`✅ EcionBatchTip deployed to: ${contractAddress}`);
  
  // Transfer ownership to backend wallet
  const backendWallet = process.env.BACKEND_WALLET_ADDRESS;
  if (backendWallet) {
    console.log(`🔄 Transferring ownership to: ${backendWallet}`);
    await batchTip.transferOwnership(backendWallet);
    console.log(`✅ Ownership transferred to: ${backendWallet}`);
  }
  
  console.log("\n📋 Contract Details:");
  console.log(`Address: ${contractAddress}`);
  console.log(`Owner: ${await batchTip.owner()}`);
  
  console.log("\n🔧 Add this to your environment variables:");
  console.log(`BATCH_TIP_CONTRACT_ADDRESS=${contractAddress}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });