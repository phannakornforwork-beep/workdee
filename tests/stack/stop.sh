#!/usr/bin/env bash
# หยุดระบบทดสอบที่เปิดจาก start.sh
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
STACK="${STACK_DIR:-$ROOT/.stack}"
for name in gateway rest auth; do
  if [ -f "$STACK/$name.pid" ]; then
    kill "$(cat "$STACK/$name.pid")" 2>/dev/null || true
    rm -f "$STACK/$name.pid"
  fi
done
