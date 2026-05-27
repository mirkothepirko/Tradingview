<#
.SYNOPSIS
  Startet TradingView Desktop (Windows) mit aktiviertem Chrome DevTools Protocol
  (Remote-Debugging-Port) fuer die Morning-Scan-Routine.

.DESCRIPTION
  Funktioniert fuer die Microsoft-Store-/MSIX-Installation (Standard) UND fuer
  klassische .exe-Installationen.

  Wichtig: Store-Apps lassen sich nicht direkt mit Kommandozeilen-Argumenten
  starten. TradingView ist eine Electron-App und liest beim Start die
  Umgebungsvariable ELECTRON_EXTRA_LAUNCH_ARGS. Dieser Launcher setzt sie
  PERSISTENT auf User-Ebene (die Store-Aktivierung erbt die Prozess-Umgebung des
  Launchers NICHT zuverlaessig) und startet die App.

  Nebeneffekt: Die User-Variable gilt fuer ALLE Electron-Apps. In der Praxis
  belegt die zuerst gestartete App (hier TradingView beim Login) Port 9222;
  spaeter gestartete Electron-Apps ignorieren den dann belegten Port. Mit
  '-Cleanup' laesst sich die Variable wieder entfernen.

.PARAMETER Port     Debug-Port (Standard 9222).
.PARAMETER Cleanup  Entfernt die persistente Umgebungsvariable und beendet.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\launch_tv_debug_win.ps1
#>
param(
  [int]$Port = 9222,
  [switch]$Cleanup
)

$ErrorActionPreference = 'Stop'
$argsValue = "--remote-debugging-port=$Port"

if ($Cleanup) {
  [Environment]::SetEnvironmentVariable('ELECTRON_EXTRA_LAUNCH_ARGS', $null, 'User')
  Write-Host "ELECTRON_EXTRA_LAUNCH_ARGS (User) entfernt."
  return
}

# 1) Laufende TradingView-Instanz beenden (sonst greift der neue Port nicht).
Get-Process -Name 'TradingView' -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

# 2) Debug-Argument fuer Electron setzen — persistent (User) + im aktuellen Prozess.
[Environment]::SetEnvironmentVariable('ELECTRON_EXTRA_LAUNCH_ARGS', $argsValue, 'User')
$env:ELECTRON_EXTRA_LAUNCH_ARGS = $argsValue

# 3) Startmethode: Store-App (AUMID) bevorzugt, sonst klassische .exe.
$launched = $false
$aumid = (Get-StartApps | Where-Object { $_.Name -match 'TradingView' } | Select-Object -First 1).AppID
if (-not $aumid) { $aumid = 'TradingView.Desktop_n534cwy3pjxzj!TradingView.Desktop' }  # Fallback: Store-Standard-ID

if ($aumid) {
  try {
    Start-Process "shell:AppsFolder\$aumid"
    Write-Host "TradingView (Store-App) gestartet: $aumid"
    $launched = $true
  } catch {
    Write-Host "Store-Start fehlgeschlagen ($($_.Exception.Message)), versuche klassische .exe ..."
  }
}

if (-not $launched) {
  $exe = @(
    "$env:LOCALAPPDATA\TradingView\TradingView.exe",
    "$env:LOCALAPPDATA\Programs\TradingView\TradingView.exe",
    "$env:ProgramFiles\TradingView\TradingView.exe",
    "${env:ProgramFiles(x86)}\TradingView\TradingView.exe"
  ) | Where-Object { Test-Path $_ } | Select-Object -First 1
  if (-not $exe) {
    Write-Host "Fehler: TradingView weder als Store-App noch als .exe gefunden."
    exit 1
  }
  Start-Process -FilePath $exe -ArgumentList $argsValue
  Write-Host "TradingView (.exe) gestartet: $exe"
}

# 4) Auf CDP warten.
Write-Host "Warte auf CDP auf Port $Port ..."
for ($i = 0; $i -lt 30; $i++) {
  Start-Sleep -Seconds 1
  try {
    $r = Invoke-WebRequest -Uri "http://localhost:$Port/json/version" -UseBasicParsing -TimeoutSec 2
    if ($r.StatusCode -eq 200) {
      Write-Host "CDP bereit: http://localhost:$Port"
      Write-Output $r.Content
      exit 0
    }
  } catch { }
}

Write-Host ""
Write-Host "WARNUNG: CDP antwortet nach 30 s nicht auf Port $Port."
Write-Host "Die Variable ELECTRON_EXTRA_LAUNCH_ARGS=$argsValue ist gesetzt (User-Ebene)."
Write-Host "Bitte TradingView KOMPLETT schliessen (auch im Infobereich/Tray rechtsklick -> Beenden)"
Write-Host "und dieses Skript erneut ausfuehren — Electron liest die Variable nur bei einem echten Neustart."
exit 2
