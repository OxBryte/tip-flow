const hre = require("hardhat");

async function main() {
  console.log("Deploying EcionBatch contract...");
  
  const EcionBatch = await hre.ethers.getContractFactory("EcionBatch");
  const ecionBatch = await EcionBatch.deploy();
  
  await ecionBatch.waitForDeployment();
  
  const address = await ecionBatch.getAddress();
  console.log("EcionBatch deployed to:", address);
  
  // Transfer ownership to backend wallet
  const backendWallet = "0x1d70a1425D7B5411fDBC6D99921a51514b358CC3";
  await ecionBatch.transferOwnership(backendWallet);
  console.log("Ownership transferred to:", backendWallet);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });