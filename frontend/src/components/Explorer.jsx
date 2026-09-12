import { useState, useMemo } from "react";
import { Card, Input, Select, Badge, Table, EmptyRow, shortAddr } from "./ui";
import { ORDER_TYPE, ORDER_TYPE_LABEL, ORDER_STATUS_LABEL } from "../lib/contract";

const STATUS_TONE = ["amber", "blue", "green", "red"];

function fmtTime(ts) {
  if (!ts) return "—";
  return new Date(ts * 1000).toLocaleString();
}

export default function Explorer({ chainData }) {
  const [ticker, setTicker] = useState("");
  const [status, setStatus] = useState("");

  const orders = useMemo(
    () =>
      chainData.orders.filter(
        (o) =>
          (!ticker || o.ticker.toLowerCase().includes(ticker.toLowerCase())) &&
          (status === "" || o.status === Number(status))
      ),
    [chainData.orders, ticker, status]
  );

  const matches = useMemo(() => chainData.matches, [chainData.matches]);

  const settlements = useMemo(
    () =>
      chainData.settlements.filter((s) => !ticker || s.ticker.toLowerCase().includes(ticker.toLowerCase())),
    [chainData.settlements, ticker]
  );

  return (
    <div className="flex flex-col gap-6">
      <Card title="Filters">
        <div className="flex flex-wrap gap-3">
          <Input label="Ticker contains" placeholder="DSEX" value={ticker} onChange={(e) => setTicker(e.target.value)} />
          <Select label="Order status" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All</option>
            {ORDER_STATUS_LABEL.map((label, i) => (
              <option key={label} value={i}>
                {label}
              </option>
            ))}
          </Select>
        </div>
      </Card>

      <Card title="Order Book" subtitle={`${orders.length} order(s)`}>
        <Table headers={["ID", "Trader", "Ticker", "Side", "Qty", "Price", "Status", "Placed"]}>
          {orders.length === 0 ? (
            <EmptyRow colSpan={8}>No orders match the current filters.</EmptyRow>
          ) : (
            orders.map((o) => (
              <tr key={o.id} className="border-b border-slate-800/60">
                <td className="py-2 pr-4 mono">#{o.id}</td>
                <td className="py-2 pr-4 mono">{shortAddr(o.trader)}</td>
                <td className="py-2 pr-4">{o.ticker}</td>
                <td className="py-2 pr-4">
                  <Badge tone={o.orderType === ORDER_TYPE.BUY ? "green" : "red"}>{ORDER_TYPE_LABEL[o.orderType]}</Badge>
                </td>
                <td className="py-2 pr-4 mono">{o.quantity}</td>
                <td className="py-2 pr-4 mono">{o.price}</td>
                <td className="py-2 pr-4">
                  <Badge tone={STATUS_TONE[o.status]}>{ORDER_STATUS_LABEL[o.status]}</Badge>
                </td>
                <td className="py-2 pr-4 text-slate-500">{fmtTime(o.timestamp)}</td>
              </tr>
            ))
          )}
        </Table>
      </Card>

      <Card title="Matches" subtitle={`${matches.length} match(es)`}>
        <Table headers={["ID", "Buy Order", "Sell Order", "Price", "Qty", "Matched At"]}>
          {matches.length === 0 ? (
            <EmptyRow colSpan={6}>No matches recorded yet.</EmptyRow>
          ) : (
            matches.map((m) => (
              <tr key={m.id} className="border-b border-slate-800/60">
                <td className="py-2 pr-4 mono">#{m.id}</td>
                <td className="py-2 pr-4 mono">#{m.buyOrderId}</td>
                <td className="py-2 pr-4 mono">#{m.sellOrderId}</td>
                <td className="py-2 pr-4 mono">{m.matchedPrice}</td>
                <td className="py-2 pr-4 mono">{m.matchedQuantity}</td>
                <td className="py-2 pr-4 text-slate-500">{fmtTime(m.timestamp)}</td>
              </tr>
            ))
          )}
        </Table>
      </Card>

      <Card title="Settlements" subtitle={`${settlements.length} settlement(s)`}>
        <Table headers={["ID", "Match", "Buyer", "Seller", "Ticker", "Qty", "Total", "Off-chain Hash", "Settled At"]}>
          {settlements.length === 0 ? (
            <EmptyRow colSpan={9}>No settlements yet.</EmptyRow>
          ) : (
            settlements.map((s) => (
              <tr key={s.id} className="border-b border-slate-800/60">
                <td className="py-2 pr-4 mono">#{s.id}</td>
                <td className="py-2 pr-4 mono">#{s.matchId}</td>
                <td className="py-2 pr-4 mono">{shortAddr(s.buyer)}</td>
                <td className="py-2 pr-4 mono">{shortAddr(s.seller)}</td>
                <td className="py-2 pr-4">{s.ticker}</td>
                <td className="py-2 pr-4 mono">{s.quantity}</td>
                <td className="py-2 pr-4 mono">{s.totalAmount}</td>
                <td className="py-2 pr-4 mono text-slate-500" title={s.offChainHash}>
                  {s.offChainHash.slice(0, 10)}…
                </td>
                <td className="py-2 pr-4 text-slate-500">{fmtTime(s.blockTimestamp)}</td>
              </tr>
            ))
          )}
        </Table>
      </Card>
    </div>
  );
}
