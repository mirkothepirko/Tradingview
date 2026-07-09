#!/bin/bash
# Einmal-Login-Helfer fuer die headless TradingView-App.
#
# Startet einen VNC-Server auf dem virtuellen Bildschirm :99, an den die
# TradingView-App gebunden ist. Der VNC-Port wird NUR an 127.0.0.1 gebunden
# (-localhost) und ist passwortgeschuetzt — von aussen also nicht erreichbar.
# Zugriff ausschliesslich ueber einen SSH-Tunnel.
#
# Ablauf:
#   1. Auf dem SERVER (als root oder tvuser):
#        sudo -u tvuser /home/tvuser/tradingview-mcp/deploy/headless/start-vnc-login.sh
#      -> beim ersten Mal wird ein VNC-Passwort abgefragt und gespeichert.
#
#   2. Auf deinem WINDOWS-Rechner einen SSH-Tunnel oeffnen:
#        ssh -L 5900:127.0.0.1:5900 root@<SERVER-IP>
#
#   3. Mit einem VNC-Viewer (z.B. TightVNC/RealVNC) verbinden zu:
#        127.0.0.1:5900
#      -> du siehst den TradingView-Login. Einloggen, Watchlist pruefen.
#
#   4. Danach VNC wieder beenden (Strg+C in diesem Terminal) — die
#      TradingView-Session bleibt im Snap-Datenverzeichnis gespeichert.
#
# VNC laeuft bewusst NICHT dauerhaft (nur fuer Login/Wartung), um die
# Angriffsflaeche kleinzuhalten.

set -euo pipefail

VNC_PASSWD="$HOME/.vnc/passwd"

if [ ! -f "$VNC_PASSWD" ]; then
  echo "Kein VNC-Passwort gefunden — bitte jetzt eines setzen:"
  mkdir -p "$HOME/.vnc"
  x11vnc -storepasswd "$VNC_PASSWD"
fi

echo "Starte VNC auf :99, gebunden an 127.0.0.1:5900 (nur ueber SSH-Tunnel erreichbar)."
echo "Zum Beenden: Strg+C"
exec x11vnc -display :99 -rfbauth "$VNC_PASSWD" -localhost -rfbport 5900 -noxdamage -forever
