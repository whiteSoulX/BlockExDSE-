require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

const SEPOLIA_RPC_URL = process.env.SEPOLIA_RPC_URL || "";
const DEPLOYER_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY || "";

/** @type {import('hardhat/config').HardhatUserConfig} */
module.exports = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: { enabled: true, runs: 200 },
    },
  },
  networks: {
    hardhat: {
      // Auto-mines a block every 3s in addition to on every transaction, so
      // the risk-adaptive FAST-tier challenge window elapses in real
      // wall-clock time during a live demo (idle Hardhat networks otherwise
      // only mine on incoming transactions). Set HARDHAT_MINING_INTERVAL_MS=0
      // to disable and go back to transaction-only mining.
      mining: {
        auto: true,
        interval: process.env.HARDHAT_MINING_INTERVAL_MS === "0"
          ? undefined
          : Number(process.env.HARDHAT_MINING_INTERVAL_MS || 3000),
      },
    },
    // The standalone `npx hardhat node` process exposes the network above
    // over JSON-RPC at 127.0.0.1:8545; `--network localhost` targets that
    // running process instead of spinning up an ephemeral in-process chain.
    localhost: {
      url: "http://127.0.0.1:8545",
    },
    // Used only inside docker-compose, where the standalone Hardhat
    // container is reachable by its service name rather than 127.0.0.1.
    docker: {
      url: process.env.HARDHAT_DOCKER_RPC_URL || "http://hardhat:8545",
    },
    // Public testnet deployment target for the live demo. Requires a
    // funded (faucet) account — see README "Public testnet deployment".
    sepolia: {
      url: SEPOLIA_RPC_URL,
      accounts: DEPLOYER_PRIVATE_KEY ? [DEPLOYER_PRIVATE_KEY] : [],
    },
  },
};
