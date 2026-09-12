import { useState, useMemo } from "react";
import { Card, Button, Input, Select, Badge, shortAddr } from "./ui";
import { getWriteContract, getReadContract, ORDER_TYPE } from "../lib/contract";
import { useTx } from "../hooks/useTx";

async function sha256Hex(text) {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `0x${hex}`;
}

export default function DelegatePanel({ wallet, chainData, notify }) {
  const { account, browserProvider } = wallet;
  const { run, pending } = useTx(notify, chainData.refresh);
  const isDelegate = chainData.isDelegate;

  const pendingBuys = chainData.orders.filter((o) => o.status === 0 && o.orderType === ORDER_TYPE.BUY);
  const pendingSells = chainData.orders.filter((o) => o.status === 0 && o.orderType === ORDER_TYPE.SELL);

  const settledMatchIds = useMemo(
    () => new Set(chainData.settlements.map((s) => s.matchId)),
    [chainData.settlements]
  );
  const unsettledMatches = chainData.matches.filter((m) => !settledMatchIds.has(m.id));

  const [buyOrderId, setBuyOrderId] = useState("");
  const [sellOrderId, setSellOrderId] = useState("");
  const [matchedPrice, setMatchedPrice] = useState("");
  const [matchedQty, setMatchedQty] = useState("");

  const [matchId, setMatchId] = useState("");
  const [offChainJson, setOffChainJson] = useState('{\n  "note": "off-chain order book snapshot"\n}');
  const [offChainHash, setOffChainHash] = useState("");
  const [computing, setComputing] = useState(false);

  const [verifySettlementId, setVerifySettlementId] = useState("");
  const [verifyHash, setVerifyHash] = useState("");
  const [verifyResult, setVerifyResult] = useState(null);
  const [verifying, setVerifying] = useState(false);

  async function recordMatch(e) {
    e.preventDefault();
    const signer = await browserProvider.getSigner();
    const contract = getWriteContract(signer);
    const ok = await run("Record match", () =>
      contract.recordMatch(buyOrderId, sellOrderId, BigInt(matchedPrice), BigInt(matchedQty))
    );
    if (ok) {
      setBuyOrderId("");
      setSellOrderId("");
      setMatchedPrice("");
      setMatchedQty("");
    }
  }

  async function computeHash() {
    setComputing(true);
    try {
      setOffChainHash(await sha256Hex(offChainJson));
    } finally {
      setComputing(false);
    }
  }

  async function settleTrade(e) {
    e.preventDefault();
    if (!offChainHash) return notify("Compute or paste an off-chain hash first.", "error");
    const signer = await browserProvider.getSigner();
    const contract = getWriteContract(signer);
    const ok = await run("Settle trade", () => contract.settleTrade(matchId, offChainHash));
    if (ok) {
      setMatchId("");
      setOffChainHash("");
    }
  }

  async function verifyHashAnchor(e) {
    e.preventDefault();
    setVerifying(true);
    setVerifyResult(null);
    try {
      const contract = getReadContract();
      const ok = await contract.verifyOffChainHash(verifySettlementId, verifyHash.trim());
      setVerifyResult(ok);
    } catch (err) {
      notify(`Verification failed — ${err.message}`, "error");
    } finally {
      setVerifying(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {!isDelegate && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          Only elected delegates can record matches or settle trades. Ask an admin to add your address as a
          delegate first.
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card title="Record Match" subtitle="Submit a matched buy/sell pair (simplified CDA result)">
          <form onSubmit={recordMatch} className="flex flex-col gap-3">
            <Select label="Buy Order" value={buyOrderId} onChange={(e) => setBuyOrderId(e.target.value)} required>
              <option value="">Select a pending BUY order…</option>
              {pendingBuys.map((o) => (
                <option key={o.id} value={o.id}>
                  #{o.id} · {o.ticker} · {o.quantity} @ {o.price} · {shortAddr(o.trader)}
                </option>
              ))}
            </Select>
            <Select label="Sell Order" value={sellOrderId} onChange={(e) => setSellOrderId(e.target.value)} required>
              <option value="">Select a pending SELL order…</option>
              {pendingSells.map((o) => (
                <option key={o.id} value={o.id}>
                  #{o.id} · {o.ticker} · {o.quantity} @ {o.price} · {shortAddr(o.trader)}
                </option>
              ))}
            </Select>
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Matched Price"
                type="number"
                min="1"
                value={matchedPrice}
                onChange={(e) => setMatchedPrice(e.target.value)}
                required
              />
              <Input
                label="Matched Quantity"
                type="number"
                min="1"
                value={matchedQty}
                onChange={(e) => setMatchedQty(e.target.value)}
                required
              />
            </div>
            <Button type="submit" disabled={pending || !buyOrderId || !sellOrderId}>
              {pending ? "Submitting…" : "Record Match"}
            </Button>
          </form>
        </Card>

        <Card title="Settle Trade" subtitle="Finalizes a match and anchors an off-chain record hash">
          <form onSubmit={settleTrade} className="flex flex-col gap-3">
            <Select label="Match" value={matchId} onChange={(e) => setMatchId(e.target.value)} required>
              <option value="">Select an unsettled match…</option>
              {unsettledMatches.map((m) => (
                <option key={m.id} value={m.id}>
                  #{m.id} · buy #{m.buyOrderId} / sell #{m.sellOrderId} · {m.matchedQuantity} @ {m.matchedPrice}
                </option>
              ))}
            </Select>
            <label className="flex flex-col gap-1 text-xs text-slate-400">
              <span>Off-chain record (D2/D5/D6) — hashed client-side, only the hash goes on-chain</span>
              <textarea
                rows={3}
                value={offChainJson}
                onChange={(e) => setOffChainJson(e.target.value)}
                className="mono rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-xs text-slate-100 outline-none focus:border-emerald-500"
              />
            </label>
            <div className="flex gap-2">
              <Button type="button" variant="subtle" onClick={computeHash} disabled={computing}>
                {computing ? "Hashing…" : "Compute SHA-256"}
              </Button>
            </div>
            <Input
              label="Off-chain Hash"
              placeholder="0x…"
              value={offChainHash}
              onChange={(e) => setOffChainHash(e.target.value)}
              className="mono"
              required
            />
            <Button type="submit" disabled={pending || !matchId}>
              {pending ? "Submitting…" : "Settle Trade"}
            </Button>
          </form>
        </Card>
      </div>

      <Card title="Verify Hash Anchor" subtitle="Confirm a settlement's off-chain record matches its on-chain anchor (Parameter P9)">
        <form onSubmit={verifyHashAnchor} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="w-32">
            <Input
              label="Settlement ID"
              type="number"
              min="1"
              value={verifySettlementId}
              onChange={(e) => setVerifySettlementId(e.target.value)}
              required
            />
          </div>
          <div className="flex-1">
            <Input
              label="Recomputed Hash"
              placeholder="0x…"
              className="mono"
              value={verifyHash}
              onChange={(e) => setVerifyHash(e.target.value)}
              required
            />
          </div>
          <Button type="submit" variant="subtle" disabled={verifying}>
            {verifying ? "Checking…" : "Verify"}
          </Button>
        </form>
        {verifyResult !== null && (
          <div className="mt-3">
            <Badge tone={verifyResult ? "green" : "red"}>{verifyResult ? "✓ Hash matches" : "✗ Hash does not match"}</Badge>
          </div>
        )}
      </Card>
    </div>
  );
}
