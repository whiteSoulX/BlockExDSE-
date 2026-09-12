// Deploys BlockExDSE and writes a deployment descriptor (address + ABI +
// delegate list) that the Python edge layer reads on startup, so the
// address and ABI are never copied by hand between the two halves of the
// system. Works against any network configured in hardhat.config.js:
//
//   npx hardhat run scripts/deploy.js --network hardhat     (local demo)
//   npx hardhat run scripts/deploy.js --network sepolia     (public testnet)
//
// Extra delegates (beyond the deployer, who is delegate #1) can be added by
// setting DELEGATE_ADDRESSES="0xabc...,0xdef..." before running.
const fs = require("fs");
const path = require("path");
const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();

  console.log("Deploying BlockExDSE from", deployer.address, "on network", hre.network.name);
  const Factory = await hre.ethers.getContractFactory("BlockExDSE");
  const contract = await Factory.deploy();
  await contract.waitForDeployment();
  const address = await contract.getAddress();
  console.log("Deployed at:", address);

  let extraDelegates = (process.env.DELEGATE_ADDRESSES || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  // Local convenience: on the hardhat/localhost dev networks, default to
  // wiring up signer #1 and #2 as the other two edge-node delegates so a
  // fresh `npx hardhat run scripts/deploy.js` gives a working 3-delegate
  // demo without anyone hand-copying addresses.
  if (extraDelegates.length === 0 && ["hardhat", "localhost"].includes(hre.network.name)) {
    const signers = await hre.ethers.getSigners();
    extraDelegates = [signers[1].address, signers[2].address];
    console.log("No DELEGATE_ADDRESSES set; defaulting to local signers #1 and #2 for the demo.");
  }

  for (const addr of extraDelegates) {
    console.log("Adding delegate:", addr);
    await (await contract.addDelegate(addr)).wait();
  }

  const quorum = extraDelegates.length > 0 ? Math.floor((extraDelegates.length + 1) / 2) + 1 : 1;
  if (quorum > 1) {
    console.log("Setting quorumVotes to", quorum, "for", extraDelegates.length + 1, "delegates");
    await (await contract.setQuorumVotes(quorum)).wait();
  }

  const artifact = await hre.artifacts.readArtifact("BlockExDSE");
  const descriptor = {
    network: hre.network.name,
    chainId: (await hre.ethers.provider.getNetwork()).chainId.toString(),
    address,
    deployer: deployer.address,
    delegates: [deployer.address, ...extraDelegates],
    quorumVotes: quorum,
    abi: artifact.abi,
    deployedAt: new Date().toISOString(),
  };

  const outPath = path.join(__dirname, "..", "deployment.json");
  fs.writeFileSync(outPath, JSON.stringify(descriptor, null, 2));
  console.log("Deployment descriptor written to", outPath);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
