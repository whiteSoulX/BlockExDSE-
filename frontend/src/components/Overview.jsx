import { Card, StatCard, Badge, shortAddr } from "./ui";
import { CONTRACT_ADDRESS, RPC_URL } from "../lib/config";

export default function Overview({ chainData, edgeNodes, onGoToEdgeLayer }) {
  const { admin, orders, matches, settlements, contractReady } = chainData;
  const onlineCount = edgeNodes.nodes.filter((n) => n.online).length;

  return (
    <div className="flex flex-col gap-6">
      {!contractReady && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          No contract address configured. Run <code className="mono">./start.sh</code> (or{" "}
          <code className="mono">npx hardhat run scripts/deploy-local.js --network localhost</code>) to deploy
          the contract, or set <code className="mono">VITE_CONTRACT_ADDRESS</code> for a live deployment.
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Total Orders" value={orders.length} />
        <StatCard label="Total Matches" value={matches.length} />
        <StatCard label="Total Settlements" value={settlements.length} />
        <StatCard
          label="Edge Layer"
          value={`${onlineCount}/${edgeNodes.nodes.length} online`}
          hint="PBFT-lite consensus cluster"
        />
      </div>

      <Card title="Blockchain Layer">
        <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs text-slate-500">Contract Address</dt>
            <dd className="mono mt-0.5 break-all text-slate-200">{CONTRACT_ADDRESS || "— not deployed —"}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">RPC URL</dt>
            <dd className="mono mt-0.5 break-all text-slate-200">{RPC_URL}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Admin / Delegate #1</dt>
            <dd className="mono mt-0.5 break-all text-slate-200">{admin ? shortAddr(admin) : "—"}</dd>
          </div>
        </dl>
      </Card>

      <Card
        title="Edge Layer"
        subtitle="3-node PBFT-lite consensus cluster (off-chain order validation)"
        right={
          <button onClick={onGoToEdgeLayer} className="text-xs font-medium text-emerald-400 hover:underline">
            Open Edge Layer →
          </button>
        }
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {edgeNodes.nodes.map((n) => (
            <div key={n.url} className="flex items-center justify-between rounded-lg border border-slate-800 px-3 py-2">
              <div>
                <p className="text-sm text-slate-200">Edge Node {n.id}</p>
                <p className="mono text-[11px] text-slate-500">{n.url}</p>
              </div>
              <Badge tone={n.online ? "green" : "red"}>{n.online ? "Online" : "Offline"}</Badge>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
