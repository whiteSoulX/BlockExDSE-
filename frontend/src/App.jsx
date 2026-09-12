import { useState, useCallback } from "react";
import Header from "./components/Header";
import Toasts from "./components/Toasts";
import Overview from "./components/Overview";
import TradePanel from "./components/TradePanel";
import AdminPanel from "./components/AdminPanel";
import DelegatePanel from "./components/DelegatePanel";
import Explorer from "./components/Explorer";
import EdgeLayerPanel from "./components/EdgeLayerPanel";
import { useWallet } from "./hooks/useWallet";
import { useContractData } from "./hooks/useContractData";
import { useEdgeNodes } from "./hooks/useEdgeNodes";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "trade", label: "Trade" },
  { id: "admin", label: "Admin" },
  { id: "delegate", label: "Delegate" },
  { id: "explorer", label: "Explorer" },
  { id: "edge", label: "Edge Layer" },
];

export default function App() {
  const [activeTab, setActiveTab] = useState("overview");
  const [toasts, setToasts] = useState([]);

  const wallet = useWallet();
  const chainData = useContractData(wallet.account);
  const edgeNodes = useEdgeNodes();

  const notify = useCallback((message, tone = "info") => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message, tone }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), tone === "error" ? 7000 : 4500);
  }, []);

  const dismissToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const roles = {
    isAdmin: !!(wallet.account && chainData.admin && wallet.account.toLowerCase() === chainData.admin.toLowerCase()),
    isDelegate: chainData.isDelegate,
    isKyc: chainData.isKyc,
  };

  return (
    <div className="min-h-screen bg-slate-950">
      <Header wallet={wallet} roles={roles} tabs={TABS} activeTab={activeTab} onTabChange={setActiveTab} />

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        {wallet.error && (
          <div className="mb-4 rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            {wallet.error}
          </div>
        )}

        {activeTab === "overview" && (
          <Overview chainData={chainData} edgeNodes={edgeNodes} onGoToEdgeLayer={() => setActiveTab("edge")} />
        )}
        {activeTab === "trade" && <TradePanel wallet={wallet} chainData={chainData} notify={notify} />}
        {activeTab === "admin" && <AdminPanel wallet={wallet} chainData={chainData} notify={notify} />}
        {activeTab === "delegate" && <DelegatePanel wallet={wallet} chainData={chainData} notify={notify} />}
        {activeTab === "explorer" && <Explorer chainData={chainData} />}
        {activeTab === "edge" && <EdgeLayerPanel wallet={wallet} edgeNodes={edgeNodes} notify={notify} />}
      </main>

      <Toasts toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
