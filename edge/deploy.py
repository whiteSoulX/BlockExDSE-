"""Deploy one BlockExDSE contract per market, configure validators and market rules, seed demo traders."""
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import signing as S  # noqa: E402
from contract_client import DEPLOYMENT, Chain, ContractClient, load_artifact  # noqa: E402
from markets import MARKETS, band_bps  # noqa: E402

MAINNETS = {1, 10, 56, 137, 8453, 42161, 43114}      # real-money chains: blocked unless explicitly overridden
TRADER_NAMES = ["Alice", "Bob", "Carol", "Dave", "Erin", "Frank"]
VALIDATOR_IDS = list(range(1, S.N_VALIDATORS + 1))


def edge_address(i: int) -> str:
    return S.address_of(S.edge_key(i))


def trader_address(name: str) -> str:
    """Deterministic demo wallets. Their keys are demo keys: the dashboard signs orders with them in the browser."""
    return S.address_of(S.demo_trader_key(name))


def main():
    chain = Chain.get()
    info = chain.info()
    print(f"Chain: {info['name']} (id {info['id']}), mode {info['mode']}, admin {info['admin']}")
    if info["id"] in MAINNETS and os.getenv("ALLOW_MAINNET") != "yes-i-understand":
        sys.exit(f"Refusing to deploy a demo exchange to a real-money network (chain id {info['id']}). Use a test network.")
    art = load_artifact()
    C = chain.w3.eth.contract(abi=art["abi"], bytecode=art["bytecode"])
    contracts = {}
    for code in MARKETS:
        rcpt, _ = chain.send(C.constructor())
        contracts[code] = rcpt["contractAddress"]
        print(f"[{code}] contract deployed at {contracts[code]} (gas {rcpt['gasUsed']})")
    # write a first version so ContractClient can load the contracts
    DEPLOYMENT.write_text(json.dumps({"contracts": contracts, "abi": art["abi"]}), encoding="utf-8")

    validators = [edge_address(i) for i in VALIDATOR_IDS]
    compliance = S.address_of(S.compliance_key())
    traders = [{"name": n, "address": trader_address(n)} for n in TRADER_NAMES]
    for code, cfg in MARKETS.items():
        cl = ContractClient(code)
        cl.set_validators(validators)                        # the only keys whose signatures count as attestations
        cl.set_compliance(compliance)
        cl.set_risk_notional(cfg["risk_notional"])
        for sym, meta in cfg["tickers"].items():             # reference price and band live on-chain: anyone can audit them
            cl.set_ticker(sym, meta["ref"], band_bps(cfg, meta["ref"]))
        seeded = [t for t in traders if t["name"] in ("Dave", "Erin", "Frank")] if cfg.get("hidden") else list(traders)
        seeded += [{"name": n, "address": trader_address(n)} for n in cfg.get("restricted", [])]
        for t in seeded:
            cl.register_trader(t["address"], cfg["demo_cash"])
            for sym in cfg["tickers"]:
                cl.credit_shares(t["address"], sym, cfg["demo_shares"])
        print(f"[{code}] {len(validators)} validators, {len(cfg['tickers'])} tickers, {len(seeded)} KYC demo traders")

    DEPLOYMENT.write_text(json.dumps({
        "contracts": contracts, "admin": info["admin"], "abi": art["abi"], "traders": traders,
        "edge_nodes": {str(i): edge_address(i) for i in VALIDATOR_IDS}, "compliance": compliance,
        "chain": {"id": info["id"], "name": info["name"]},
    }, indent=2), encoding="utf-8")
    print(f"Wrote {DEPLOYMENT}")


if __name__ == "__main__":
    main()
