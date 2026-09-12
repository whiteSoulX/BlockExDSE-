import contractAddressLocal from "./contractAddress.json";

export const RPC_URL = import.meta.env.VITE_RPC_URL || "http://127.0.0.1:8545";

export const CHAIN_NAME = import.meta.env.VITE_CHAIN_NAME || "Hardhat Local";

// scripts/deploy-local.js writes contractAddress.json on every local deploy.
// A real deployment should set VITE_CONTRACT_ADDRESS at build time instead.
export const CONTRACT_ADDRESS =
  import.meta.env.VITE_CONTRACT_ADDRESS || contractAddressLocal.address || "";

export const EDGE_NODE_URLS = (
  import.meta.env.VITE_EDGE_NODE_URLS ||
  "http://127.0.0.1:9001,http://127.0.0.1:9002,http://127.0.0.1:9003"
)
  .split(",")
  .map((url) => url.trim())
  .filter(Boolean);
