<#
.SYNOPSIS
  Taeglicher Morning-Scan (Windows-Pendant zu morning_scan.sh):
  synchronisiert die Watchlist, scannt auf High Tight Flag / Power Play,
  speichert einen datierten Report + Zusammenfassung und sendet sie per Telegram.

.DESCRIPTION
  Bevorzugt ein bereits laufendes TradingView mit CDP auf :Port. Ist CDP nicht
  erreichbar (z.B. nach einem App-Crash), wird einmal best-effort der Launcher
  (launch_tv_debug_win.ps1) aufgerufen. Klappt auch das nicht, schickt das Skript
  eine kurze Telegram-Warnung — der Ausfall bleibt also nicht unbemerkt.

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

function Test-CDP {
  try {
    $v = Invoke-WebRequest -Uri "http://localhost:$Port/json/version" -UseBasicParsing -TimeoutSec 4
    return ($v.Content -match 'Browser')
  } catch { return $false }
}

# Sendet eine kurze Warnung per Telegram (still, falls .env nicht konfiguriert).
function Send-Warn {
  param([string]$Text)
  $Text | node "$ProjectDir\scripts\telegram_send.js"
  if ($LASTEXITCODE -eq 0) { Write-Host "[morning_scan] Warnung per Telegram gesendet" }
  else { Write-Host "[morning_scan] Warnung konnte nicht per Telegram gesendet werden (uebersprungen)" }
}

if (-not (Test-CDP)) {
  Write-Host "[morning_scan $(Get-Date -Format 'u')] CDP nicht erreichbar auf :$Port -> Reparaturversuch."

  # Aufgabenplanung-Tasks laufen im User-Kontext mit Display -> Launcher direkt aufrufen.
  & "$PSScriptRoot\launch_tv_debug_win.ps1" -Port $Port

  # Puffer: Launcher pollt selbst bis 30 s; bis zu 15 s mehr fuer langsames TV-Hochfahren.
  for ($i = 1; $i -le 15; $i++) {
    if (Test-CDP) {
      Write-Host "[morning_scan] CDP nach Reparatur wieder erreichbar (Puffer +${i}s)."
      break
    }
    Start-Sleep -Seconds 1
  }

  if (-not (Test-CDP)) {
    Write-Host "[morning_scan $(Get-Date -Format 'u')] Reparaturversuch fehlgeschlagen, breche ab."
    Send-Warn "⚠️ Morning-Scan ausgefallen — TradingView/CDP auf :$Port nicht erreichbar (Reparaturversuch fehlgeschlagen). Bitte manuell pruefen."
    try { Stop-Transcript | Out-Null } catch { }
    exit 2
  }
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
