require("@nomicfoundation/hardhat-toolbox");

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
      // local in-memory chain — used for team dev and unit tests
    },
    // start.sh / scripts/deploy-local.js target this to persist state across
    // the separate hardhat-node and deploy processes (still local-only).
    localhost: {
      url: "http://127.0.0.1:8545",
    },
    // Uncomment to deploy to a public testnet (e.g. for a cloud deployment
    // reachable by more than one machine). Set SEPOLIA_RPC_URL (from a
    // provider such as Infura/Alchemy/Ankr) and PRIVATE_KEY as environment
    // variables — never commit them. Polygon Mumbai is deprecated; Sepolia
    // is the current standard Ethereum testnet.
    // sepolia: {
    //   url: process.env.SEPOLIA_RPC_URL || "",
    //   accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
    // },
  },
};
