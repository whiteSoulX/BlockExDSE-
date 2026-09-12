import { useState, useEffect, useCallback } from "react";
import { Card, Button, Input, Select, Badge, Table, EmptyRow } from "./ui";

const ORDER_TYPES = ["BUY", "SELL"];

export default function EdgeLayerPanel({ wallet, edgeNodes, notify }) {
  const { nodes } = edgeNodes;
  const [nodeIndex, setNodeIndex] = useState(0);
  const node = nodes[nodeIndex];

  const [trader, setTrader] = useState(wallet.account || "");
  const [ticker, setTicker] = useState("DSEX");
  const [orderType, setOrderType] = useState("BUY");
  const [quantity, setQuantity] = useState("100");
  const [price, setPrice] = useState("50");
  const [submitting, setSubmitting] = useState(false);

  const [pendingOrders, setPendingOrders] = useState([]);
  const [proposing, setProposing] = useState(false);
  const [lastResult, setLastResult] = useState(null);
  const [log, setLog] = useState([]);

  useEffect(() => {
    if (wallet.account && !trader) setTrader(wallet.account);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallet.account]);

  const addLog = useCallback((message, tone = "info") => {
    setLog((prev) => [{ id: Date.now() + Math.random(), time: new Date().toLocaleTimeString(), message, tone }, ...prev].slice(0, 20));
  }, []);

  const fetchPending = useCallback(async () => {
    if (!node) return;
    try {
      const res = await fetch(`${node.url}/orders/pending`);
      const data = await res.json();
      setPendingOrders(data);
    } catch {
      setPendingOrders([]);
    }
  }, [node]);

  useEffect(() => {
    fetchPending();
    const interval = setInterval(fetchPending, 3000);
    return () => clearInterval(interval);
  }, [fetchPending]);

  async function submitOrder(e) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch(`${node.url}/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trader: trader.trim(),
          ticker: ticker.trim(),
          order_type: orderType,
          quantity: Number(quantity),
          price: Number(price),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Order rejected");
      notify(`Order #${data.id} submitted to edge node ${node.id}`, "success");
      addLog(`Order #${data.id} accepted by node ${node.id} (${orderType} ${quantity} ${ticker} @ ${price})`, "success");
      fetchPending();
    } catch (err) {
      notify(`Edge node rejected order — ${err.message}`, "error");
      addLog(`Order rejected by node ${node.id}: ${err.message}`, "error");
    } finally {
      setSubmitting(false);
    }
  }

  async function proposeBatch() {
    setProposing(true);
    try {
      const res = await fetch(`${node.url}/batch/propose`, { method: "POST" });
      const data = await res.json();
      setLastResult(data);
      const tone = data.status === "approved" ? "success" : "error";
      notify(`Batch ${data.status} — ${data.votes_received ?? 0}/${data.votes_required ?? "?"} votes`, tone);
      addLog(
        `Batch proposed by node ${node.id}: ${data.status} (${data.votes_received ?? 0}/${data.votes_required ?? "?"} votes, ${data.batch_size ?? 0} orders)`,
        tone
      );
      if (data.on_chain?.forwarded) {
        addLog(
          `Forwarded on-chain: ${data.on_chain.orders_placed} order(s) placed, ${data.on_chain.matches_found} match(es) settled — check the Explorer tab`,
          "success"
        );
      } else if (data.on_chain && !data.on_chain.forwarded) {
        addLog(`On-chain forwarding skipped: ${data.on_chain.reason || data.on_chain.error}`, "error");
      }
      fetchPending();
    } catch (err) {
      notify(`Failed to propose batch — ${err.message}`, "error");
    } finally {
      setProposing(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Card title="Edge Nodes" subtitle="Each node runs an independent PBFT-lite validator process">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {nodes.map((n, i) => (
            <button
              key={n.url}
              onClick={() => setNodeIndex(i)}
              className={`flex items-center justify-between rounded-lg border px-3 py-2 text-left transition ${
                i === nodeIndex ? "border-emerald-500 bg-emerald-500/10" : "border-slate-800 hover:bg-slate-800/60"
              }`}
            >
              <div>
                <p className="text-sm text-slate-200">Edge Node {n.id}</p>
                <p className="mono text-[11px] text-slate-500">{n.url}</p>
                <p className="text-[11px] text-slate-500">{n.pendingOrders} pending order(s)</p>
              </div>
              <Badge tone={n.online ? "green" : "red"}>{n.online ? "Online" : "Offline"}</Badge>
            </button>
          ))}
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card
          title={`Submit Order to Node ${node?.id ?? "?"}`}
          subtitle="Validated off-chain first; an approved batch is forwarded on-chain automatically"
        >
          <form onSubmit={submitOrder} className="flex flex-col gap-3">
            <Input label="Trader Address" placeholder="0x…" value={trader} onChange={(e) => setTrader(e.target.value)} required />
            <Input label="Ticker" value={ticker} onChange={(e) => setTicker(e.target.value)} required />
            <Select label="Side" value={orderType} onChange={(e) => setOrderType(e.target.value)}>
              {ORDER_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
            <div className="grid grid-cols-2 gap-3">
              <Input label="Quantity" type="number" min="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} required />
              <Input label="Price" type="number" min="1" value={price} onChange={(e) => setPrice(e.target.value)} required />
            </div>
            <Button type="submit" disabled={submitting || !node?.online}>
              {submitting ? "Submitting…" : "Submit to Edge Node"}
            </Button>
            {!node?.online && <p className="text-xs text-rose-400">Node {node?.id} is offline.</p>}
          </form>
        </Card>

        <Card
          title="Pending Orders"
          subtitle={`Batched on node ${node?.id ?? "?"}, awaiting propose`}
          right={
            <Button variant="subtle" onClick={proposeBatch} disabled={proposing || !node?.online || pendingOrders.length === 0}>
              {proposing ? "Proposing…" : "Propose Batch"}
            </Button>
          }
        >
          <Table headers={["ID", "Trader", "Ticker", "Side", "Qty", "Price"]}>
            {pendingOrders.length === 0 ? (
              <EmptyRow colSpan={6}>No pending orders on this node.</EmptyRow>
            ) : (
              pendingOrders.map((o) => (
                <tr key={o.id} className="border-b border-slate-800/60">
                  <td className="py-2 pr-4 mono">#{o.id}</td>
                  <td className="py-2 pr-4 mono">{o.trader.slice(0, 10)}…</td>
                  <td className="py-2 pr-4">{o.ticker}</td>
                  <td className="py-2 pr-4">
                    <Badge tone={o.order_type === "BUY" ? "green" : "red"}>{o.order_type}</Badge>
                  </td>
                  <td className="py-2 pr-4 mono">{o.quantity}</td>
                  <td className="py-2 pr-4 mono">{o.price}</td>
                </tr>
              ))
            )}
          </Table>

          {lastResult && (
            <div className="mt-4 rounded-lg border border-slate-800 bg-slate-950/60 p-3 text-xs">
              <div className="mb-2 flex items-center gap-2">
                <Badge tone={lastResult.status === "approved" ? "green" : "red"}>{lastResult.status}</Badge>
                <span className="text-slate-500">
                  {lastResult.votes_received ?? 0}/{lastResult.votes_required ?? "?"} votes · batch of{" "}
                  {lastResult.batch_size ?? 0}
                </span>
              </div>
              {lastResult.batch_hash && <p className="mono break-all text-slate-500">hash: {lastResult.batch_hash}</p>}
              {lastResult.on_chain && (
                <div className="mt-2 border-t border-slate-800 pt-2">
                  {lastResult.on_chain.forwarded ? (
                    <>
                      <Badge tone="green">On-chain</Badge>{" "}
                      <span className="text-slate-500">
                        {lastResult.on_chain.orders_placed} order(s) placed ·{" "}
                        {lastResult.on_chain.matches_found} match(es) settled
                      </span>
                    </>
                  ) : (
                    <>
                      <Badge tone="amber">Not forwarded</Badge>{" "}
                      <span className="text-slate-500">{lastResult.on_chain.reason || lastResult.on_chain.error}</span>
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </Card>
      </div>

      <Card title="Activity Log">
        {log.length === 0 ? (
          <p className="text-xs text-slate-600">No activity yet.</p>
        ) : (
          <ul className="flex flex-col gap-1.5 text-xs">
            {log.map((entry) => (
              <li key={entry.id} className="flex gap-2">
                <span className="text-slate-600">{entry.time}</span>
                <span className={entry.tone === "error" ? "text-rose-400" : entry.tone === "success" ? "text-emerald-400" : "text-slate-300"}>
                  {entry.message}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
