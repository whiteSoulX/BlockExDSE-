# BlockExDSE — Prototype

Working prototype code for the CSE 4098B capstone: a hybrid exchange with a
blockchain settlement layer, an off-chain edge layer running PBFT-lite
consensus, and a React frontend that drives both. All three pieces are
built, tested, and confirmed running end-to-end.

**New here?** See [GETTING_STARTED.md](GETTING_STARTED.md) for the
step-by-step "clone it, run it, click through it, understand the tests"
walkthrough. It also explains the branch situation — this branch
(`v1-full-stack`) is one of two independent, not-yet-reconciled rewrites of
the original `main`; the other is `v2-dev`. Worth reading before you assume
`main` or a checkout without a branch name has this work on it.

**Positioning note:** this isn't a crypto-asset exchange like Binance, nor
an AMM like Uniswap — those are permissionless, KYC-optional (or exchange-side
only), and don't use an order-book CDA. BlockExDSE is closer in shape to
blockchain-based settlement layers for *regulated securities* (e.g. exchange
pilots on permissioned/consortium chains): KYC-gated participants, a
delegate/consortium model standing in for DPoS, and standard order-book
matching, with the blockchain used for tamper-evident settlement plus a
hash-anchor over off-chain records rather than for the trading itself. Worth
keeping in mind when framing this for evaluators — it competes with exchange
infrastructure, not with crypto trading venues.

## What's already working

**Smart contract (`contracts/BlockExDSE.sol`)** — deployed to a local
blockchain and run through a full lifecycle: KYC verification, order
placement, matching, settlement, and off-chain hash-anchor verification.
Confirmed with a real transaction hash and passing hash-integrity check.

**Edge layer (`edge/edge_node.py`)** — three independent FastAPI processes
that validate incoming orders and run a real PBFT-lite vote between
themselves (2-of-3 agreement) before approving a batch. Confirmed with real
HTTP calls between all three processes — this is not simulated, it's
actually running the consensus logic across separate processes. **A batch
that clears PBFT-lite is now forwarded on-chain automatically**
(`edge/chain.py`): the proposing node calls `placeOrderFor()` for each order
as a delegate, runs a simple price-time-priority match (equal-quantity pairs
only — see the limitation below), then `recordMatch()` + `settleTrade()`
for anything it matched, anchoring a SHA-256 of the full off-chain record.
Confirmed end-to-end: an approved batch's orders show up `SETTLED` in the
Explorer tab moments later, with a real transaction hash for each step.

**DPoS-lite delegate election** (in the contract) — any KYC-verified
participant gets one vote (`voteForDelegate`), and the admin can rotate the
delegate set to the current top-N vote-getters (`rotateDelegates`),
alongside the original admin whitelist (`addDelegate`, kept for manual
override / local testing). Verified with unit tests and through the
Admin tab's "Delegate Election" card.

**Off-chain persistence (`edge/storage.py`)** — orders (D1), PBFT batch
decisions (D5), and full match/settlement records (D2/D6) are written to
MongoDB when `MONGO_URL` points at a reachable instance. **Caveat:** this
was implemented and code-reviewed but not exercised against a real MongoDB
in the environment it was built in (no `mongod` available there) — when
Mongo isn't reachable, every write silently no-ops and the system runs
exactly as before, so verify the persistence path yourself against a real
instance before relying on it.

**Frontend (`frontend/`)** — a React + Vite dashboard covering every
contract function and edge-node endpoint:
- **Overview** — live stats, contract address, edge-node health.
- **Trade** — connect a wallet, place/cancel orders on-chain, see your orders.
- **Admin** — KYC-verify participants, add/vote/rotate delegates, look up any address's status.
- **Delegate** — record matches, settle trades (with a client-side SHA-256
  helper for the off-chain hash), verify a settlement's hash anchor.
- **Explorer** — filterable order book, match history, settlement history.
- **Edge Layer** — submit orders to any of the 3 nodes, watch pending
  batches, trigger a PBFT-lite propose, see the vote result *and* the
  resulting on-chain settlement live.

It talks to the contract directly via `ethers.js` + an injected wallet
(MetaMask or compatible) for on-chain actions the trader/admin/delegate
does themselves, and to the edge nodes over plain `fetch` for the off-chain
submission flow — kept as two visibly separate tabs since a trader can
still place orders either way (directly, or through the edge layer for
off-chain pre-validation before it's forwarded on-chain automatically).

**Known limitation:** the edge layer's auto-matching only pairs orders of
*equal* quantity for the same ticker — the contract's `recordMatch()` has
no partial-fill bookkeeping (it marks both orders fully `MATCHED` regardless
of the quantity passed in), so the matching engine doesn't pretend to
support partial fills either. An order that doesn't find an exact
counterpart stays `PENDING` on-chain for a later batch or manual match via
the Delegate tab.

## Quick start — one command

Run the whole system (blockchain + lifecycle demo + 3-node edge layer +
frontend) with a single command from the repo root:

```bash
./start.sh
```

First run installs Node.js and Python dependencies automatically (creates
`edge/venv` and `frontend/node_modules` for you), so it takes a little
longer the first time. It then:

1. Compiles the contract and starts a local Hardhat blockchain.
2. Runs the full order-to-settlement lifecycle demo (KYC, order placement,
   matching, settlement, hash-anchor verification), then deploys a second,
   fresh contract instance for the UI to drive interactively (KYC-verifying
   a few of Hardhat's well-known test accounts for convenience).
3. Starts all three edge nodes (ports 9001–9003) and waits until they're
   healthy.
4. Starts the frontend on http://127.0.0.1:5173.

Once you see the "BlockExDSE is up and running" banner, open
http://127.0.0.1:5173, connect a wallet (MetaMask or compatible) pointed at
the local Hardhat network (chain ID `31337`, RPC `http://127.0.0.1:8545`),
and import one of Hardhat's default test account private keys (printed by
`npx hardhat node`) to get funds and a pre-verified KYC account. Logs for
each process are written to `./logs/`. Press `Ctrl+C` to stop everything (if
you started it in the background instead, send `SIGTERM`, e.g. `kill <pid>`,
since a backgrounded shell can't always catch `Ctrl+C`'s signal).

If you'd rather run each piece by hand (e.g. to restart just one part), see
the manual steps below — `start.sh` is just automating them.

## Quick start — frontend only

```bash
cd frontend
npm install
npm run dev          # http://127.0.0.1:5173
```

By default it points at `http://127.0.0.1:8545` for the chain and
`http://127.0.0.1:9001-9003` for the edge nodes, and reads the contract
address from `frontend/src/lib/contractAddress.json` (written by
`scripts/deploy-local.js`). Copy `frontend/.env.example` to `frontend/.env`
to override any of this — see "Deploying to the cloud" below for a real
deployment.

## Quick start — smart contract

```bash
npm install
npx hardhat node                 # terminal 1: local blockchain
npx hardhat test                 # terminal 2: run the test suite
```

> **Note on this sandbox vs. your laptop:** this code was built in a
> network-restricted sandbox that couldn't reach Hardhat's Solidity
> compiler download server (`binaries.soliditylang.org`). We worked around
> it using the `solc` npm package directly (see `scripts/compile-check.js`
> and `scripts/deploy-and-test.js`). **On your own laptops with normal
> internet, you will NOT need this workaround** — `npx hardhat compile`
> and `npx hardhat test` will work exactly as written in
> `test/BlockExDSE.test.js`, which is the test file to actually build on
> going forward.

To re-run the sandbox-style manual verification (does not require the
Hardhat compiler download):
```bash
node scripts/compile-check.js      # compiles via npm solc, saves ABI
npx hardhat node                    # start local chain in another terminal
node scripts/deploy-and-test.js     # deploys + runs full order lifecycle
```

## Quick start — edge layer

```bash
cd edge
pip install -r requirements.txt

# Three separate terminals, simulating three edge nodes:
EDGE_ID=1 PORT=9001 python3 edge_node.py
EDGE_ID=2 PORT=9002 python3 edge_node.py
EDGE_ID=3 PORT=9003 python3 edge_node.py
```

Then submit an order and trigger the consensus vote:
```bash
curl -X POST http://127.0.0.1:9001/orders \
  -H "Content-Type: application/json" \
  -d '{"trader":"0xYourAddress","ticker":"DSEX","order_type":"BUY","quantity":100,"price":50}'

curl -X POST http://127.0.0.1:9001/batch/propose
```

You should see `"status":"approved"` with `"votes_received":3`.

To also get automatic on-chain forwarding when run this way (rather than
via `./start.sh`, which sets this up for you), export before starting each
node: `RPC_URL` (default `http://127.0.0.1:8545`), `CONTRACT_ADDRESS` (or
let it fall back to `frontend/src/lib/contractAddress.json`), and
`DELEGATE_PRIVATE_KEY` (a registered delegate's private key). Without these,
the node behaves exactly as the off-chain-only demo above. For persistence,
also export `MONGO_URL` pointed at a reachable MongoDB.

## What's NOT built yet — your next steps

1. **Partial-fill matching.** The edge layer's auto-matching engine
   (`edge/chain.py`) only pairs orders of *equal* quantity, and the
   contract's `recordMatch()` has no bookkeeping for a partially-filled
   order — both documented simplifications for the prototype. Real
   partial-fill support needs contract changes (tracking remaining
   quantity per order) plus a smarter matching engine.
2. **Verify the MongoDB persistence path against a real instance.** It's
   implemented (`edge/storage.py`) and degrades gracefully without Mongo,
   but wasn't exercised against a real `mongod`/Atlas instance in the
   environment it was built in — do that before relying on it.
3. **Real DPoS stake weighting.** The election in the contract is one
   address, one vote (no stake token) — sufficient to demonstrate rotation,
   but a full DPoS design would weight votes by stake and probably run
   rotations on a timer/epoch rather than admin-triggered.

## Deploying to the cloud

Each piece deploys independently — pick hosts for each and wire them
together with environment variables. Nothing here is Bangladesh/DSE-specific
infrastructure; any standard host works.

**1. Smart contract → a public testnet.** Uncomment the `sepolia` block in
`hardhat.config.js`, set `SEPOLIA_RPC_URL` (from Infura/Alchemy/Ankr/etc.)
and `PRIVATE_KEY` as environment variables, then:
```bash
npx hardhat run scripts/deploy-local.js --network sepolia
```
This deploys the contract and writes its ABI + address into
`frontend/src/lib/`, same as the local flow. (Skip the local-account KYC
convenience step if you adapt the script for a testnet — or just re-verify
the addresses you actually want to use from the Admin tab afterward.)

**2. Edge nodes → any host that runs Python** (a small VM, Render, Railway,
Fly.io, etc.). Deploy `edge/` three times with `EDGE_ID`/`PORT` set per
instance, and make sure each node's `PEER_PORTS`/hostnames can reach the
other two — the current code assumes all three are reachable at
`127.0.0.1:900{1,2,3}`, so for real separate hosts you'll need to change
`PEER_PORTS` in `edge/edge_node.py` to full URLs of the other two nodes. Set
`RPC_URL`, `CONTRACT_ADDRESS`, and `DELEGATE_PRIVATE_KEY` (a real delegate's
key, added via the Admin tab's election or `addDelegate` — never reuse a
Hardhat test key outside local dev) on each so batches get forwarded
on-chain, and `MONGO_URL` (e.g. a free-tier MongoDB Atlas cluster) for D1/D2/D5/D6
persistence.

**3. Frontend → any static host** (Vercel, Netlify, GitHub Pages, S3 +
CloudFront, or nginx on the same VM as the edge nodes). Set
`VITE_RPC_URL`, `VITE_CONTRACT_ADDRESS`, `VITE_CHAIN_NAME`, and
`VITE_EDGE_NODE_URLS` (see `frontend/.env.example`) before building:
```bash
cd frontend
npm run build      # outputs static files to frontend/dist/
```
Deploy `frontend/dist/` to your static host of choice.

Since the frontend calls the edge nodes directly from the browser, make sure
they're reachable over HTTPS from wherever the frontend is hosted (browsers
block plain HTTP calls from an HTTPS page) — put them behind a reverse proxy
with TLS (e.g. Caddy/nginx + Let's Encrypt) rather than exposing Uvicorn
directly.

## Project structure

```
start.sh                       — one-command launcher for the full system
contracts/BlockExDSE.sol       — the settlement smart contract
test/BlockExDSE.test.js        — standard Hardhat test suite (run on your laptop)
scripts/compile-check.js       — sandbox-only manual compile workaround
scripts/deploy-and-test.js     — sandbox-only manual deploy + lifecycle test
scripts/deploy-local.js        — deploys the instance the frontend drives, writes its ABI/address
edge/edge_node.py              — edge layer, run 3x for PBFT-lite
edge/chain.py                  — blockchain client: forwards an approved batch on-chain
edge/storage.py                — MongoDB persistence for D1/D2/D5/D6 (no-ops without MONGO_URL)
edge/requirements.txt          — Python dependencies
frontend/                      — React + Vite dashboard (see frontend/.env.example for config)
frontend/src/lib/contractAbi.json      — contract ABI, kept in sync by deploy-local.js
frontend/src/lib/contractAddress.json  — last local deploy's address, written by deploy-local.js
artifacts-manual/              — ABI + bytecode generated by compile-check.js
```
