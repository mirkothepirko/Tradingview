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
SUMMARY_FILE="${OUT_FILE%.json}.txt"
python3 - "$OUT_FILE" <<'PY' | tee "$SUMMARY_FILE"
import sys, json
try:
    d = json.load(open(sys.argv[1]))
except Exception as e:
    print("[morning_scan] Konnte Report nicht lesen:", e); sys.exit(1)
res = d.get("results", [])
trade = d.get("tradeable", [])
hits  = [r for r in res if r.get("patterns")]
print(f"Morning Scan {d.get('generated_at','')[:10]} — {len(res)} Symbole (Daily)")
# 1) Handelbare Setups (Muster + einstelliges Swing-Low-Risiko) = die Vorauswahl
if trade:
    print(f"\nHANDELBAR ({len(trade)}):")
    for r in trade:
        print(f"  {r['symbol']}: {','.join(r.get('patterns',[]))} | Einstieg {r.get('entry')} / Stop {r.get('stop')} / Risiko {r.get('risk_pct')}% | Score {r.get('score')}")
else:
    print("\nHANDELBAR: keine (kein Muster mit einstelligem Risiko heute).")
# 2) Muster-Treffer, die am Risiko-Filter scheitern (zur Beobachtung)
filtered = [r for r in hits if not r.get("tradeable")]
if filtered:
    print(f"\nMuster erkannt, aber Risiko zu hoch ({len(filtered)} — beobachten):")
    for r in filtered:
        m = r.get("metrics", {})
        print(f"  {r['symbol']}: {','.join(r['patterns'])} | Risiko {m.get('risk_pct')}% | {m.get('dist_below_pivot_pct')}% unter Pivot")
# 3) Top nach Score (Kontext)
print("\nTop nach Score:")
for r in d.get("ranked", [])[:8]:
    print(f"  {r['symbol']:14} {r.get('score',0):>3}  {','.join(r.get('patterns',[])) or '-'}")
print(f"\nReport: {sys.argv[1]}")
PY

# Optionale Zustellung per Telegram (nur wenn .env Bot-Token/Chat-ID enthält).
if [ -f "$SUMMARY_FILE" ]; then
  node scripts/telegram_send.js < "$SUMMARY_FILE" 2>/dev/null && echo "[morning_scan] Briefing per Telegram gesendet" || echo "[morning_scan] Telegram nicht konfiguriert/erreichbar (uebersprungen)"
fi
