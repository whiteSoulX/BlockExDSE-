import { Badge, Button, shortAddr } from "./ui";
import { CHAIN_NAME } from "../lib/config";

export default function Header({ wallet, roles, tabs, activeTab, onTabChange }) {
  const { account, connecting, connect, disconnect, hasInjectedWallet } = wallet;

  return (
    <header className="sticky top-0 z-40 border-b border-slate-800 bg-slate-950/90 backdrop-blur">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-3 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/15 text-sm font-bold text-emerald-400">
              B
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-100">BlockExDSE</p>
              <p className="text-[11px] text-slate-500">Hybrid exchange prototype</p>
            </div>
            <Badge tone="blue">{CHAIN_NAME}</Badge>
          </div>

          <div className="flex items-center gap-2">
            {account && (
              <div className="hidden items-center gap-1 sm:flex">
                {roles.isAdmin && <Badge tone="amber">Admin</Badge>}
                {roles.isDelegate && <Badge tone="blue">Delegate</Badge>}
                <Badge tone={roles.isKyc ? "green" : "neutral"}>
                  {roles.isKyc ? "KYC Verified" : "Not KYC Verified"}
                </Badge>
              </div>
            )}
            {account ? (
              <Button variant="ghost" onClick={disconnect} title={account}>
                {shortAddr(account)}
              </Button>
            ) : (
              <Button onClick={connect} disabled={connecting}>
                {connecting ? "Connecting…" : hasInjectedWallet ? "Connect Wallet" : "No Wallet Found"}
              </Button>
            )}
          </div>
        </div>

        <nav className="flex flex-wrap gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                activeTab === tab.id
                  ? "bg-emerald-500/15 text-emerald-400"
                  : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>
    </header>
  );
}
