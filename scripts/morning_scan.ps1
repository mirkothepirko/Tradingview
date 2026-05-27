<#
.SYNOPSIS
  Taeglicher Morning-Scan (Windows-Pendant zu morning_scan.sh):
  synchronisiert die Watchlist, scannt auf High Tight Flag / Power Play,
  speichert einen datierten Report + Zusammenfassung und sendet sie per Telegram.

.DESCRIPTION
  Setzt voraus, dass TradingView mit CDP auf :Port laeuft (siehe
  launch_tv_debug_win.ps1) — eine geplante Aufgabe startet keine GUI selbst.

.PARAMETER Port  CDP-Port (Standard 9222, oder Umgebungsvariable CDP_PORT).

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\morning_scan.ps1
#>
param(
  [int]$Port = $(if ($env:CDP_PORT) { [int]$env:CDP_PORT } else { 9222 })
)

# UTF-8 fuer Pipes zu/von node, damit Umlaute im Briefing erhalten bleiben.
$utf8 = New-Object System.Text.UTF8Encoding($false)
$OutputEncoding = $utf8
try { [Console]::OutputEncoding = $utf8 } catch { }

$ProjectDir  = Split-Path -Parent $PSScriptRoot          # scripts\.. = Projektwurzel
$OutDir      = Join-Path $HOME '.tradingview-mcp\scans'
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$Stamp       = Get-Date -Format 'yyyy-MM-dd'
$OutFile     = Join-Path $OutDir "$Stamp.json"
$SummaryFile = Join-Path $OutDir "$Stamp.txt"
$LogFile     = Join-Path $OutDir 'scan.log'

# Mitschnitt fuer die unbeaufsichtigte Ausfuehrung (Aufgabenplanung).
try { Start-Transcript -Path $LogFile -Append | Out-Null } catch { }

# CDP muss bereits laufen — wir starten hier KEINE GUI.
$cdpOk = $false
try {
  $v = Invoke-WebRequest -Uri "http://localhost:$Port/json/version" -UseBasicParsing -TimeoutSec 4
  if ($v.Content -match 'Browser') { $cdpOk = $true }
} catch { }
if (-not $cdpOk) {
  Write-Host "[morning_scan $(Get-Date -Format 'u')] CDP nicht erreichbar auf :$Port."
  Write-Host "  TradingView mit Debug-Port starten:  $ProjectDir\scripts\launch_tv_debug_win.ps1"
  try { Stop-Transcript | Out-Null } catch { }
  exit 2
}

Set-Location $ProjectDir

# Watchlist (TradingView-UI) -> rules.json synchronisieren. Fehler ist nicht fatal.
node src/cli/index.js watchlist sync *> $null
if ($LASTEXITCODE -eq 0) { Write-Host "[morning_scan] Watchlist -> rules.json synchronisiert" }
else { Write-Host "[morning_scan] Sync uebersprungen, nutze vorhandene rules.json" }

# Scan -> JSON. Bewusst via .NET als UTF-8 OHNE BOM schreiben, sonst kann node
# (scan_summary.js) die Datei nicht als JSON parsen.
$json = node src/cli/index.js patterns -s watchlist 2> $null
[System.IO.File]::WriteAllText($OutFile, ($json -join "`n"), $utf8)

# Lesbare Zusammenfassung (gemeinsamer Formatter) -> Konsole + .txt.
$summary = node scripts/scan_summary.js $OutFile
$summary | ForEach-Object { Write-Host $_ }
[System.IO.File]::WriteAllText($SummaryFile, ($summary -join "`n"), $utf8)

# Optionaler Telegram-Versand (nur wenn .env Token/Chat-ID enthaelt).
if (Test-Path $SummaryFile) {
  Get-Content -Raw -Encoding UTF8 $SummaryFile | node scripts/telegram_send.js
  if ($LASTEXITCODE -eq 0) { Write-Host "[morning_scan] Briefing per Telegram gesendet" }
  else { Write-Host "[morning_scan] Telegram nicht konfiguriert/erreichbar (uebersprungen)" }
}

try { Stop-Transcript | Out-Null } catch { }
