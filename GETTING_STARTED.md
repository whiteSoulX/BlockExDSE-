# Getting started (for the team)

This is the walkthrough for anyone on the team who wants to run BlockExDSE
locally, click through the UI, and understand what's actually been built
and tested — no prior context needed beyond this file.

## Which branch is this?

The repo currently has three branches with **different, not-yet-reconciled**
work on it. Make sure you're on the right one before you start:

| Branch | What it is |
|---|---|
| `main` | The original minimal prototype: contract + 3 raw edge-node processes, no UI, no chain wiring. |
| **`v1-full-stack`** (this branch) | Adds a full React dashboard, wires the edge layer to the blockchain (batches settle on-chain automatically), and adds a DPoS-lite delegate election. **This is what the rest of this guide covers.** |
| `v2-dev` | A separate, independent rewrite with a different design (risk-adaptive dual-speed consensus, a fuller matching engine with partial fills, a vanilla-JS dashboard, Docker setup). Not covered here. |

`v1-full-stack` and `v2-dev` overlap and conflict in places — they haven't
been merged or reconciled yet. If you're not sure which one you're supposed
to be looking at, ask before doing work on top of either.

## 1. Prerequisites

- **Node.js** 20+ and **npm** (check: `node -v`)
- **Python** 3.10+ (check: `python3 --version`)
- **git**
- A browser with a wallet extension — **MetaMask** is what this guide uses

Nothing else needs installing manually — the run script installs the
project's own dependencies (Node packages, a Python virtual environment)
the first time you run it.

## 2. Get the code

```bash
git clone https://github.com/whiteSoulX/BlockExDSE-.git
cd BlockExDSE-
git checkout v1-full-stack
```

## 3. Run everything with one command

```bash
./start.sh
```

First run takes a bit longer (installing dependencies); after that it's
fast. When it's ready you'll see a banner like this:

```
============================================================
 BlockExDSE is up and running:

   Frontend (UI):              http://127.0.0.1:5173
   Blockchain (Hardhat node):  http://127.0.0.1:8545
   Edge node 1:                http://127.0.0.1:9001
   Edge node 2:                http://127.0.0.1:9002
   Edge node 3:                http://127.0.0.1:9003
 ...
 Press Ctrl+C to stop everything.
============================================================
```

Leave that terminal open — it's running the whole stack. Press `Ctrl+C`
in it whenever you want to stop everything cleanly.

If a port is already in use, something else on your machine is using it —
stop that first and re-run.

## 4. Connect a wallet

Open **http://127.0.0.1:5173** in your browser.

**Add the local network to MetaMask:**
| Field | Value |
|---|---|
| Network name | Hardhat Local |
| RPC URL | `http://127.0.0.1:8545` |
| Chain ID | `31337` |
| Currency symbol | ETH |

**Import a test account.** These are Hardhat's well-known local dev keys —
publicly documented, funded with fake ETH only on your local chain, safe to
share, never usable anywhere real:

| Role | Address | Private key |
|---|---|---|
| Admin + Delegate #1 | `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266` | `0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80` |
| KYC'd trader (buyer) | `0x70997970C51812dc3A010C7d01b50e0d17dc79C8` | `0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d` |
| KYC'd trader (seller) | `0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC` | `0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a` |

Import the **admin** key first if you want to see every tab unlocked at
once. Import a **trader** key to see the app the way a regular user would
(KYC Verified only — Admin/Delegate tabs show a "not authorized" banner,
same as the real contract would show anyone else).

In MetaMask: Account menu → Import Account → paste the private key.

## 5. Tour of the UI

Each tab maps directly to a piece of the architecture described in the
capstone report:

- **Overview** — live counts of orders/matches/settlements, the deployed
  contract address, and whether all 3 edge nodes are online. Good first
  stop to confirm everything's actually running.
- **Trade** — a trader connects their own wallet and calls the contract's
  `placeOrder()`/`cancelOrder()` directly. This is the "trader interacts
  with the chain themselves" path.
- **Admin** — KYC-verify a wallet (`verifyParticipant`), add a delegate by
  admin fiat (`addDelegate`), or use the **Delegate Election** card to vote
  for a candidate and rotate the delegate set to the current top
  vote-getters — the DPoS-lite mechanism.
- **Delegate** — record a match between a pending buy and sell order
  (`recordMatch`), settle it (`settleTrade`) with a SHA-256 hash of an
  off-chain record you type in, and verify a settlement's hash anchor
  against a recomputed hash (`verifyOffChainHash`) — this is the
  hash-anchoring pattern the report describes for off-chain data integrity.
- **Explorer** — every order, match, and settlement on-chain, filterable
  by ticker/status. The ground truth for "did my action actually work."
- **Edge Layer** — the off-chain tier: submit an order to any of the 3
  independent edge-node processes, then hit **Propose Batch** to trigger a
  real PBFT-lite vote between all three (not simulated — three separate
  HTTP servers actually vote). If it clears 2-of-3 and finds a matching
  buy/sell pair of equal quantity, it's forwarded on-chain automatically —
  check the Explorer tab right after and you'll see it settled.

**A demo worth trying:** in the Edge Layer tab, submit a BUY and a SELL for
the same ticker and quantity (e.g. `DSEX`, qty `25`, price `10`) to node 1,
then click Propose Batch. Watch the activity log show the PBFT vote, then
flip to Explorer to see both orders `SETTLED`.

## 6. Run and understand the test suite

The Solidity contract has an automated test suite — this is the most
precise "what's actually built and enforced" reference, since these tests
run against the real contract, not just the UI.

```bash
npx hardhat test
```

You should see 16 passing tests, grouped like this:

- **KYC enforcement** — proves an unverified wallet's order gets rejected,
  and a verified one's doesn't.
- **Order placement** — zero quantity / zero price get rejected; a valid
  order emits the right event with the right fields.
- **Matching and settlement — full lifecycle** — places a buy and a sell,
  matches them, settles the trade, and checks the hash-anchor verification
  both passes for the right hash and fails for a tampered one. Also proves
  a non-delegate can't call `recordMatch` (the double-spend/access-control
  check).
- **Order cancellation** — a trader can cancel their own pending order;
  someone else can't cancel it for them.
- **Edge-layer forwarding (`placeOrderFor`)** — proves a delegate can place
  an order on behalf of a KYC'd trader, a non-delegate can't, and it's
  rejected if the trader isn't KYC-verified.
- **DPoS-lite delegate election** — proves votes are counted and can move
  between candidates, non-KYC'd wallets can't vote, rotation promotes the
  top-N vote-getters, and only admin can trigger a rotation.

Each `it(...)` block's description is written to be readable on its own —
if you want the exact assertions, open `test/BlockExDSE.test.js` and read
top to bottom; it reads like a spec of the contract's guarantees.

## 7. Where to go next

- [README.md](README.md) — deeper architecture notes, manual (non-`start.sh`)
  run instructions for each piece individually, known limitations, and a
  guide for deploying each piece to the cloud (testnet + hosted edge nodes
  + static frontend).
- Logs for every process land in `./logs/` while `start.sh` is running, if
  something looks wrong and you want to see what a specific process printed.
