import { useState, useEffect, useCallback } from "react";
import { EDGE_NODE_URLS } from "../lib/config";

const POLL_MS = 3000;

export function useEdgeNodes() {
  const [nodes, setNodes] = useState(
    EDGE_NODE_URLS.map((url, i) => ({
      url,
      id: String(i + 1),
      online: false,
      pendingOrders: 0,
    }))
  );

  const refresh = useCallback(async () => {
    const results = await Promise.all(
      EDGE_NODE_URLS.map(async (url, i) => {
        try {
          const res = await fetch(`${url}/health`, { signal: AbortSignal.timeout(2000) });
          if (!res.ok) throw new Error("bad status");
          const data = await res.json();
          return {
            url,
            id: String(data.edge_id ?? i + 1),
            online: true,
            pendingOrders: data.pending_orders ?? 0,
          };
        } catch {
          return { url, id: String(i + 1), online: false, pendingOrders: 0 };
        }
      })
    );
    setNodes(results);
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, POLL_MS);
    return () => clearInterval(interval);
  }, [refresh]);

  return { nodes, refresh };
}
