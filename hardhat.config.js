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
    // Fill this in during Month 2 (August) once you deploy to the public testnet.
    // polygonMumbai: {
    //   url: process.env.MUMBAI_RPC_URL || "",
    //   accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
    // },
  },
};
