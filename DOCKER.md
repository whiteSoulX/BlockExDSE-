# Docker Deployment Guide for BlockExDSE v2.0

This directory contains containerization files to build and deploy **BlockExDSE v2.0** on Docker.

---

## Architecture Overview in Docker

The BlockExDSE v2.0 Docker container bundles the complete multi-party settlement ecosystem:
- **Hardhat EVM Blockchain Node** (Port `8545`): Local simulated blockchain with zero-latency or simulated block-mining intervals.
- **Node 1 (Gateway & Validator 1)** (Port `9001`): Serves the Web Dashboard SPA, authentication, order intake, signature aggregation, matching engine, and settlement execution.
- **Nodes 2, 3, 4 (Edge Validators)** (Ports `9002`, `9003`, `9004`): Independent signing nodes that validate investor signatures, price slabs, KYC on-chain, and size limits.

All dependencies (Node.js 20 LTS, Python 3.12, Hardhat, Web3.py, FastAPI, Solidity 0.8.20 compiler artifacts, and libsecp256k1/coincurve) are pre-packaged and cached in the image so container startup is fast (3-5 seconds).

---

## 1. Quick Start (Using Docker Compose)

The easiest way to run BlockExDSE v2.0 is with Docker Compose.

### Step 1: Start the Platform
From this folder (or the root folder):
```bash
docker compose up --build
```
Or run in the background (detached):
```bash
docker compose up --build -d
```

### Step 2: Open the Web Dashboard
Open your web browser and navigate to:
```
http://localhost:9001
```

You can sign in immediately using any of the built-in demo credentials:
- **Alice**: `alice@blockexdse.demo` / `Demo@123`
- **Bob**: `bob@blockexdse.demo` / `Demo@123`
- **Broker**: `broker@blockexdse.demo` / `Broker@123`
- **Admin**: `admin@blockexdse.demo` / `Admin@123`

### Step 3: Check Platform Logs
```bash
docker compose logs -f
```

### Step 4: Stop the Platform
```bash
docker compose down
```

---

## 2. Standalone Docker CLI (Without Docker Compose)

If you prefer building and running standard Docker commands:

### Build Image
```bash
docker build -t blockexdse:v2.0 .
```

### Run Container
```bash
docker run -d \
  --name blockexdse \
  -p 9001:9001 \
  -p 9002:9002 \
  -p 9003:9003 \
  -p 9004:9004 \
  -p 8545:8545 \
  blockexdse:v2.0
```

### View Live Logs
```bash
docker logs -f blockexdse
```

### Stop Container
```bash
docker stop blockexdse
docker rm blockexdse
```

---

## 3. Running Verification & Test Scripts Inside the Container

Once the container is running, you can run all 5 test suites and audits directly inside the container environment using `docker exec`:

```bash
# 1. Smoke test (15 checks: order lifecycle, quorums, hold & reviewer approval)
docker exec -it blockexdse python scripts/smoke_test.py

# 2. Security test (18 checks: signature verification, 9 attack tests, audit & tamper detection)
docker exec -it blockexdse python scripts/security_test.py

# 3. Onboarding test (14 checks: self-signup, OTP, ID verification, approval)
docker exec -it blockexdse python scripts/onboarding_test.py

# 4. Market test (15 checks: DSE & LSE dual-market, market orders, cancellation)
docker exec -it blockexdse python scripts/market_test.py

# 5. Independent Blockchain Audit (reconstructs state purely from EVM ledger logs)
docker exec -it blockexdse python scripts/audit_chain.py
```

---

## 4. Environment Variables & Options

You can customize runtime behavior by adding environment variables in `docker-compose.yml` or passing `-e KEY=VALUE` to `docker run`:

| Variable | Default | Description |
|---|---|---|
| `HOST` | `0.0.0.0` | IP binding for edge nodes. Must stay `0.0.0.0` in Docker. |
| `DEMO_DELAY` | `0.35` | Delay in seconds between visual animation stages on the dashboard. Set to `0` for high-throughput benchmarks. |
| `BLOCK_TIME_MS` | `0` | Hardhat mining interval in milliseconds. `0` = instant mining; `250` or `500` = simulated real-world block production interval. |
| `MONGO_URL` | *(none)* | MongoDB connection string. When provided, gateway stores orders in MongoDB instead of in-memory. |

### Running with Persistent MongoDB
To run BlockExDSE with an attached MongoDB 7.0 container:
```bash
docker compose --profile with-mongo up -d
```

---

## 5. Exposing on LAN / Remote Server

When hosting the Docker container on a remote VPS or local network server:
1. Ensure inbound firewall allows port `9001` (and optionally `9002-9004` / `8545` if external validator monitoring is needed).
2. Access the dashboard from any device on your network:
   ```
   http://<SERVER_IP>:9001
   ```
