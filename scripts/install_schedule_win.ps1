<#
.SYNOPSIS
  Richtet die Windows-Aufgabenplanung fuer die Morning-Routine ein
  (Windows-Pendant zu cron + Autostart auf Linux).

  Aufgabe 1 "TradingView CDP Autostart" : startet TradingView beim Login mit
                                          Debug-Port (launch_tv_debug_win.ps1).
  Aufgabe 2 "TradingView Morning Scan"   : fuehrt Mo-Fr um <Time> den Scan aus
                                          (morning_scan.ps1).

.PARAMETER Port    Debug-Port (Standard 9222).
.PARAMETER Time    Uhrzeit des Scans (Standard 07:30).
.PARAMETER Remove  Entfernt beide Aufgaben wieder.

.NOTES
  In einer normalen PowerShell ausfuehren. Adminrechte sind nicht noetig —
  die Aufgaben laufen im eigenen Benutzerkontext.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\install_schedule_win.ps1
#>
param(
  [int]$Port = 9222,
  [string]$Time = '07:30',
  [switch]$Remove
)

$ErrorActionPreference = 'Stop'
$ScriptDir = $PSScriptRoot
$Launcher  = Join-Path $ScriptDir 'launch_tv_debug_win.ps1'
$Scan      = Join-Path $ScriptDir 'morning_scan.ps1'
$LogDir    = Join-Path $HOME '.tradingview-mcp\scans'
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

$taskAutostart = 'TradingView CDP Autostart'
$taskScan      = 'TradingView Morning Scan'

if ($Remove) {
  Unregister-ScheduledTask -TaskName $taskAutostart -Confirm:$false -ErrorAction SilentlyContinue
  Unregister-ScheduledTask -TaskName $taskScan      -Confirm:$false -ErrorAction SilentlyContinue
  Write-Host "Aufgaben entfernt."
  return
}

if (-not (Test-Path $Launcher)) { throw "Launcher nicht gefunden: $Launcher" }
if (-not (Test-Path $Scan))     { throw "Scan-Skript nicht gefunden: $Scan" }

$ps = (Get-Command powershell.exe).Source

# Aufgabe 1 — Autostart beim Login.
$a1 = New-ScheduledTaskAction -Execute $ps `
      -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$Launcher`" -Port $Port"
$t1 = New-ScheduledTaskTrigger -AtLogOn
Register-ScheduledTask -TaskName $taskAutostart -Action $a1 -Trigger $t1 -Force `
  -Description 'Startet TradingView mit CDP-Debug-Port beim Login' | Out-Null
Write-Host "Aufgabe registriert: '$taskAutostart' (beim Login)"

# Aufgabe 2 — Morning-Scan Mo-Fr um <Time>.
$a2 = New-ScheduledTaskAction -Execute $ps `
      -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$Scan`" -Port $Port"
$t2 = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Monday,Tuesday,Wednesday,Thursday,Friday -At ([DateTime]::Parse($Time))
Register-ScheduledTask -TaskName $taskScan -Action $a2 -Trigger $t2 -Force `
  -Description 'Taeglicher HTF/Power-Play Morning-Scan + Telegram' | Out-Null
Write-Host "Aufgabe registriert: '$taskScan' (Mo-Fr $Time)"

Write-Host ""
Write-Host "Fertig."
Write-Host "  Pruefen:   Get-ScheduledTask -TaskName '$taskAutostart','$taskScan'"
Write-Host "  Testlauf:  Start-ScheduledTask -TaskName '$taskScan'"
Write-Host "  Log:       $(Join-Path $LogDir 'scan.log')"
Write-Host "  Entfernen: powershell -ExecutionPolicy Bypass -File scripts\install_schedule_win.ps1 -Remove"
