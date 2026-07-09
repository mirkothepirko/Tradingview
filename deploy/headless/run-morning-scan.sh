#!/bin/bash
# Cron-Wrapper fuer den headless Server: setzt die Display-/Runtime-Umgebung,
# die ein Cron-Job sonst nicht erbt, und ruft dann das unveraenderte
# morning_scan.sh des Repos auf.
#
# TradingView laeuft hier als Dauerdienst (systemd: tradingview.service),
# der CDP-Port ist also normalerweise schon offen. Faellt er doch aus,
# greift die Selbst-Reparatur in morning_scan.sh (mit Telegram-Warnung).

export DISPLAY=:99
export XDG_RUNTIME_DIR=/run/user/1000
export HOME=/home/tvuser

REPO="/home/tvuser/tradingview-mcp"
exec "$REPO/scripts/morning_scan.sh"
