#!/usr/bin/env bash
# One-command launcher: Hardhat node -> deploy -> 3 edge nodes. Ctrl+C stops everything.
set -e
cd "$(dirname "$0")"
mkdir -p logs
PY=.venv/bin/python

[ -d node_modules ] || npm install
[ -d .venv ] || python3 -m venv .venv
.venv/bin/pip install -q -r edge/requirements.txt

HH=(npx hardhat)
[ -n "$HARDHAT_CONFIG" ] && HH+=(--config "$HARDHAT_CONFIG")   # (testing only)
[ -n "$SKIP_COMPILE" ] || "${HH[@]}" compile

PIDS=()
cleanup() { echo; echo "Stopping..."; for p in "${PIDS[@]}"; do kill "$p" 2>/dev/null || true; done; }
trap cleanup EXIT INT TERM

for p in 8545 9001 9002 9003; do
  if (echo > /dev/tcp/127.0.0.1/$p) 2>/dev/null; then echo "Port $p is already in use. Stop the old process first (see README)."; exit 1; fi
done

"${HH[@]}" node > logs/hardhat.log 2>&1 & PIDS+=($!)
echo -n "Waiting for Hardhat node"
for i in $(seq 1 40); do
  curl -s -X POST -H 'content-type: application/json' --data '{"jsonrpc":"2.0","method":"eth_chainId","id":1}' http://127.0.0.1:8545 >/dev/null && break
  echo -n "."; sleep 1
done; echo

$PY edge/deploy.py

cd edge
for i in 1 2 3; do NODE_ID=$i ../$PY edge_node.py > ../logs/edge$i.log 2>&1 & PIDS+=($!); done
cd ..
for i in $(seq 1 20); do curl -s http://127.0.0.1:9001/api/info >/dev/null && break; sleep 1; done

echo
echo "BlockExDSE is running:"
echo "   Dashboard : http://localhost:9001"
echo "   Edge nodes: 9001 (gateway) 9002 9003   |  Hardhat RPC: 8545"
echo "   Logs      : ./logs   |   Ctrl+C to stop"
wait
