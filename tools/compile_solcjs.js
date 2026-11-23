// Fallback compiler for machines where Hardhat cannot download its compiler (uses the solc npm package).
// Usage: npm install --no-save solc@0.8.20 && node tools/compile_solcjs.js
const fs = require("fs"), path = require("path"), solc = require("solc");
const root = path.resolve(__dirname, "..");
const src = fs.readFileSync(path.join(root, "contracts", "BlockExDSE.sol"), "utf8");
const input = { language: "Solidity", sources: { "contracts/BlockExDSE.sol": { content: src } },
  settings: { optimizer: { enabled: true, runs: 200 }, evmVersion: "paris",
    outputSelection: { "*": { "*": ["abi", "evm.bytecode.object", "evm.deployedBytecode.object"] } } } };
const out = JSON.parse(solc.compile(JSON.stringify(input)));
const errs = (out.errors || []).filter(e => e.severity === "error");
(out.errors || []).forEach(e => console.log(e.formattedMessage));
if (errs.length) process.exit(1);
const c = out.contracts["contracts/BlockExDSE.sol"].BlockExDSE;
const dir = path.join(root, "artifacts", "contracts", "BlockExDSE.sol");
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, "BlockExDSE.json"), JSON.stringify({ contractName: "BlockExDSE", abi: c.abi, bytecode: "0x" + c.evm.bytecode.object }, null, 1));
console.log("compiled with solc-js", solc.version(), "| bytecode bytes:", c.evm.bytecode.object.length / 2, "| runtime bytes:", c.evm.deployedBytecode.object.length / 2);
