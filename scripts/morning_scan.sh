#!/bin/bash
# Daily morning scan — screens the rules.json watchlist for High Tight Flag /
# Power Play on daily bars, saves a dated JSON report, and prints a summary.
#
# REQUIRES TradingView running with CDP on :9222. A cron job cannot reliably
# launch a GUI app (no display in cron's environment), so make sure TradingView
# is already open with the debug port — e.g. via scripts/launch_tv_debug_linux.sh.
#
# Schedule example (weekdays at 08:00, Mon-Fri):
#   crontab -e
#   0 8 * * 1-5 /full/path/to/scripts/morning_scan.sh >> "$HOME/.tradingview-mcp/scans/cron.log" 2>&1
#
# You can also just run it by hand any time:  ./scripts/morning_scan.sh

set -uo pipefail

PORT="${CDP_PORT:-9222}"
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="$HOME/.tradingview-mcp/scans"
OUT_FILE="$OUT_DIR/$(date +%Y-%m-%d).json"
mkdir -p "$OUT_DIR"

# CDP must already be up — we don't try to launch the GUI from here.
if ! curl -s --max-time 4 "http://localhost:$PORT/json/version" 2>/dev/null | grep -q Browser; then
  echo "[morning_scan $(date '+%F %T')] CDP nicht erreichbar auf :$PORT."
  echo "  TradingView mit Debug-Port starten:  $PROJECT_DIR/scripts/launch_tv_debug_linux.sh"
  exit 2
fi

cd "$PROJECT_DIR" || exit 1

# TradingView-Watchlist (Quelle) -> rules.json (gefilterte Aktien) synchronisieren.
# Schlaegt das fehl (z.B. Panel nicht lesbar), wird die vorhandene rules.json gescannt.
node src/cli/index.js watchlist sync 2>/dev/null && echo "[morning_scan] Watchlist -> rules.json synchronisiert" || echo "[morning_scan] Sync uebersprungen, nutze vorhandene rules.json"

node src/cli/index.js patterns -s watchlist > "$OUT_FILE" 2>/dev/null

# Human-readable summary from the saved JSON -> also written to a .txt for delivery.
# Uses the shared Node formatter (scan_summary.js) so Linux and Windows produce
# identical output and Windows needs no Python.
SUMMARY_FILE="${OUT_FILE%.json}.txt"
node scripts/scan_summary.js "$OUT_FILE" | tee "$SUMMARY_FILE"

# Optionale Zustellung per Telegram (nur wenn .env Bot-Token/Chat-ID enthält).
if [ -f "$SUMMARY_FILE" ]; then
  node scripts/telegram_send.js < "$SUMMARY_FILE" 2>/dev/null && echo "[morning_scan] Briefing per Telegram gesendet" || echo "[morning_scan] Telegram nicht konfiguriert/erreichbar (uebersprungen)"
fi
