# BlockExDSE — v2

A two-tier blockchain + edge exchange prototype for the CSE 4098B capstone.
This is the v2 rebuild: v1 (tagged/branched separately) described mechanisms
in the report that the code didn't actually enforce, had no matching engine,
and had no dashboard. v2 closes those gaps and adds one new mechanism of
its own — see "What's new in v2" below.

## What's new in v2

**Risk-adaptive dual-speed consensus (the core contribution).** Every batch
of fills is scored by a deterministic risk function (notional value,
order-kind risk, participant order velocity, price deviation from the last
trade — see `edge/risk_scorer.py`) and routed on-chain to one of two
finality paths (`contracts/BlockExDSE.sol`):

- **FAST** — a single delegate finalizes the batch immediately. Orders
  against it can't be placed until a fixed challenge window (in blocks)
  elapses without another delegate disputing the digest. Cheap (no vote
  round-trip), but adds a mandatory wait.
- **FULL** — the original multi-delegate quorum vote. Orders can be placed
  the instant quorum is reached, no extra wait, at the cost of a full vote
  round for every delegate.

This operationalizes the report's own H2/H4/H5 hypotheses instead of
leaving them as unmeasured aspirations, and it's the direct answer to "you
just merged PBFT and DPoS" — the routing policy between them is the actual
engineering contribution, not the fact that both exist.

**A real matching engine** (`edge/matching_engine.py`): price-time priority,
LIMIT/MARKET/IOC/FOK order kinds, partial fills. v1's edge node only queued
raw orders; nothing matched anything automatically.

**Real chain wiring** (`edge/chain_client.py`): the edge layer actually
calls the deployed contract (propose/vote/place/match/settle) with real
signed transactions. v1's edge node never touched the chain at all.

**A live dashboard** (`dashboard/index.html`): order entry, a WebSocket-fed
live order book, and a table of batches showing which tier each one took
and why. v1's report described a dashboard that didn't exist in the repo.

**On-chain enforcement that matches the report's own design.** v1's
`placeOrder` had no batch/finality gate despite the report's Section 3.3
quoting one. v2's `placeBatchedOrder` actually requires `isBatchReady(...)`.

## Architecture

```
Trader → dashboard/index.html → primary edge node (matching + risk scoring)
                                        │
                         PBFT-lite vote (3 edge nodes, HMAC-signed)
                                        │
                    risk score ≥ threshold?  ──── no ──→ FAST (1 delegate + challenge window)
                                        │
                                       yes
                                        │
                                       FULL (delegate quorum vote)
                                        │
                          BlockExDSE.sol: placeBatchedOrder → recordMatch → settleTrade
                                        │
                          off-chain hash anchor (in-memory stand-in; MongoDB integration is separate/pending)
```

## Project structure

```
contracts/BlockExDSE.sol     Settlement contract + risk-adaptive batch consensus
edge/
  edge_node.py                FastAPI edge node: intake, PBFT-lite, batch cycle, dashboard host
  matching_engine.py          Price-time-priority order book, LIMIT/MARKET/IOC/FOK, partial fills
  risk_scorer.py              Deterministic per-order / per-batch risk scoring
  chain_client.py             web3.py wrapper around the deployed contract
  test_matching_engine.py     pytest — matching engine correctness
  test_risk_scorer.py         pytest — risk scoring correctness
  smoke_test_chain_client.py  manual, one-off: exercises FAST + FULL paths against a live chain
dashboard/index.html          Single-file live dashboard (order entry, order book, batches, settlements)
scripts/
  deploy.js                   Deploys + writes deployment.json (address, ABI, delegates)
  deploy-and-test.js           legacy manual-compile lifecycle script (kept for reference)
  compile-check.js             standalone solc compile check
test/BlockExDSE.test.js       Hardhat/Mocha contract test suite (21 tests)
docker/                       Dockerfiles for the edge node and a local Hardhat chain
docker-compose.yml            One-command local demo (untested in the authoring environment — see below)
```

## Quick start — local demo (three terminals + one deploy step)

```bash
npm install
py -m pip install -r edge/requirements.txt   # or `pip install`, depending on your setup

# Terminal 1 — local chain (mines a block every 3s so the FAST-tier
# challenge window elapses in real time, not just on new transactions)
npx hardhat node

# Terminal 2 — deploy the contract and wire up 3 local delegates
npx hardhat run scripts/deploy.js --network localhost

# Terminals 3-5 — the edge cluster (each reads deployment.json automatically)
EDGE_ID=1 PORT=9001 python edge/edge_node.py
EDGE_ID=2 PORT=9002 python edge/edge_node.py
EDGE_ID=3 PORT=9003 python edge/edge_node.py
```

Open **http://localhost:9001** for the dashboard. Submit a crossing BUY and
SELL order (same ticker, prices that cross); within `BATCH_INTERVAL_SECONDS`
(default 5s) the batch is scored, routed to FAST or FULL, and settled —
watch the "Recent batches" and "Recent settlements" tables update with real
transaction hashes.

You can also drive it by hand:
```bash
curl -X POST http://127.0.0.1:9001/orders -H "Content-Type: application/json" \
  -d '{"trader":"0x...","ticker":"DSEX","side":"BUY","kind":"LIMIT","quantity":100,"price":50}'
curl -X POST http://127.0.0.1:9001/batch/propose   # optional — a cycle also runs automatically
```

## Running the tests

```bash
npx hardhat test                                              # contract: 21 tests
py -m pytest edge/test_matching_engine.py edge/test_risk_scorer.py -v   # edge logic: 23 tests
```

## One-command local demo (Docker)

```bash
docker compose up --build
```
then open http://localhost:9001. This was written and reviewed carefully
but **could not be built/tested in the environment it was authored in** (no
Docker available there) — validate it once before relying on it for a live
demo. If a service fails to come up, check `docker compose logs deployer`
first (it retries the deploy against the Hardhat container for up to a
minute before giving up).

## Public testnet deployment

This is the actual "anyone can use it as a demo" path. It needs secrets
only you can provide — none of this can be done from here without them.

1. **Get a free RPC endpoint.** Create a free account at
   [Alchemy](https://alchemy.com) or [Infura](https://infura.io), make a
   Sepolia app, and copy its HTTPS RPC URL.
2. **Create a disposable deployer wallet.** Generate a new wallet you don't
   use for anything else (e.g. in MetaMask), export its private key, and
   fund it with Sepolia test ETH from a faucet such as
   [sepoliafaucet.com](https://sepoliafaucet.com) or Alchemy's own faucet.
   **Never use a wallet that holds real funds.**
3. Copy `.env.example` to `.env` and fill in `SEPOLIA_RPC_URL` and
   `DEPLOYER_PRIVATE_KEY`. Generate two more disposable wallets for the
   other two edge-node delegates (they don't need funding — only the
   deployer pays gas for `addDelegate`), and set `DELEGATE_ADDRESSES` to
   their addresses (comma-separated).
4. Deploy:
   ```bash
   npx hardhat run scripts/deploy.js --network sepolia
   ```
   This writes `deployment.json` with the deployed address and ABI. Commit
   this file for the testnet deployment specifically (it contains no
   secrets — just public contract info) so the cloud services below can
   read it: `git add -f deployment.json`.
5. **Host the 3 edge nodes + dashboard.** Using [Render](https://render.com)
   (free tier, one Docker-based Web Service per node) as an example:
   - Create three Web Services from this repo, each using
     `docker/Dockerfile.edge` as the Dockerfile.
   - For each, set environment variables: `EDGE_ID` (1/2/3), `PORT` (Render
     sets this for you — the app already reads it), `RPC_URL` (your Sepolia
     RPC URL), `DELEGATE_PRIVATE_KEY` (the deployer key for node 1, the two
     extra delegate keys for nodes 2 and 3), `PRIMARY_URL` (node 1's Render
     URL), `PEER_URLS` (the other two nodes' Render URLs), `PUBLIC_URL` and
     `PEER_PUBLIC_URLS` (same values — Render URLs are already
     publicly reachable, so these can equal `PRIMARY_URL`/`PEER_URLS`).
   - Share node 1's Render URL — that's the public dashboard link.

I can walk through any of these steps interactively once you have the
accounts open, or take over the Render/Railway configuration directly if
you share the relevant API token.

## Known simplifications (stated, not hidden)

- **Order intake and matching are centralized at the primary edge node.**
  All three nodes independently validate and vote on every batch (and,
  for FULL-tier batches, independently cast their own on-chain delegate
  vote), but only the primary runs the order book itself. Distributing the
  matching engine across the cluster is future work.
- **n=3 with a majority quorum tolerates one crashed delegate, not one
  malicious one** (Byzantine tolerance needs n≥3f+1). Documented, not
  claimed otherwise.
- **Off-chain storage is an in-memory stand-in.** MongoDB integration is
  being added separately per the project owner's own plan; the hash-anchor
  mechanism (SHA-256 of the canonical fill record, anchored on-chain) works
  identically once that lands.
- **DPoS delegates are a fixed set, not stake-weighted or elected.**
  Unchanged from v1 — documented there too.
