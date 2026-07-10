#!/bin/bash
# Daily morning scan — screens the rules.json watchlist for High Tight Flag /
# Power Play on daily bars, saves a dated JSON report, and prints a summary.
#
# Prefers TradingView already running with CDP on :9222 (e.g. via the autostart
# entry from scripts/install_autostart_linux.sh). If CDP is not reachable, this
# script makes one best-effort attempt to relaunch TradingView (deriving the
# user-session display env from systemd, so it also works from cron). If that
# also fails, it sends a short Telegram warning so the failure isn't silent.
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

cdp_up() {
  curl -s --max-time 4 "http://localhost:$PORT/json/version" 2>/dev/null | grep -q Browser
}

# Sendet eine kurze Warnung per Telegram (still, falls .env nicht konfiguriert).
send_warn() {
  printf '%s\n' "$1" | node "$PROJECT_DIR/scripts/telegram_send.js" \
    && echo "[morning_scan] Warnung per Telegram gesendet" \
    || echo "[morning_scan] Warnung konnte nicht per Telegram gesendet werden (uebersprungen) — siehe stderr oben"
}

if ! cdp_up; then
  echo "[morning_scan $(date '+%F %T')] CDP nicht erreichbar auf :$PORT -> Reparaturversuch."

  # Cron erbt keine Display-Umgebung. Aus systemd-User-Environment ableiten,
  # mit Fallbacks fuer Standard-Single-User-Sitzungen.
  eval "$(systemctl --user show-environment 2>/dev/null \
    | grep -E '^(DISPLAY|WAYLAND_DISPLAY|XDG_RUNTIME_DIR|DBUS_SESSION_BUS_ADDRESS)=' \
    | sed 's/^/export /')" || true
  : "${DISPLAY:=:0}"
  : "${WAYLAND_DISPLAY:=wayland-0}"
  : "${XDG_RUNTIME_DIR:=/run/user/$(id -u)}"
  export DISPLAY WAYLAND_DISPLAY XDG_RUNTIME_DIR

  # stdio voll umlenken: TV erbt die fds vom Launcher; ohne diese Umleitung wuerde
  # TV unseren stdout-Pipe offen halten und ein '| tail'-Aufruf nie EOF sehen.
  "$PROJECT_DIR/scripts/launch_tv_debug_linux.sh" "$PORT" </dev/null >>"$OUT_DIR/cron.log" 2>&1 || true

  # Puffer: Launcher pollt selbst 15 s; bis zu 15 s mehr fuer langsames TV-Hochfahren.
  for i in $(seq 1 15); do
    if cdp_up; then
      echo "[morning_scan] CDP nach Reparatur wieder erreichbar (Puffer +${i}s)."
      break
    fi
    sleep 1
  done

  if ! cdp_up; then
    echo "[morning_scan $(date '+%F %T')] Reparaturversuch fehlgeschlagen, breche ab."
    send_warn "⚠️ Morning-Scan ausgefallen — TradingView/CDP auf :$PORT nicht erreichbar (Reparaturversuch fehlgeschlagen). Bitte manuell pruefen."
    exit 2
  fi
fi

cd "$PROJECT_DIR" || exit 1

# Aufwaermphase: CDP antwortet zwar schon, aber Chart/API koennten noch laden
# (besonders kurz nach einer Selbst-Reparatur). Ohne dieses Warten landet ein
# frisch neugestartetes TV im Scan mit leeren Daten -> Briefing waere unvollstaendig.
# Ein tagesaktuelles Briefing nach vollstaendigem Scan ist obligatorisch:
# Timeout -> Warnung statt halbgares Briefing.
echo "[morning_scan] Aufwaermphase: warte bis TradingView bereit ist..."
if ! node scripts/wait_for_chart.js 60; then
  send_warn "⚠️ Morning-Scan: TradingView CDP erreichbar, aber Chart/API nach 60s nicht bereit. Vollstaendiges Briefing entfaellt heute."
  exit 2
fi

# TradingView-Watchlist (Quelle) -> rules.json (gefilterte Aktien) synchronisieren.
# Schlaegt das fehl (z.B. Panel nicht lesbar), wird die vorhandene rules.json gescannt.
node src/cli/index.js watchlist sync 2>/dev/null && echo "[morning_scan] Watchlist -> rules.json synchronisiert" || echo "[morning_scan] Sync uebersprungen, nutze vorhandene rules.json"

node src/cli/index.js patterns -s watchlist > "$OUT_FILE" 2>/dev/null

# Marktampel (Siebenhaar-Routine): Marktumfeld einsammeln -> eigenes JSON neben
# dem Scan. Bekommt den Pattern-Scan als Input (Ebene 1: Watchlist gruen/rot).
# Schlaegt sie fehl, geht das Briefing trotzdem raus — nur ohne Ampel-Block.
MARKET_FILE="${OUT_FILE%.json}-market.json"
node src/cli/index.js market -s "$OUT_FILE" > "$MARKET_FILE" 2>/dev/null \
  && echo "[morning_scan] Marktampel erstellt" \
  || echo "[morning_scan] Marktampel fehlgeschlagen — Briefing geht ohne sie raus"

# Human-readable summary from the saved JSON -> also written to a .txt for the
# archive/console. Uses the shared Node formatters (market_summary.js +
# scan_summary.js) so Linux and Windows produce identical output and Windows
# needs no Python.
SUMMARY_FILE="${OUT_FILE%.json}.txt"
{
  node scripts/market_summary.js "$MARKET_FILE"
  echo ""
  node scripts/scan_summary.js "$OUT_FILE"
} | tee "$SUMMARY_FILE"

# Zustellung per Telegram (nur wenn .env Bot-Token/Chat-ID enthaelt) — als ZWEI
# getrennte Nachrichten im HTML-Format: 1) Marktlage (Ampel), 2) Setups
# (HTF/Power Play). So hat die Marktlage Platz fuer weitere Bloecke (z.B.
# Wirtschaftsdaten) und keine Nachricht laeuft ins Telegram-Limit von 4096.
send_tg() { # $1 = Name fuers Log, Nachricht kommt von stdin
  node scripts/telegram_send.js --html \
    && echo "[morning_scan] $1 per Telegram gesendet" \
    || echo "[morning_scan] $1 konnte nicht per Telegram gesendet werden (uebersprungen) — siehe stderr oben"
}
# Marktlage = Ampel + Wirtschaftskalender (Termine heute). econ_calendar.js
# scheitert nie hart (Exit 0, Hinweiszeile bei Feed-Problemen).
{
  node scripts/market_summary.js --html "$MARKET_FILE"
  echo ""
  node scripts/econ_calendar.js --today --html
} | send_tg "Marktlage"
node scripts/scan_summary.js --html "$OUT_FILE" | send_tg "Setups"
