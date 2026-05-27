#!/bin/bash
# Installiert einen Autostart-Eintrag (XDG .desktop), der TradingView beim Login
# automatisch mit aktiviertem Chrome DevTools Protocol (Debug-Port) startet.
#
# Hintergrund: Der 07:30-Cron-Scan (morning_scan.sh) braucht ein laufendes
# TradingView mit Debug-Port. Cron selbst kann keine GUI-App starten (kein Display),
# deshalb sorgt dieser Autostart dafuer, dass TradingView nach jedem Login bereitsteht.
#
# Aufruf:    ./scripts/install_autostart_linux.sh [port]   (Standard-Port: 9222)
# Entfernen: rm ~/.config/autostart/tradingview-debug.desktop
set -euo pipefail

PORT="${1:-9222}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LAUNCHER="$SCRIPT_DIR/launch_tv_debug_linux.sh"
AUTOSTART_DIR="$HOME/.config/autostart"
DESKTOP_FILE="$AUTOSTART_DIR/tradingview-debug.desktop"

if [ ! -x "$LAUNCHER" ]; then
  echo "Fehler: Start-Skript nicht gefunden oder nicht ausfuehrbar:"
  echo "  $LAUNCHER"
  exit 1
fi

mkdir -p "$AUTOSTART_DIR"

# 'sleep 20' gibt dem Desktop/Display-Server Zeit, vollstaendig hochzukommen,
# bevor TradingView (Electron) startet -> vermeidet Race-Conditions beim Login.
cat > "$DESKTOP_FILE" <<EOF
[Desktop Entry]
Type=Application
Name=TradingView (Debug-Port $PORT)
Comment=Startet TradingView Desktop mit CDP-Debug-Port fuer den Morning-Scan
Exec=bash -lc "sleep 20 && '$LAUNCHER' $PORT"
Terminal=false
X-GNOME-Autostart-enabled=true
EOF

echo "Autostart eingerichtet:"
echo "  $DESKTOP_FILE"
echo "  -> startet beim naechsten Login: $LAUNCHER (Port $PORT)"
echo ""
echo "Entfernen mit:  rm \"$DESKTOP_FILE\""
