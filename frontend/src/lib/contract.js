import { Contract, JsonRpcProvider } from "ethers";
import abi from "./contractAbi.json";
import { CONTRACT_ADDRESS, RPC_URL } from "./config";

export const readProvider = new JsonRpcProvider(RPC_URL);

export function getReadContract() {
  if (!CONTRACT_ADDRESS) return null;
  return new Contract(CONTRACT_ADDRESS, abi, readProvider);
}

export function getWriteContract(signer) {
  if (!CONTRACT_ADDRESS || !signer) return null;
  return new Contract(CONTRACT_ADDRESS, abi, signer);
}

export const ORDER_TYPE = { BUY: 0, SELL: 1 };
export const ORDER_TYPE_LABEL = ["BUY", "SELL"];
export const ORDER_STATUS_LABEL = ["PENDING", "MATCHED", "SETTLED", "CANCELLED"];

export function friendlyError(err) {
  const raw =
    err?.shortMessage ||
    err?.reason ||
    err?.info?.error?.message ||
    err?.error?.message ||
    err?.message ||
    "Transaction failed.";
  // ethers/MetaMask messages often look like: "execution reverted: BlockExDSE: ..."
  const match = raw.match(/BlockExDSE:[^"']*/);
  return match ? match[0] : raw;
}
