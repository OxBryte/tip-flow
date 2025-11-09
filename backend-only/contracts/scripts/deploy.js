const hre = require("hardhat");

async function main() {
  console.log("Deploying Tip FlowBatch contract...");
  
  const Tip FlowBatch = await hre.ethers.getContractFactory("Tip FlowBatch");
  const Tip FlowBatch = await Tip FlowBatch.deploy();
  
  await Tip FlowBatch.waitForDeployment();
  
  const address = await Tip FlowBatch.getAddress();
  console.log("Tip FlowBatch deployed to:", address);
  
  // Transfer ownership to backend wallet
  const backendWallet = "0x1d70a1425D7B5411fDBC6D99921a51514b358CC3";
  await Tip FlowBatch.transferOwnership(backendWallet);
  console.log("Ownership transferred to:", backendWallet);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });