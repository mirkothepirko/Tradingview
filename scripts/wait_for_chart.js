#!/usr/bin/env node
/**
 * Wartet bis TradingView nach einem (Neu-)Start vollstaendig bereit ist:
 *   CDP up + API verfuegbar (window.TradingViewApi) + Chart geladen (Symbol gesetzt).
 *
 * Gedacht als Aufwaermphase nach CDP-Up in morning_scan.{sh,ps1}: nur weil CDP
 * antwortet, ist die TradingView-Oberflaeche noch nicht zwingend ladefertig fuer
 * watchlist sync + patterns scan. Ohne diese Wartephase landet ein frisch
 * neugestartetes TV im Scan mit leeren/unvollstaendigen Daten.
 *
 * Aufruf:  node scripts/wait_for_chart.js [timeoutSec=60]
 * Exit:    0 = bereit, 1 = Timeout
 */
import { healthCheck } from '../src/core/health.js';

const timeoutSec = Number(process.argv[2] || 60);
const start = Date.now();
let lastReason = '(noch keine Antwort)';

while ((Date.now() - start) / 1000 < timeoutSec) {
  let h;
  try {
    h = await healthCheck();
  } catch (e) {
    lastReason = 'healthCheck-Fehler: ' + e.message;
    await sleep(1500);
    continue;
  }

  const symbol = h && h.chart_symbol;
  const symbolSet = symbol && symbol !== 'unknown' && symbol.trim() !== '';
  if (h && h.cdp_connected && h.api_available && symbolSet) {
    const secs = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`[wait_for_chart] bereit nach ${secs}s: ${symbol} ${h.chart_resolution || ''}`);
    process.exit(0);
  }

  lastReason = `cdp=${h?.cdp_connected} api=${h?.api_available} symbol=${symbol || 'leer'}`;
  await sleep(1500);
}

console.error(`[wait_for_chart] Timeout (${timeoutSec}s) — letzter Stand: ${lastReason}`);
process.exit(1);

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
