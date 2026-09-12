import { useState, useEffect, useCallback } from "react";
import { getReadContract } from "../lib/contract";

const POLL_MS = 4000;

export function useContractData(account) {
  const [admin, setAdmin] = useState(null);
  const [isDelegate, setIsDelegate] = useState(false);
  const [isKyc, setIsKyc] = useState(false);
  const [orders, setOrders] = useState([]);
  const [matches, setMatches] = useState([]);
  const [settlements, setSettlements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [contractReady, setContractReady] = useState(false);

  const refresh = useCallback(async () => {
    const contract = getReadContract();
    if (!contract) {
      setContractReady(false);
      setLoading(false);
      return;
    }
    setContractReady(true);
    try {
      const [adminAddr, nextOrderId, nextMatchId, nextSettlementId] = await Promise.all([
        contract.admin(),
        contract.nextOrderId(),
        contract.nextMatchId(),
        contract.nextSettlementId(),
      ]);
      setAdmin(adminAddr);

      if (account) {
        const [delegate, kyc] = await Promise.all([
          contract.delegates(account),
          contract.kycVerified(account),
        ]);
        setIsDelegate(delegate);
        setIsKyc(kyc);
      } else {
        setIsDelegate(false);
        setIsKyc(false);
      }

      const orderIds = range(Number(nextOrderId) - 1);
      const matchIds = range(Number(nextMatchId) - 1);
      const settlementIds = range(Number(nextSettlementId) - 1);

      const [orderResults, matchResults, settlementResults] = await Promise.all([
        Promise.all(orderIds.map((id) => contract.getOrder(id))),
        Promise.all(matchIds.map((id) => contract.matches(id))),
        Promise.all(settlementIds.map((id) => contract.getSettlement(id))),
      ]);

      setOrders(orderResults.map(normalizeOrder).reverse());
      setMatches(matchResults.map(normalizeMatch).reverse());
      setSettlements(settlementResults.map(normalizeSettlement).reverse());
    } catch (err) {
      console.error("Failed to refresh contract data:", err);
    } finally {
      setLoading(false);
    }
  }, [account]);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, POLL_MS);
    return () => clearInterval(interval);
  }, [refresh]);

  return { admin, isDelegate, isKyc, orders, matches, settlements, loading, contractReady, refresh };
}

function range(count) {
  return Array.from({ length: Math.max(count, 0) }, (_, i) => i + 1);
}

function normalizeOrder(o) {
  return {
    id: Number(o.id),
    trader: o.trader,
    ticker: o.ticker,
    orderType: Number(o.orderType),
    quantity: Number(o.quantity),
    price: Number(o.price),
    timestamp: Number(o.timestamp),
    status: Number(o.status),
  };
}

function normalizeMatch(m) {
  return {
    id: Number(m.id),
    buyOrderId: Number(m.buyOrderId),
    sellOrderId: Number(m.sellOrderId),
    matchedPrice: Number(m.matchedPrice),
    matchedQuantity: Number(m.matchedQuantity),
    timestamp: Number(m.timestamp),
  };
}

function normalizeSettlement(s) {
  return {
    id: Number(s.id),
    matchId: Number(s.matchId),
    buyer: s.buyer,
    seller: s.seller,
    ticker: s.ticker,
    quantity: Number(s.quantity),
    totalAmount: Number(s.totalAmount),
    offChainHash: s.offChainHash,
    blockTimestamp: Number(s.blockTimestamp),
  };
}
