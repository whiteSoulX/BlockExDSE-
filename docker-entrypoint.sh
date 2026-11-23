#!/usr/bin/env bash
set -e

# Ensure logs directory exists
mkdir -p /app/logs

# If arguments are passed as flags, prepend default flags
if [ $# -eq 0 ]; then
    exec python3 run.py --no-browser --lan
elif [[ "$1" == -* ]]; then
    exec python3 run.py --no-browser --lan "$@"
elif [ "$1" = "bash" ] || [ "$1" = "sh" ] || [ "$1" = "python" ] || [ "$1" = "python3" ]; then
    exec "$@"
else
    exec python3 run.py "$@"
fi
