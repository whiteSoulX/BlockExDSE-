# BlockExDSE v2.0 - Docker Container
# Combines Node.js 20 LTS (Hardhat EVM node & Solidity compiler)
# and Python 3.12 (FastAPI edge validators, gateway, and Web3 settlement)

FROM python:3.12-slim-bookworm

# Avoid prompts during apt installs
ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONUNBUFFERED=1 \
    PYTHONIOENCODING=utf-8 \
    HOST=0.0.0.0

# Install required system packages, build tools for secp256k1/coincurve, and Node.js 20 LTS
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    gnupg \
    build-essential \
    git \
    procps \
 && mkdir -p /etc/apt/keyrings \
 && curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg \
 && echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_20.x nodistro main" > /etc/apt/sources.list.d/nodesource.list \
 && apt-get update && apt-get install -y --no-install-recommends nodejs \
 && apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 1. Pre-install Node.js dependencies (Hardhat) for layer caching
COPY package.json package-lock.json ./
RUN npm install --no-audit --no-fund

# 2. Pre-create Python virtual environment and install dependencies
COPY edge/requirements.txt ./edge/
RUN python3 -m venv /app/.venv \
 && /app/.venv/bin/pip install --no-cache-dir --upgrade pip \
 && /app/.venv/bin/pip install --no-cache-dir -r edge/requirements.txt \
 && (/app/.venv/bin/pip install --no-cache-dir coincurve || true) \
 && python3 -c "import hashlib, pathlib; p = pathlib.Path('edge/requirements.txt'); pathlib.Path('/app/.venv/.deps-hash').write_text(hashlib.sha256(p.read_bytes()).hexdigest())"

# Put venv on PATH so python and pip default to the virtual environment
ENV PATH="/app/.venv/bin:$PATH"

# 3. Copy application codebase
COPY . .

# 4. Clean up any leftover host-specific files (e.g. Windows venv/node_modules/logs if copied)
RUN rm -rf logs artifacts cache deployment.json \
 && mkdir -p logs

# 5. Pre-compile Solidity contracts (downloads & caches solc 0.8.20 compiler)
RUN npx hardhat compile

# 6. Make entrypoint executable
RUN chmod +x docker-entrypoint.sh run_all.sh

# Expose ports:
#   9001: Gateway & Trading Web Dashboard
#   9002: Edge Node 2 (Validator)
#   9003: Edge Node 3 (Validator)
#   9004: Edge Node 4 (Validator)
#   8545: Hardhat EVM Blockchain JSON-RPC
EXPOSE 9001 9002 9003 9004 8545

# Healthcheck checking the gateway info endpoint
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
  CMD curl -f http://127.0.0.1:9001/api/info || exit 1

ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["--no-browser", "--lan"]
