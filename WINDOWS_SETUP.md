# Morning-Routine auf Windows 11

Diese Anleitung richtet dieselbe tägliche HTF/Power-Play-Routine wie auf Linux ein,
nur mit Windows-Bordmitteln (PowerShell + Aufgabenplanung statt Bash + cron).
Die eigentliche Logik (Scan, Risiko-Filter, Telegram) ist plattformneutrales Node —
nur Start, Zeitplan und das „Drumherum" sind Windows-spezifisch.

> Voraussetzungen: **Node.js** und **Git** sind installiert, das Repo ist geklont.
> TradingView ist als **Microsoft-Store-App** installiert.

## Beteiligte Skripte

| Datei | Aufgabe |
|---|---|
| `scripts/launch_tv_debug_win.ps1` | Startet TradingView mit CDP-Debug-Port (Store-App-tauglich) |
| `scripts/morning_scan.ps1` | Sync → Scan → Zusammenfassung → Telegram (Pendant zu `morning_scan.sh`) |
| `scripts/scan_summary.js` | Formatiert den Report (gemeinsam mit Linux, daher **kein Python nötig**) |
| `scripts/install_schedule_win.ps1` | Legt die zwei geplanten Aufgaben an (Autostart + 07:30-Scan) |

## Einrichtung (einmalig)

Alle Befehle in **PowerShell** im Projektordner ausführen.

**1. Repo aktualisieren und Abhängigkeiten installieren**
```powershell
git pull
npm install
```

**2. Telegram konfigurieren** (die `.env` wird nie eingecheckt, muss also pro Rechner angelegt werden)
```powershell
Copy-Item .env.example .env
notepad .env
```
In der `.env` eintragen (gleicher Bot, gleiche Chat-ID wie auf dem Linux-Rechner):
```
TELEGRAM_BOT_TOKEN=<dein-Token-von-@BotFather>
TELEGRAM_CHAT_ID=85303838
```

**3. Launcher einmal manuell testen**
```powershell
powershell -ExecutionPolicy Bypass -File scripts\launch_tv_debug_win.ps1
```
Erwartung: TradingView öffnet sich und am Ende erscheint `CDP bereit: http://localhost:9222`.
→ Falls stattdessen die `WARNUNG: CDP antwortet nicht` kommt, siehe **Fehlerbehebung** unten.

**4. Scan einmal manuell testen** (TradingView muss aus Schritt 3 noch laufen)
```powershell
powershell -ExecutionPolicy Bypass -File scripts\morning_scan.ps1
```
Erwartung: die Watchlist wird gescannt, das Briefing erscheint in der Konsole und kommt per Telegram an.

**5. Geplante Aufgaben einrichten**
```powershell
powershell -ExecutionPolicy Bypass -File scripts\install_schedule_win.ps1
```
Damit laufen ab jetzt automatisch:
- **„TradingView CDP Autostart"** — beim Login: startet TradingView mit Debug-Port.
- **„TradingView Morning Scan"** — Mo–Fr 07:30: führt den Scan aus und schickt das Briefing.

Andere Uhrzeit: `... install_schedule_win.ps1 -Time 08:15`

## Prüfen & Bedienen

```powershell
# Sind die Aufgaben da?
Get-ScheduledTask -TaskName 'TradingView CDP Autostart','TradingView Morning Scan'

# Scan sofort testweise auslösen (statt bis 07:30 zu warten):
Start-ScheduledTask -TaskName 'TradingView Morning Scan'

# Was lief beim letzten (unbeaufsichtigten) Lauf? -> Log:
Get-Content "$HOME\.tradingview-mcp\scans\scan.log" -Tail 40

# Aufgaben wieder entfernen:
powershell -ExecutionPolicy Bypass -File scripts\install_schedule_win.ps1 -Remove
```

## Fehlerbehebung

**„CDP antwortet nicht" nach dem Launcher**
Store-Apps starten anders als normale Programme. TradingView (eine Electron-App) liest
den Debug-Port aus der Umgebungsvariable `ELECTRON_EXTRA_LAUNCH_ARGS`. Der Launcher setzt
sie dauerhaft (User-Ebene). Electron liest sie aber **nur bei einem echten Neustart**.
→ TradingView **komplett schließen**, auch im Infobereich (Tray) unten rechts → Rechtsklick
auf das TradingView-Symbol → Beenden. Dann den Launcher erneut ausführen.

**Nebeneffekt der Umgebungsvariable**
`ELECTRON_EXTRA_LAUNCH_ARGS` gilt für *alle* Electron-Apps dieses Benutzers. In der Praxis
belegt die zuerst gestartete App (TradingView beim Login) den Port 9222; später gestartete
Electron-Apps ignorieren ihn dann. Wer die Variable loswerden will:
```powershell
powershell -ExecutionPolicy Bypass -File scripts\launch_tv_debug_win.ps1 -Cleanup
```

**Die 07:30-Aufgabe lief, aber das Briefing war leer**
Dann war CDP um 07:30 nicht oben — meist weil TradingView nach einem Neustart noch nicht
(neu) gestartet war. Der Autostart-Task greift beim **Login**; bleibt der PC ausgeloggt,
fehlt der Chart. Im Zweifel den Launcher morgens einmal manuell ausführen.

**`node` wird nicht gefunden (in der Aufgabe)**
Node muss im PATH des Benutzers sein (Standard nach der Node-Installation). Prüfen:
`node --version` in einer neuen PowerShell.

## Linux vs. Windows — Überblick

| | Linux | Windows |
|---|---|---|
| TradingView starten | `launch_tv_debug_linux.sh` | `launch_tv_debug_win.ps1` |
| Scan-Routine | `morning_scan.sh` | `morning_scan.ps1` |
| Zeitplan | `cron` (`30 7 * * 1-5`) | Aufgabenplanung (`install_schedule_win.ps1`) |
| Autostart | `~/.config/autostart/*.desktop` | Aufgabe „TradingView CDP Autostart" (AtLogOn) |
| Report formatieren | `scan_summary.js` | `scan_summary.js` (identisch) |
