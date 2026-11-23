/** Minimal Hardhat config: compile + local node only (deploy is done from Python).
 *  BLOCK_TIME_MS=500 makes the local chain mine one block every 500 ms (like a real chain) instead of instantly. */
const bt = parseInt(process.env.BLOCK_TIME_MS || "0", 10);
module.exports = {
  solidity: {
    version: "0.8.20",
    settings: { optimizer: { enabled: true, runs: 200 }, evmVersion: "paris" },
  },
  networks: {
    hardhat: {
      chainId: 31337,
      // without this the local chain's clock runs one second ahead per block when blocks come faster than one a second,
      // and signed orders would then look expired to the contract
      allowBlocksWithSameTimestamp: true,
      mining: bt > 0 ? { auto: false, interval: bt } : { auto: true },
    },
  },
};
