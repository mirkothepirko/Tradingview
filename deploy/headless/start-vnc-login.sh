#!/usr/bin/env bash
#
# start-vnc-login.sh — einmaliger, sicherer VNC-Zugang für den TradingView-Login
# auf dem headless Ubuntu-Server (kein Monitor).
#
# Wozu: Die TradingView-App zeichnet ihr Fenster auf den virtuellen Bildschirm
# Xvfb ":99". Dieses Skript legt einen VNC-Zugang auf genau dieses Display –
# aber NUR auf localhost (127.0.0.1) und passwortgeschützt. So kannst du dich
# einmalig per VNC einloggen; die Session bleibt danach im App-Profil gespeichert.
#
# Ablauf:
#   1) Auf dem Server:   ./start-vnc-login.sh
#   2) Auf Windows:      ssh -L 5900:localhost:5900 <user>@<server-ip>
#   3) VNC-Viewer  ->    localhost:5900  (VNC-Passwort eingeben)
#   4) Im TradingView-Fenster einloggen (E-Mail/Passwort, ggf. 2FA).
#   5) VNC-Verbindung trennen -> x11vnc beendet sich dank "-once" von selbst.
#
# Sicherheit: VNC ist unverschlüsselt -> deshalb "-localhost" + SSH-Tunnel.
# NIEMALS ohne Tunnel auf einer öffentlichen IP betreiben.

set -euo pipefail

DISPLAY_NUM=":99"                     # virtueller Bildschirm der TradingView-App
PORT="5900"                           # VNC-Port (nur localhost)
TVUSER="tvuser"                       # Nutzer, unter dem App + Xvfb laufen
PWFILE="/home/${TVUSER}/.vnc/login.pass"

# 1) Einmalig ein VNC-Passwort setzen, falls noch keins existiert.
#    (Interaktiv – fragt dich zweimal nach dem Passwort und speichert es verschlüsselt.)
if [[ ! -f "$PWFILE" ]]; then
  echo "Kein VNC-Passwort gefunden. Bitte jetzt eins vergeben:"
  sudo -u "$TVUSER" mkdir -p "$(dirname "$PWFILE")"
  sudo -u "$TVUSER" x11vnc -storepasswd "$PWFILE"
fi

echo "Starte x11vnc auf Display ${DISPLAY_NUM}, gebunden an 127.0.0.1:${PORT} ..."
echo
echo "  Jetzt auf Windows:  ssh -L ${PORT}:localhost:${PORT} <user>@<server-ip>"
echo "  Dann VNC-Viewer  ->  localhost:${PORT}"
echo "  Nach dem Login VNC trennen -> x11vnc beendet sich automatisch (-once)."
echo

# -localhost : lauscht nur auf 127.0.0.1  | -once : beendet sich nach dem Trennen
# -rfbauth   : verschlüsselte Passwortdatei | -shared : parallele Verbindung erlaubt
exec sudo -u "$TVUSER" \
  x11vnc -display "$DISPLAY_NUM" \
         -rfbauth "$PWFILE" \
         -localhost \
         -rfbport "$PORT" \
         -once \
         -shared
