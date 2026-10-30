# BlockExDSE v1.1 – runnable prototype

Order -> 3 edge nodes (PBFT-lite, RACD) -> Solidity contract (place / match / settle) -> SHA-256 hash anchor -> live dashboard.

## Requirements
- Node.js 18 / 20 / 22 (Hardhat 2 does not support Node 23+ officially)
- Python 3.10+
- MongoDB is OPTIONAL (used automatically if running on :27017, otherwise in-memory)

## Run (Linux / macOS)
    chmod +x run_all.sh
    ./run_all.sh
Open http://localhost:9001

## Run manually (4 terminals)
    npm install
    python3 -m venv .venv && source .venv/bin/activate && pip install -r edge/requirements.txt
    npx hardhat compile
    # T1
    npx hardhat node
    # T2 (after T1 is up; re-run every time you restart Hardhat)
    python edge/deploy.py
    # T3, T4, T5
    cd edge
    NODE_ID=1 python edge_node.py     # gateway + dashboard (9001)
    NODE_ID=2 python edge_node.py     # validator (9002)
    NODE_ID=3 python edge_node.py     # validator (9003)

## Verify
    python scripts/smoke_test.py      # 11 end-to-end checks

## Things to know
- Restarting Hardhat wipes the chain: re-run `deploy.py` and restart the edge nodes.
- `DEMO_DELAY=0 ./run_all.sh` removes the 0.35 s visual pause between stages (use for benchmarking).
- Windows: use WSL, or the manual steps with `set NODE_ID=1` instead of `NODE_ID=1`.
- Port busy? `fuser -k 8545/tcp 9001/tcp 9002/tcp 9003/tcp`

## What is real vs. simulated
Real: edge validation on 3 processes, signed-hash PBFT-lite votes (2-of-3), RACD (3-of-3 for risky orders), on-chain placement/matching/settlement with real tx hashes and gas, hash anchoring.
Simulated/not built: DPoS delegates (single admin signer + edge-address whitelist), privacy layer (k-anonymity/zk), Polygon testnet.
