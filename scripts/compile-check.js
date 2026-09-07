// Standalone compile check using the npm `solc` package.
// Used because the sandbox can't reach binaries.soliditylang.org directly —
// this verifies the contract is valid Solidity before wiring up full Hardhat.
const solc = require("solc");
const fs = require("fs");
const path = require("path");

const contractPath = path.join(__dirname, "../contracts/BlockExDSE.sol");
const source = fs.readFileSync(contractPath, "utf8");

const input = {
  language: "Solidity",
  sources: { "BlockExDSE.sol": { content: source } },
  settings: {
    outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } },
    optimizer: { enabled: true, runs: 200 },
  },
};

const output = JSON.parse(solc.compile(JSON.stringify(input)));

let hasError = false;
if (output.errors) {
  for (const err of output.errors) {
    if (err.severity === "error") {
      hasError = true;
      console.log("ERROR:", err.formattedMessage);
    } else {
      console.log("WARNING:", err.formattedMessage);
    }
  }
}

if (!hasError) {
  const contract = output.contracts["BlockExDSE.sol"]["BlockExDSE"];
  console.log("\n✅ Compiled successfully.");
  console.log("Bytecode size:", contract.evm.bytecode.object.length / 2, "bytes");
  console.log("Number of functions in ABI:", contract.abi.filter(x => x.type === "function").length);
  console.log("Number of events in ABI:", contract.abi.filter(x => x.type === "event").length);

  // Save ABI for reuse by the edge layer and frontend
  const outDir = path.join(__dirname, "../artifacts-manual");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "BlockExDSE.abi.json"), JSON.stringify(contract.abi, null, 2));
  fs.writeFileSync(path.join(outDir, "BlockExDSE.bytecode.txt"), contract.evm.bytecode.object);
  console.log("ABI saved to artifacts-manual/BlockExDSE.abi.json");
} else {
  process.exit(1);
}
