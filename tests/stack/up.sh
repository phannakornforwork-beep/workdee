#!/usr/bin/env bash
# เปิดระบบทดสอบแล้วค้างไว้จนกด Ctrl+C (ใช้ตอนพัฒนาในเครื่อง)
# Start the stack and keep this process alive until interrupted.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
STACK="${STACK_DIR:-$ROOT/.stack}"
bash "$ROOT/tests/stack/start.sh"
trap 'bash "$ROOT/tests/stack/stop.sh"; exit 0' INT TERM
tail -f "$STACK/logs/auth.log" "$STACK/logs/rest.log" "$STACK/logs/gateway.log"
