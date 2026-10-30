/** Minimal Hardhat config: compile + local node only (deploy is done from Python). */
module.exports = {
  solidity: {
    version: "0.8.20",
    settings: { optimizer: { enabled: true, runs: 200 }, evmVersion: "paris" },
  },
  networks: {
    hardhat: { chainId: 31337, mining: { auto: true } },
  },
};
