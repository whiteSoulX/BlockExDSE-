// Deploys BlockExDSE to whatever node --network points at (start.sh uses
// "localhost", i.e. the `hardhat node` started in the previous step) using
// the real Hardhat-compiled artifact, then writes the ABI + address where
// the frontend expects to find them (frontend/src/lib/). This is the
// contract instance the UI drives interactively — separate from the
// artifacts-manual/-based demo in deploy-and-test.js, which proves the full
// lifecycle end-to-end but is not meant to be the instance a human clicks
// through afterward.
const fs = require("fs");
const path = require("path");
const hre = require("hardhat");

async function main() {
  const [admin, ...others] = await hre.ethers.getSigners();

  const Factory = await hre.ethers.getContractFactory("BlockExDSE");
  const contract = await Factory.deploy();
  await contract.waitForDeployment();
  const address = await contract.getAddress();

  console.log("BlockExDSE deployed to:", address);
  console.log("Admin / delegate #1:", admin.address);

  // Convenience for local testing: KYC-verify a handful of the well-known
  // Hardhat test accounts so they can place orders immediately in the UI.
  const toVerify = others.slice(0, 4);
  for (const acct of toVerify) {
    await (await contract.verifyParticipant(acct.address)).wait();
    console.log("KYC-verified test account:", acct.address);
  }

  const network = await hre.ethers.provider.getNetwork();
  const artifact = await hre.artifacts.readArtifact("BlockExDSE");

  const outDir = path.join(__dirname, "../frontend/src/lib");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "contractAbi.json"), JSON.stringify(artifact.abi, null, 2));
  fs.writeFileSync(
    path.join(outDir, "contractAddress.json"),
    JSON.stringify({ address, network: network.name, chainId: Number(network.chainId) }, null, 2)
  );
  console.log("Wrote ABI + address to frontend/src/lib/ for the UI to pick up.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
