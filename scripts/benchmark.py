"""
Benchmark for BlockExDSE v2: what do edge validators and the risk rule cost, and what do they protect against?

Run it against a freshly started system (see README). Every configuration processes the SAME seeded order mix on a hidden
test market. The mix is 62% routine, 14% risky but valid, 24% invalid (bad price, unknown ticker, not KYC, an input
error far above the size limit, an account frozen after KYC). The last two break rules that only the edge knows.

Configurations (routine quorum, risky quorum), enforced by the contract:
  chain_only  (0,0)  no edge checks: every order goes straight to the contract (baseline)
  edge_only   (0,0)  one edge check at the gateway, no validator signatures
  fixed3      (3,3)  three validator signatures on every order
  fixed4      (4,4)  four validator signatures on every order
  racd        (3,4)  three for routine orders, four for risky ones   <- BlockExDSE

Scenarios:
  healthy        all four validators honest
  faulty         validator 4 returns useless signatures (a crash-like fault)
  compromisedN   validators 1..N sign without checking (validator 1 is the gateway). N = 1, 2 or 3
  batchK         K orders share one round of signatures and one transaction (K = 5, 20, ...)
  linkM          every other validator answers M milliseconds late (edge sites that are far apart)
  lazyP          quorum-depth experiment: every validator signs WITHOUT checking with probability P% per order, and the
                 order mix holds only orders that break edge rules. Counts how many slip through, next to the
                 number that the binomial model predicts.
  dropP          quorum-depth experiment: every other validator fails to answer with probability P% per request, and the
                 mix holds only valid orders. Counts how many are delayed or lost, next to the predicted number.

Usage:  python scripts/benchmark.py [--n 80] [--reps 3] [--seed 7] [--scenarios healthy,faulty,...] [--label run]
Tip:    for a chain with real block times start the system with  --block-time 250  and use another --label.
Energy: on Linux, if /sys/class/powercap/intel-rapl:0/energy_uj is readable by the gateway process, joules are recorded.
"""
import argparse
import csv
import json
import os
import platform
import statistics
import sys
import time
from datetime import datetime

from _client import call, login

MODES = {"healthy": ["chain_only", "edge_only", "fixed3", "fixed4", "racd"], "faulty": ["fixed3", "fixed4", "racd"],
         "compromised": ["edge_only", "fixed3", "fixed4", "racd"], "batch": ["fixed3", "fixed4", "racd"], "link": ["fixed3", "fixed4", "racd"],
         "lazy": ["fixed3", "fixed4", "racd"], "drop": ["fixed3", "fixed4", "racd"]}
DEFAULT = "healthy,faulty,compromised1,compromised2,compromised3,batch5,batch20,link10"


def p_slip(p, q):
    """Chance that an order which breaks an edge rule collects q signatures when each of the 4 validators (the gateway
    first) is careless with probability p: the gateway must be careless, and q-1 of the other 3 as well."""
    return {0: 1.0, 3: p * (3 * p * p * (1 - p) + p ** 3), 4: p ** 4}[q]


def p_short(c, q):
    """Chance that a valid order misses its quorum when each of the 3 other validators fails to answer with probability c."""
    return {0: 0.0, 3: 3 * c * c * (1 - c) + c ** 3, 4: 1 - (1 - c) ** 3}[q]


def run_job(admin, modes, n, seed, label, batch=1, compromised=0, p_lazy=0.0, p_drop=0.0, mix="standard"):
    s, j = call("/api/admin/bench/start", dict(modes=modes, n=n, seed=seed, label=label, batch=batch, compromised=compromised,
                                               p_lazy=p_lazy, p_drop=p_drop, mix=mix), token=admin)
    if s != 200:
        sys.exit(f"Could not start the benchmark: {j}")
    jid, last = j["job"], ""
    while True:
        time.sleep(1.0)
        _, st = call(f"/api/admin/bench/{jid}", token=admin)
        if st["progress"] != last:
            last = st["progress"]
            print(f"    running {last} ...", flush=True)
        if st["state"] == "done":
            return st["results"]
        if st["state"] == "error":
            sys.exit(f"Benchmark failed: {st.get('error')}")


def mean(rows, key):
    vals = [r[key] for r in rows if r.get(key) is not None]
    return statistics.mean(vals) if vals else None


def fmt(v, nd=1):
    return "-" if v is None else (f"{v:,.{nd}f}" if isinstance(v, float) else f"{v:,}")


def show(title, header, lines):
    print(f"\n{title}")
    widths = [max(len(str(x)) for x in col) for col in zip(header, *lines)]
    f = "  ".join(f"{{:<{w}}}" for w in widths)
    print(f.format(*header))
    print(f.format(*["-" * w for w in widths]))
    for ln in lines:
        print(f.format(*[str(x) for x in ln]))


def parse(sc):
    for kind in ("compromised", "batch", "link", "lazy", "drop"):
        if sc.startswith(kind) and sc[len(kind):].isdigit():
            return kind, int(sc[len(kind):])
    if sc in ("healthy", "faulty"):
        return sc, 0
    sys.exit(f"Unknown scenario: {sc}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--n", type=int, default=80, help="orders per configuration")
    ap.add_argument("--n-mc", type=int, default=300, help="orders per configuration in the lazyP and dropP experiments")
    ap.add_argument("--reps", type=int, default=3, help="repeats with different seeds")
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--scenarios", default=DEFAULT)
    ap.add_argument("--modes", default="", help="optional: limit to these configurations, comma-separated")
    ap.add_argument("--label", default="run")
    ap.add_argument("--out", default="benchmark_results")
    a = ap.parse_args()
    only = [m for m in a.modes.split(",") if m]

    admin = login("admin@blockexdse.demo", "Admin@123")
    _, info = call("/api/info")
    chain = info["chain"]
    bt = chain.get("block_time_ms", 0)
    print(f"Chain: {chain['name']} (id {chain['id']}), {'one block every ' + str(bt) + ' ms' if bt else 'a block per transaction (instant)'}")
    print(f"Signature library: {info.get('crypto')}  |  validators: {info.get('validators')}  |  orders per configuration: {a.n}, repeats: {a.reps}")

    rows = []
    for sc in a.scenarios.split(","):
        kind, arg = parse(sc)
        modes = [m for m in MODES[kind] if not only or m in only]
        print(f"\n== scenario {sc} ==")
        if kind == "faulty":
            call("/api/fault/4/on", token=admin, method="POST")
        if kind == "link":
            call(f"/api/admin/link/{arg}", token=admin, method="POST")
        try:
            for rep in range(a.reps):
                print(f"  repeat {rep + 1} of {a.reps} (seed {a.seed + rep})")
                if kind in ("lazy", "drop"):
                    res = run_job(admin, modes, a.n_mc, a.seed + rep, a.label, p_lazy=arg / 100 if kind == "lazy" else 0.0,
                                  p_drop=arg / 100 if kind == "drop" else 0.0, mix="edge_invalid" if kind == "lazy" else "valid")
                else:
                    res = run_job(admin, modes, a.n, a.seed + rep, a.label, batch=arg if kind == "batch" else 1,
                                  compromised=arg if kind == "compromised" else 0)
                rows += [{"scenario": sc, "rep": rep + 1, **r} for r in res]
        finally:
            if kind == "faulty":
                call("/api/fault/4/off", token=admin, method="POST")
            if kind == "link":
                call("/api/admin/link/0", token=admin, method="POST")

    def cell(sc, mode):
        return [r for r in rows if r["scenario"] == sc and r["mode"] == mode]

    scs = a.scenarios.split(",")
    for sc in scs:
        kind, arg = parse(sc)
        modes = [m for m in MODES[kind] if cell(sc, m)]
        if kind in ("healthy", "batch", "link"):
            show(f"{sc}: speed and cost (mean of {a.reps} runs)",
                 ["configuration", "orders/s", "mean ms", "p95 ms", "sign ms", "entry gas", "gas/accepted", "tx", "signatures/accepted", "peer requests", "gateway CPU ms/order", "validators CPU ms/order", "joules"],
                 [[m, fmt(mean(cell(sc, m), "throughput_ops"), 2), fmt(mean(cell(sc, m), "lat_mean_ms")), fmt(mean(cell(sc, m), "lat_p95_ms")),
                   fmt(mean(cell(sc, m), "attest_ms_mean"), 2), fmt(mean(cell(sc, m), "gas_place_mean"), 0), fmt(mean(cell(sc, m), "gas_per_accepted"), 0),
                   fmt(mean(cell(sc, m), "tx_total"), 0), fmt(mean(cell(sc, m), "sigs_per_accepted"), 2), fmt(mean(cell(sc, m), "peer_requests"), 0),
                   fmt(mean(cell(sc, m), "cpu_gateway_ms_per_order"), 2), fmt(mean(cell(sc, m), "cpu_validators_ms_per_order"), 2),
                   fmt(mean(cell(sc, m), "energy_j"), 1)] for m in modes])
        if kind in ("healthy", "compromised"):
            show(f"{sc}: invalid orders (mean of {a.reps} runs)",
                 ["configuration", "invalid sent", "reached ledger", "value on ledger", "stopped at gateway", "stopped by validators", "stopped by contract", "trades with them"],
                 [[m, fmt(mean(cell(sc, m), "invalid_orders")), fmt(mean(cell(sc, m), "invalid_reached_ledger"), 2), fmt(mean(cell(sc, m), "invalid_value_on_ledger"), 0),
                   fmt(mean(cell(sc, m), "invalid_blocked_edge")), fmt(mean(cell(sc, m), "invalid_blocked_validators")),
                   fmt(mean(cell(sc, m), "invalid_blocked_contract")), fmt(mean(cell(sc, m), "trades_with_invalid_taker"))] for m in modes])
        if kind in ("healthy", "faulty"):
            show(f"{sc}: valid orders (mean of {a.reps} runs)",
                 ["configuration", "valid sent", "accepted", "held for review", "rejected", "risky sent", "risky accepted", "risky accepted with fewer than 4"],
                 [[m, fmt(mean(cell(sc, m), "valid_orders")), fmt(mean(cell(sc, m), "valid_accepted")), fmt(mean(cell(sc, m), "valid_held")),
                   fmt(mean(cell(sc, m), "valid_rejected")), fmt(mean(cell(sc, m), "risky_orders")), fmt(mean(cell(sc, m), "risky_accepted")),
                   fmt(mean(cell(sc, m), "risky_accepted_below4"))] for m in modes])

        if kind == "lazy":
            p = arg / 100
            for r in rows:
                if r["scenario"] == sc:
                    r["predicted"] = round(r["edge_rule_invalid_q3"] * p_slip(p, 3) + r["edge_rule_invalid_q4"] * p_slip(p, 4), 2)
            show(f"{sc}: orders that break an edge rule, validators careless {arg}% of the time (mean of {a.reps} runs of {a.n_mc})",
                 ["configuration", "sent", "need 3", "need 4", "reached ledger", "model predicts", "of them needing 3", "of them needing 4"],
                 [[m, fmt(mean(cell(sc, m), "edge_rule_invalid")), fmt(mean(cell(sc, m), "edge_rule_invalid_q3")), fmt(mean(cell(sc, m), "edge_rule_invalid_q4")),
                   fmt(mean(cell(sc, m), "edge_rule_invalid_reached"), 2), fmt(mean(cell(sc, m), "predicted"), 2),
                   fmt(mean(cell(sc, m), "edge_rule_invalid_q3_reached"), 2), fmt(mean(cell(sc, m), "edge_rule_invalid_q4_reached"), 2)] for m in modes])
        if kind == "drop":
            c = arg / 100
            for r in rows:
                if r["scenario"] == sc:
                    r["predicted"] = round(r["valid_q3"] * p_short(c, 3) + r["valid_q4"] * p_short(c, 4), 2)
            show(f"{sc}: valid orders, each other validator silent {arg}% of the time (mean of {a.reps} runs of {a.n_mc})",
                 ["configuration", "sent", "need 3", "need 4", "short of quorum", "model predicts", "held for review", "rejected"],
                 [[m, fmt(mean(cell(sc, m), "valid_orders")), fmt(mean(cell(sc, m), "valid_q3")), fmt(mean(cell(sc, m), "valid_q4")),
                   fmt(mean(cell(sc, m), "valid_short"), 2), fmt(mean(cell(sc, m), "predicted"), 2),
                   fmt(mean(cell(sc, m), "valid_held"), 2), fmt(mean(cell(sc, m), "valid_rejected"), 2)] for m in modes])

    os.makedirs(a.out, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    base = os.path.join(a.out, f"bench_{a.label}_{stamp}")
    fields = ["scenario", "rep"] + list(dict.fromkeys(k for r in rows for k in r if k not in ("scenario", "rep")))
    with open(base + ".csv", "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        w.writerows(rows)
    means = []
    for sc in scs:
        for m in dict.fromkeys(r["mode"] for r in rows if r["scenario"] == sc):
            cl = cell(sc, m)
            means.append({"scenario": sc, "mode": m, **{k: mean(cl, k) for k in fields if isinstance(cl[0].get(k), (int, float)) and k != "rep"}})
    with open(base + ".json", "w", encoding="utf-8") as f:
        json.dump({"label": a.label, "when": stamp, "n": a.n, "reps": a.reps, "seed": a.seed, "chain": chain, "crypto": info.get("crypto"),
                   "validators": info.get("validators"), "python": platform.python_version(), "machine": platform.platform(),
                   "cpu_count": os.cpu_count(), "means": means, "rows": rows}, f, indent=1)
    print(f"\nSaved {base}.csv and {base}.json")
    print("These numbers come from one machine with simulated orders. Report them with the settings above, not as production figures.")


if __name__ == "__main__":
    main()
