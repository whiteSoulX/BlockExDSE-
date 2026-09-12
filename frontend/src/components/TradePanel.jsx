import { useState } from "react";
import { Card, Button, Input, Select, Badge, Table, EmptyRow, shortAddr } from "./ui";
import { getWriteContract, ORDER_TYPE, ORDER_TYPE_LABEL, ORDER_STATUS_LABEL } from "../lib/contract";
import { useTx } from "../hooks/useTx";

const STATUS_TONE = ["amber", "blue", "green", "red"];

export default function TradePanel({ wallet, chainData, notify }) {
  const { account, browserProvider } = wallet;
  const { run, pending } = useTx(notify, chainData.refresh);

  const [ticker, setTicker] = useState("DSEX");
  const [orderType, setOrderType] = useState(String(ORDER_TYPE.BUY));
  const [quantity, setQuantity] = useState("100");
  const [price, setPrice] = useState("50");

  const myOrders = account
    ? chainData.orders.filter((o) => o.trader.toLowerCase() === account.toLowerCase())
    : [];

  async function placeOrder(e) {
    e.preventDefault();
    if (!account) return notify("Connect your wallet first.", "error");
    const signer = await browserProvider.getSigner();
    const contract = getWriteContract(signer);
    await run("Place order", () =>
      contract.placeOrder(ticker.trim(), Number(orderType), BigInt(quantity), BigInt(price))
    );
  }

  async function cancelOrder(orderId) {
    const signer = await browserProvider.getSigner();
    const contract = getWriteContract(signer);
    await run(`Cancel order #${orderId}`, () => contract.cancelOrder(orderId));
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <Card title="Place Order" subtitle="Calls placeOrder() directly on-chain — requires KYC verification" className="lg:col-span-1">
        <form onSubmit={placeOrder} className="flex flex-col gap-3">
          <Input label="Ticker" value={ticker} onChange={(e) => setTicker(e.target.value)} required />
          <Select label="Side" value={orderType} onChange={(e) => setOrderType(e.target.value)}>
            <option value={ORDER_TYPE.BUY}>BUY</option>
            <option value={ORDER_TYPE.SELL}>SELL</option>
          </Select>
          <Input
            label="Quantity"
            type="number"
            min="1"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            required
          />
          <Input
            label="Price (per unit)"
            type="number"
            min="1"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            required
          />
          <Button type="submit" disabled={pending || !account}>
            {pending ? "Submitting…" : "Place Order"}
          </Button>
          {!account && <p className="text-xs text-slate-500">Connect your wallet to place an order.</p>}
        </form>
      </Card>

      <Card title="My Orders" className="lg:col-span-2">
        <Table headers={["ID", "Ticker", "Side", "Qty", "Price", "Status", "Action"]}>
          {myOrders.length === 0 ? (
            <EmptyRow colSpan={7}>{account ? "You have no orders yet." : "Connect your wallet to see your orders."}</EmptyRow>
          ) : (
            myOrders.map((o) => (
              <tr key={o.id} className="border-b border-slate-800/60">
                <td className="py-2 pr-4 mono">#{o.id}</td>
                <td className="py-2 pr-4">{o.ticker}</td>
                <td className="py-2 pr-4">
                  <Badge tone={o.orderType === ORDER_TYPE.BUY ? "green" : "red"}>{ORDER_TYPE_LABEL[o.orderType]}</Badge>
                </td>
                <td className="py-2 pr-4 mono">{o.quantity}</td>
                <td className="py-2 pr-4 mono">{o.price}</td>
                <td className="py-2 pr-4">
                  <Badge tone={STATUS_TONE[o.status]}>{ORDER_STATUS_LABEL[o.status]}</Badge>
                </td>
                <td className="py-2 pr-4">
                  {o.status === 0 ? (
                    <Button variant="danger" className="px-2 py-1 text-xs" onClick={() => cancelOrder(o.id)} disabled={pending}>
                      Cancel
                    </Button>
                  ) : (
                    <span className="text-slate-600">—</span>
                  )}
                </td>
              </tr>
            ))
          )}
        </Table>
      </Card>

      {account && (
        <p className="text-xs text-slate-600 lg:col-span-3">Connected as {shortAddr(account)}.</p>
      )}
    </div>
  );
}
