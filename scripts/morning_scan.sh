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

# Human-readable summary from the saved JSON.
python3 - "$OUT_FILE" <<'PY'
import sys, json
try:
    d = json.load(open(sys.argv[1]))
except Exception as e:
    print("[morning_scan] Konnte Report nicht lesen:", e); sys.exit(1)
res = d.get("results", [])
hits = [r for r in res if r.get("patterns")]
print(f"=== Morning Scan {d.get('generated_at','')[:10]} — {len(res)} Symbole (Daily) ===")
print("Rangliste nach Score:")
for r in d.get("ranked", []):
    mark = "  <= TREFFER" if r.get("patterns") else ""
    print(f"  {r['symbol']:14} {r.get('score',0):>3}  {','.join(r.get('patterns',[])) or '-'}{mark}")
if hits:
    print("\n>>> Kandidaten:")
    for r in hits:
        print(f"  {r['symbol']}: {r['patterns']}")
        for n in r.get("notes", []):
            print("     -", n)
else:
    print("\nKeine strengen HTF/Power-Play-Treffer heute.")
print(f"\nReport: {sys.argv[1]}")
PY
