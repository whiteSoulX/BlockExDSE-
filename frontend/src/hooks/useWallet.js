import { useState, useEffect, useCallback, useMemo } from "react";
import { BrowserProvider } from "ethers";

export function useWallet() {
  const [account, setAccount] = useState(null);
  const [chainId, setChainId] = useState(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState("");

  const hasInjectedWallet = typeof window !== "undefined" && !!window.ethereum;

  const refreshChainId = useCallback(async () => {
    if (!window.ethereum) return;
    const id = await window.ethereum.request({ method: "eth_chainId" });
    setChainId(parseInt(id, 16));
  }, []);

  const connect = useCallback(async () => {
    if (!window.ethereum) {
      setError("No wallet found. Install MetaMask (or a compatible wallet) to connect.");
      return;
    }
    setConnecting(true);
    setError("");
    try {
      const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
      setAccount(accounts[0] ?? null);
      await refreshChainId();
    } catch (err) {
      setError(err?.message || "Failed to connect wallet.");
    } finally {
      setConnecting(false);
    }
  }, [refreshChainId]);

  const disconnect = useCallback(() => {
    setAccount(null);
  }, []);

  useEffect(() => {
    if (!window.ethereum) return undefined;

    window.ethereum.request({ method: "eth_accounts" }).then((accounts) => {
      if (accounts[0]) setAccount(accounts[0]);
    });
    refreshChainId();

    const handleAccountsChanged = (accounts) => setAccount(accounts[0] ?? null);
    const handleChainChanged = () => refreshChainId();

    window.ethereum.on?.("accountsChanged", handleAccountsChanged);
    window.ethereum.on?.("chainChanged", handleChainChanged);
    return () => {
      window.ethereum.removeListener?.("accountsChanged", handleAccountsChanged);
      window.ethereum.removeListener?.("chainChanged", handleChainChanged);
    };
  }, [refreshChainId]);

  const browserProvider = useMemo(() => {
    if (!hasInjectedWallet) return null;
    return new BrowserProvider(window.ethereum);
  }, [hasInjectedWallet]);

  return {
    account,
    chainId,
    connecting,
    error,
    connect,
    disconnect,
    hasInjectedWallet,
    browserProvider,
  };
}
