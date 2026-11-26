# RACE (BlockExDSE v2.1) - runnable prototype

**RACE: Risk-Adaptive Consensus at the Edge.** The product name is set in one place: `BRAND` at the top of the script in
`dashboard/index.html`.

A simulated stock-exchange settlement system in which nobody acts alone:

1. the **investor signs** each order in the browser (EIP-712 typed data),
2. **four edge validators** check the exchange rules and sign,
3. the **settlement contract verifies every signature itself**, recomputes the risk score, enforces the price band,
   locks the cash or shares, and settles matching orders in one transaction,
4. an **independent audit** rebuilds the whole market from the ledger alone.

Routine orders need 3 of 4 validator signatures. Risky orders (large value or a price far from the reference) need
4 of 4. If exactly one signature is missing on a risky order, the order is held and a broker or admin decides; the
contract accepts one reviewer signature in place of one validator, for a risky order only.

Two simulated exchanges run side by side: **DSE** (Dhaka, taka, price-slab circuit breakers) and **LSE** (London, pence).
Nothing connects to a real exchange and no real money is involved.

## What is new in 2.1

| For everyday investors | How it works |
|---|---|
| **Phone-first investor app** in the poster design: Home, Markets, Trade, Orders and Wallet tabs | `dashboard/index.html` (one file, no build step). Broker and admin keep a wide staff console in the same colours |
| **Bangla / English switch** | One tap in the header or under Profile. Amounts use Bangladeshi grouping and Bangla digits in Bangla |
| **Guided first trade** | Seven coached steps on the real Trade screen: company, buy or sell, quantity, price, the RACD risk check, signing, and watching it settle |
| **Market explorer and watchlist** | Search, sector filters, a page per stock (price, chart, allowed band, order book, recent trades), star to follow. Stock details in `edge/markets.py` |
| **Add money and withdraw (practice)** | bKash, Nagad, Rocket or bank screens. **Payments are simulated.** The broker key credits on-chain cash (`depositCash`); a withdrawal is **signed on the investor's phone** (EIP-712 `Withdraw`) and the contract checks the signature, the nonce, the expiry and that only free cash leaves (`withdrawCash`) |
| **The audit covers the wallet** | Cash conservation now counts deposits and withdrawals, and every withdrawal signature is re-checked from the transaction input |

New endpoints: `GET /api/wallet`, `POST /api/wallet/deposit`, `POST /api/wallet/withdraw`, `GET/POST /api/watchlist`,
`GET /api/history/{market}/{ticker}`. The 30-day price charts are **illustrative** (a seeded series inside the price band,
ending at the reference price), and the app labels them that way. New test: `scripts/wallet_test.py` (15 checks).

## What was new in 2.0

| Gap in 1.x and in published designs | What 2.0 does |
|---|---|
| The contract trusted the gateway's vote count | The contract recovers every validator signature and counts them itself |
| The gateway decided the risk tier | The contract recomputes the integer risk score and picks the quorum |
| Three validators cannot tolerate a faulty one | Four validators: 3 of 4 routine, 4 of 4 risky |
| The gateway could place an order in a client's name | Orders are signed on the investor's device; the contract checks the signature, a nonce and an expiry time |
| An order could be placed without funds behind it | Cash or shares are locked when the order is placed and released on cancel |
| A risky order was lost when one validator failed | It is held for a human reviewer |
| No way to check the operator | Audit from the ledger alone, nine attack tests, a tamper demonstration |

## Requirements

- **Node.js 18 to 22** (LTS). Node 24 may fail to compile; install Node 22 if it does.
- **Python 3.10 to 3.13**. On Windows install Python 3.12 from python.org and tick "Add python.exe to PATH".
- Internet on the first run (downloads packages and the Solidity compiler).

## Run (one command)

| System | Command |
|---|---|
| Docker | `docker compose up --build` (see [DOCKER.md](file:///C:/Users/user/Downloads/blockexdse-v2.0%20Stable/blockexdse/DOCKER.md)) |
| Windows | double-click `run_all.bat` (or run it in a terminal) |
| Linux / macOS | `./run_all.sh` |
| Any | `python run.py` |

The launcher installs what is missing, compiles the contract, starts a local test blockchain and four edge validators
(ports 9001 to 9004), and opens **http://localhost:9001**. Press Ctrl+C to stop. On Windows, `stop_all.bat` frees the ports.

Options: `--no-browser`, `--demo-delay 0.5` (slower stage animation), `--block-time 250` (one block every 250 ms),
`--lan` (open the dashboard from a phone on the same Wi-Fi; demo use only).

## Demo accounts

Tap a name on the sign-in screen, or type: `alice@blockexdse.demo` / `Demo@123` (also bob, carol), `broker@blockexdse.demo` /
`Broker@123`, `admin@blockexdse.demo` / `Admin@123`. Dave, Erin and Frank are market-simulation bots.

## A five-minute tour

1. **Bob** sells 10 GP at 300. Three validators sign; the contract locks his shares.
2. **Alice** buys 10 GP at 300. The orders match and settle in one transaction. Check **Portfolio**.
3. **Alice** buys 1,700 GP at 300 (510,000 BDT). The preview turns to ESCALATED: all four validators must sign.
4. **Admin** > Market > "make faulty" on validator 4. A routine order still passes. A risky order is **held**.
5. **Broker** > Review > "Approve and sign". The contract accepts the reviewer in place of the missing validator.
6. **Admin** > Market > "heal" validator 4, then Proof > "Run all nine tests", "Run the audit", and the tamper button.

The **Tour** button walks through the same steps. Investors now find Portfolio under **Home** (holdings) and **Wallet** (cash),
and the audit under **Profile** (tap the round initials). The **Guided first trade** card on Home is the quickest demo for a
first-time investor. New users can also sign up (the one-time code is shown on
screen, the ID number is any 10 digits); the browser creates the signing key at that step.

## Check that it works

With the system running, in a second terminal (use `.venv\Scripts\python` on Windows, `.venv/bin/python` elsewhere):

```
python scripts/smoke_test.py        # 15 checks: order flow, quorums, hold and review
python scripts/security_test.py     # 18 checks: hashes, nine attacks, audit and tamper detection
python scripts/onboarding_test.py   # 14 checks: sign-up, one-time code, ID check, approval
python scripts/market_test.py       # 15 checks: two markets, market orders, cancel, live data
python scripts/wallet_test.py       # 15 checks (v2.1): add money, signed withdrawal, replay and forgery refused, watchlist, history, audit
python scripts/audit_chain.py       # independent audit of DSE and LSE from the ledger
```

## Benchmark

```
python scripts/benchmark.py --n 100 --reps 3 --scenarios healthy,faulty,compromised1,compromised2,compromised3 --label instant-A
python scripts/benchmark.py --n 100 --reps 3 --scenarios batch5,batch20,link10 --label instant-B
python scripts/benchmark.py --n-mc 300 --reps 3 --scenarios lazy30,lazy50,drop10,drop20 --label instant-CD
```

Start a fresh system before each line. Results go to `benchmark_results/` as CSV and JSON. `benchmark_results/v2.0-reference/`
holds the runs quoted in the report (one sandbox machine, 2 virtual CPUs); your numbers will differ. See the top of
`scripts/benchmark.py` for what each configuration and scenario means. On Linux, joules are recorded when the energy
counter `/sys/class/powercap/intel-rapl:0/energy_uj` is readable (usually needs `sudo`).

## Other chains (optional)

Set `RPC_URL` and `CHAIN_PRIVATE_KEY` (a funded **test-chain** key) before `python run.py` to deploy to another EVM test
chain. Real-money chains are refused unless `ALLOW_MAINNET=yes-i-understand` is set. Do not do that.

## What is real and what is simulated

| Real in the prototype | Simulated |
|---|---|
| Signatures (investor, validators, reviewer) and their on-chain verification | Identity checks, one-time codes, ID numbers |
| v2.1: withdrawal signatures, free-cash check and audit of deposits and withdrawals | v2.1: bKash, Nagad, Rocket, bank and card payments; 30-day chart history |
| Risk score, quorum, price band, nonce and expiry checks in the contract | Money, shares, reference prices, market data |
| Locking of funds, matching, settlement, record hashes | All nodes on one computer; a local test blockchain with one node |
| Audit, attack tests, benchmark | Demo accounts whose keys the server also knows (real sign-ups keep the key in the browser) |

Known limits: one gateway orders the incoming orders (no protection against unfair ordering), settlement is gross
(no netting, so funds are locked per order), and nothing here has been tested on separate machines or a public chain.

## Files

`contracts/BlockExDSE.sol` settlement contract · `edge/` validators, gateway, signing, audit · `dashboard/` single-page app
(`vendor/sign.js` is built from `tools/sign_src.js`; v2.1 added `withdrawDigest`. The page itself is assembled from
`tools/dash_parts/` with `cat tools/dash_parts/{head.html,core.js,inv.js,staff.js,tail.js} > dashboard/index.html`, or edit
`dashboard/index.html` directly) · `scripts/` tests and benchmark · `tools/film_demo.js` records the
demo video (needs Playwright; optional) · `run.py` launcher.

## Trouble?

- **Package install fails on Windows**: your Python is too new or too old. Install Python 3.12, delete `.venv`, run again.
- **Compile fails**: use Node 22 or 20, delete `node_modules`, run again. Without internet for the compiler download,
  `npm install --no-save solc@0.8.20` then `node tools/compile_solcjs.js` and start with `python run.py --no-compile`.
- **Port in use**: run `stop_all.bat` (Windows) or `fuser -k 8545/tcp 9001/tcp 9002/tcp 9003/tcp 9004/tcp` (Linux).
- **Signing is slow**: the launcher tries to install `coincurve` for fast signatures; without it everything still works.

## Notes for 2.1

- `test/BlockExDSE.test.js` still describes the v1 contract API and does not run against v2; the Python scripts above are the
  tests that match the current contract.
- `tools/film_demo.js` records the v2.0 trading screens. It needs new selectors before it can film the 2.1 investor app.
