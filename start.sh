#!/usr/bin/env bash
# One-command launcher for the full BlockExDSE prototype:
#   - installs Node.js and Python dependencies (first run only)
#   - compiles the smart contract and starts a local Hardhat blockchain
#   - runs a full order-to-settlement lifecycle demo, then deploys a fresh
#     contract instance for the UI to drive interactively
#   - starts the 3-node edge-layer PBFT-lite consensus cluster
#   - starts the React frontend
#
# Usage:
#   ./start.sh
# Stop everything with Ctrl+C (or SIGTERM if it was started in the background).

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

LOG_DIR="$ROOT_DIR/logs"
mkdir -p "$LOG_DIR"

PIDS=()
CLEANED_UP=0

cleanup() {
  if [ "$CLEANED_UP" -eq 1 ]; then
    return
  fi
  CLEANED_UP=1
  echo ""
  echo "Shutting down BlockExDSE..."
  for pid in "${PIDS[@]:-}"; do
    if [ -n "${pid:-}" ] && kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
    fi
  done
  wait 2>/dev/null || true
  echo "All processes stopped."
}
trap cleanup EXIT
trap 'cleanup; exit 130' INT TERM

port_in_use() {
  (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null && { exec 3>&- 3<&-; return 0; } || return 1
}

wait_for_http() {
  local url="$1" name="$2" tries=60
  until curl -sf "$url" >/dev/null 2>&1; do
    tries=$((tries - 1))
    if [ "$tries" -le 0 ]; then
      echo "Timed out waiting for $name at $url" >&2
      echo "Check $LOG_DIR for logs." >&2
      exit 1
    fi
    sleep 0.5
  done
}

echo "=== Checking required ports are free ==="
for p in 8545 9001 9002 9003 5173; do
  if port_in_use "$p"; then
    echo "Port $p is already in use. Stop whatever is using it and try again." >&2
    exit 1
  fi
done

echo "=== 1/5 Installing dependencies ==="
if [ ! -d node_modules ]; then
  npm install
else
  echo "Root node_modules already present, skipping."
fi
if [ ! -d frontend/node_modules ]; then
  (cd frontend && npm install)
else
  echo "frontend/node_modules already present, skipping."
fi

echo "=== 2/5 Setting up Python edge-layer environment ==="
if [ ! -d edge/venv ]; then
  python3 -m venv edge/venv
fi
# shellcheck disable=SC1091
source edge/venv/bin/activate
pip install -q -r edge/requirements.txt
deactivate

echo "=== 3/5 Compiling contract, starting local blockchain, running lifecycle demo ==="
node scripts/compile-check.js

node_modules/.bin/hardhat node > "$LOG_DIR/hardhat-node.log" 2>&1 &
PIDS+=("$!")
wait_for_http "http://127.0.0.1:8545" "Hardhat node"
echo "Hardhat local blockchain running on http://127.0.0.1:8545 (log: logs/hardhat-node.log)"

node scripts/deploy-and-test.js

echo ""
echo "Deploying a fresh contract instance for the UI..."
node_modules/.bin/hardhat run scripts/deploy-local.js --network localhost

if port_in_use 27017; then
  echo "MongoDB detected on 27017 — off-chain records (D1/D2/D5/D6) will be persisted."
else
  echo "No MongoDB on 27017 — off-chain records won't be persisted this run (set MONGO_URL to enable)."
fi

echo ""
echo "=== 4/5 Starting the 3-node edge layer (PBFT-lite consensus) ==="
# Hardhat's well-known local test account #0 — already the contract's admin
# and delegate #1 (see scripts/deploy-local.js) — signs the edge layer's
# on-chain forwarding (placeOrderFor/recordMatch/settleTrade) for this local
# run. Never reuse a real key this way outside local development.
DELEGATE_KEY="0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
for i in 1 2 3; do
  port=$((9000 + i))
  (
    # shellcheck disable=SC1091
    source edge/venv/bin/activate
    EDGE_ID="$i" PORT="$port" RPC_URL="http://127.0.0.1:8545" DELEGATE_PRIVATE_KEY="$DELEGATE_KEY" python3 edge/edge_node.py
  ) > "$LOG_DIR/edge-node-$i.log" 2>&1 &
  PIDS+=("$!")
done

for i in 1 2 3; do
  port=$((9000 + i))
  wait_for_http "http://127.0.0.1:$port/health" "Edge node $i"
done

echo ""
echo "=== 5/5 Starting the frontend ==="
(cd frontend && node_modules/.bin/vite --port 5173 --strictPort) > "$LOG_DIR/frontend.log" 2>&1 &
PIDS+=("$!")
wait_for_http "http://127.0.0.1:5173" "Frontend"

cat <<'EOF'

============================================================
 BlockExDSE is up and running:

   Frontend (UI):              http://127.0.0.1:5173
   Blockchain (Hardhat node):  http://127.0.0.1:8545
   Edge node 1:                http://127.0.0.1:9001
   Edge node 2:                http://127.0.0.1:9002
   Edge node 3:                http://127.0.0.1:9003

 Open the frontend in your browser and connect a wallet (e.g. MetaMask)
 pointed at the local Hardhat network (chain ID 31337, RPC
 http://127.0.0.1:8545) to try it out. Import one of Hardhat's default
 test account private keys to get funds + a pre-verified KYC account.

 Orders submitted through the Edge Layer tab are now forwarded on-chain
 automatically when a batch is approved (matched + settled), so a
 successful batch shows up in the Explorer tab moments later.

 Logs are in ./logs/

 Press Ctrl+C to stop everything.
============================================================
EOF

wait
