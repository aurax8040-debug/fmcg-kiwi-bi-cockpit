#!/bin/bash
cd -- "$(dirname -- "$0")" || exit 1
exec python3 scripts/start-local-demo.py
