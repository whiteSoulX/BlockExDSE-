#!/usr/bin/env bash
# Linux / macOS one-command launcher (delegates to the cross-platform run.py)
cd "$(dirname "$0")"
exec python3 run.py "$@"
