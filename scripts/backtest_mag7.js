#!/usr/bin/env node
/**
 * Kell + Minervini VCP — Batch-Backtest Runner
 *
 * Nutzt den MCP-CLI (tv) aus tradingview-mcp-jackson für alle TradingView-Operationen.
 * Robuster als direktes CDP, da der MCP-Server alle UI-Quirks bereits handhabt.
 *
 * Voraussetzung:
 *   1. TradingView Desktop läuft mit CDP: DISPLAY=:0 /opt/TradingView/tradingview --remote-debugging-port=9222 --no-sandbox &
 *   2. tradingview-mcp-jackson unter ~/tradingview-mcp-jackson installiert
 *
 * Ausführen:
 *   node scripts/backtest_mag7.js
 *   node scripts/backtest_mag7.js --symbols AAPL,GOOGL
 *   node scripts/backtest_mag7.js --from 2023-01-01  (für NVDA KI-Boom Test)
 */

import { execSync, spawnSync } from 'child_process';
import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT   = join(__dir, '..');
const TV_CLI = join(process.env.HOME, 'tradingview-mcp-jackson', 'src', 'cli', 'index.js');

// ── CLI args ──────────────────────────────────────────────────────────────────
const args    = process.argv.slice(2);
const getArg  = (flag, def) => { const i = args.indexOf(flag); return i !== -1 ? args[i+1] : def; };
const SYMBOLS = getArg('--symbols', 'GOOGL,AMZN,AAPL,META,NVDA,MSFT,TSLA').split(',');
const FROM    = getArg('--from', '2022-01-01');
const SCRIPT  = getArg('--script', join(__dir, 'kell_vcp_strategy_backtest.pine'));

if (!existsSync(TV_CLI)) {
  console.error(`MCP CLI nicht gefunden: ${TV_CLI}`);
  console.error('Prüfe ob tradingview-mcp-jackson unter ~/tradingview-mcp-jackson installiert ist.');
  process.exit(1);
}

// ── TV CLI wrapper ────────────────────────────────────────────────────────────
function tv(args, opts = {}) {
  // Split args but respect quoted strings
  const parts = args.match(/(?:[^\s"]+|"[^"]*")+/g) || [];
  const result = spawnSync('node', [TV_CLI, ...parts], {
    encoding: 'utf8',
    timeout:  opts.timeout || 15000,
    cwd:      join(process.env.HOME, 'tradingview-mcp-jackson'),
  });
  const out = (result.stdout || '').trim();
  const err = (result.stderr || '').trim();
  if (result.status !== 0 && !opts.allowFail) {
    throw new Error(`tv ${args} fehlgeschlagen: ${err || out || 'Exit ' + result.status}`);
  }
  return out;
}

// Like tv(), but passes extra args directly (no string splitting) — safe for JS code
function tvDirect(parts, opts = {}) {
  const result = spawnSync('node', [TV_CLI, ...parts], {
    encoding: 'utf8',
    timeout:  opts.timeout || 15000,
    cwd:      join(process.env.HOME, 'tradingview-mcp-jackson'),
  });
  const out = (result.stdout || '').trim();
  if (result.status !== 0 && !opts.allowFail) {
    throw new Error(`tv ${parts[0]} fehlgeschlagen: ${(result.stderr||'').trim() || out}`);
  }
  return out;
}

function tvJson(args, opts = {}) {
  try {
    const out = tv(args, { ...opts, allowFail: true });
    return JSON.parse(out);
  } catch { return null; }
}

const DELAY = ms => new Promise(r => setTimeout(r, ms));

// ── Schritt 1: Status prüfen ──────────────────────────────────────────────────
async function checkConnection() {
  const result = tvJson('status', { allowFail: true });
  if (!result?.success && !result?.connected) {
    throw new Error('TradingView nicht verbunden. CDP auf Port 9222 aktiv?');
  }
  console.log(`Verbunden: ${result?.url || result?.symbol || 'OK'}`);
}

// ── Schritt 2: Pine Editor öffnen + Script laden ──────────────────────────────
async function pushAndCompile() {
  // Pine Editor Panel öffnen: "tv ui panel pine-editor open"
  tv('ui panel pine-editor open', { timeout: 8000, allowFail: true });
  await DELAY(2000);

  // Script setzen: "tv pine set -f /path/to/file"
  const src = readFileSync(SCRIPT, 'utf-8');
  const tmpFile = `/tmp/kell_vcp_backtest_v2.pine`;
  writeFileSync(tmpFile, src);
  console.log(`  Script laden (${src.split('\n').length} Zeilen)...`);
  tv(`pine set -f ${tmpFile}`, { timeout: 10000 });

  await DELAY(1000);

  // Kompilieren
  console.log(`  Kompilieren...`);
  const compileResult = tv('pine compile', { timeout: 15000, allowFail: true });
  console.log(`  ${compileResult.split('\n')[0]}`);

  await DELAY(3000);
}

// ── Schritt 3: Strategy Tester öffnen ────────────────────────────────────────
async function openStrategyTester() {
  // "tv ui panel strategy-tester open"
  tv('ui panel strategy-tester open', { timeout: 8000, allowFail: true });
  await DELAY(3000);
}

// ── Schritt 4: Symbol wechseln ────────────────────────────────────────────────
async function setSymbol(symbol) {
  // "tv symbol AAPL" (positional arg)
  tv(`symbol ${symbol}`, { timeout: 12000 });
  await DELAY(4000); // Chart neu laden abwarten
  await openStrategyTester();
}

// ── Schritt 5: Strategy-Ergebnisse lesen ─────────────────────────────────────
// NOTE: `tv data strategy` uses is_price_study===false which misses Pine strategies.
// We read reportData.trades directly via `tv ui eval` instead.
const METRICS_JS = `(function(){try{var api=window.TradingViewApi._activeChartWidgetWV.value();var chart=api._chartWidget;var sources=chart.model().model().dataSources();var strat=null;for(var i=0;i<sources.length;i++){if(sources[i].reportData){strat=sources[i];break;}}if(!strat)return JSON.stringify({error:'no strategy found'});var rd=typeof strat.reportData==='function'?strat.reportData():strat.reportData;if(rd&&typeof rd.value==='function')rd=rd.value();var trades=rd.trades;if(typeof trades.value==='function')trades=trades.value();if(!Array.isArray(trades))return JSON.stringify({error:'trades not array'});var wins=0,grossWin=0,grossLoss=0,sumPnl=0;for(var t of trades){var pnl=t.tp&&t.tp.v!==undefined?t.tp.v:0;sumPnl+=pnl;if(pnl>0){wins++;grossWin+=pnl;}else if(pnl<0){grossLoss+=Math.abs(pnl);}}var perf=rd.performance;if(perf&&typeof perf.value==='function')perf=perf.value();var maxDD=perf?perf.maxStrategyDrawDownPercent:null;return JSON.stringify({totalTrades:trades.length,wins:wins,winRate:trades.length>0?wins/trades.length:0,profitFactor:grossLoss>0?grossWin/grossLoss:(grossWin>0?999:0),netProfit:sumPnl,maxDD:maxDD,avgTrade:trades.length>0?sumPnl/trades.length:0});}catch(e){return JSON.stringify({error:e.message});}})()`;

function getStrategyResults() {
  try {
    const out = tvDirect(['ui', 'eval', METRICS_JS], { timeout: 15000, allowFail: true });
    const parsed = JSON.parse(out);
    if (!parsed?.success || !parsed?.result) return null;
    return JSON.parse(parsed.result);
  } catch { return null; }
}

// ── Metriken normalisieren ────────────────────────────────────────────────────
function parseMetrics(m) {
  if (!m || m.error) return null;

  const fmt2 = v => v !== null && v !== undefined ? Number(v).toFixed(2) : '—';
  const fmtI = v => v !== null && v !== undefined ? Math.round(Number(v)) : '—';
  const fmtP = v => {
    if (v === null || v === undefined) return '—';
    const n = Number(v);
    return (n > 1 ? n : n * 100).toFixed(1) + '%';
  };

  return {
    netProfit:    fmt2(m.netProfit),
    totalTrades:  fmtI(m.totalTrades),
    winRate:      fmtP(m.winRate),
    profitFactor: fmt2(m.profitFactor),
    maxDD:        m.maxDD !== null && m.maxDD !== undefined ? (Number(m.maxDD) * 100).toFixed(2) : '—',
    avgTrade:     fmt2(m.avgTrade),
  };
}

// ── Markdown-Report erstellen ─────────────────────────────────────────────────
function buildMarkdown(results) {
  const ts = new Date().toISOString().split('T')[0];
  const v1 = {
    GOOGL: { trades: 36, winRate: '50.0%', pf: '2.10' },
    AMZN:  { trades: 35, winRate: '43.0%', pf: '1.29' },
    AAPL:  { trades: 41, winRate: '32.0%', pf: '1.24' },
    META:  { trades: 39, winRate: '41.0%', pf: '0.96' },
    NVDA:  { trades: 55, winRate: '35.0%', pf: '0.93' },
    MSFT:  { trades: 21, winRate: '29.0%', pf: '0.85' },
    TSLA:  { trades: 60, winRate: '25.0%', pf: '0.67' },
  };
  const emoji   = pf => { const n = parseFloat(pf); return isNaN(n) ? '?' : n >= 1.5 ? '✅' : n >= 1.0 ? '⚠️' : '❌'; };
  const verdict = pf => { const n = parseFloat(pf); return isNaN(n) ? 'Fehler' : n >= 1.5 ? 'Profitabel' : n >= 1.0 ? 'Break-Even' : 'Verlust'; };

  let md = `# Backtest-Ergebnisse: Kell + Minervini VCP v1 vs v2\n\n`;
  md += `**Erstellt:** ${ts} | **Zeitraum:** ab ${FROM} | **Timeframe:** Daily\n\n`;

  md += `## v2 Ergebnisse (Recherche-Korrekturen April 2026)\n\n`;
  md += `| Symbol | Trades | Win Rate | Profit Faktor | Max DD | Fazit |\n`;
  md += `|--------|--------|----------|---------------|--------|-------|\n`;
  for (const { symbol, metrics, error } of results) {
    if (!metrics) {
      md += `| **${symbol}** | — | — | — | — | Fehler: ${error||'keine Daten'} |\n`;
    } else {
      md += `| **${symbol}** | ${metrics.totalTrades} | ${metrics.winRate} | ${metrics.profitFactor} ${emoji(metrics.profitFactor)} | ${metrics.maxDD}% | ${verdict(metrics.profitFactor)} |\n`;
    }
  }

  md += `\n## v1 Baseline (EMA50-Exit, ~6% Profit, RSI-Filter, EMA20-Stop)\n\n`;
  md += `| Symbol | Trades | Win Rate | Profit Faktor | Fazit |\n`;
  md += `|--------|--------|----------|---------------|-------|\n`;
  for (const sym of SYMBOLS) {
    const r = v1[sym]||{};
    const e = emoji(r.pf||'0');
    md += `| **${sym}** | ${r.trades||'—'} | ${r.winRate||'—'} | ${r.pf||'—'} ${e} | ${verdict(r.pf||'0')} |\n`;
  }

  md += `\n## v1 vs v2 Vergleich (Profit Faktor)\n\n`;
  md += `| Symbol | PF v1 | PF v2 | Δ | Trades v1 → v2 | Trend |\n`;
  md += `|--------|-------|-------|---|----------------|-------|\n`;
  for (const { symbol, metrics } of results) {
    const old   = v1[symbol]||{};
    const pfNew = metrics?.profitFactor || '—';
    const pfOld = old.pf || '—';
    const delta = pfNew !== '—' && pfOld !== '—' ? (parseFloat(pfNew)-parseFloat(pfOld)).toFixed(2) : '—';
    const sign  = delta !== '—' && parseFloat(delta) > 0 ? '+' : '';
    const trend = delta !== '—' ? (parseFloat(delta) > 0.1 ? '↑ Besser' : parseFloat(delta) < -0.1 ? '↓ Schlechter' : '→ Gleich') : '?';
    const trades = `${old.trades||'—'} → ${metrics?.totalTrades||'—'}`;
    md += `| **${symbol}** | ${pfOld} | ${pfNew} | ${sign}${delta} | ${trades} | ${trend} |\n`;
  }

  md += `\n## Änderungen v1 → v2\n\n`;
  md += `| Bereich | v1 | v2 |\n`;
  md += `|---------|----|----||\n`;
  md += `| Kell Primär-MAs | EMA20+EMA50 | **EMA10+EMA20** |\n`;
  md += `| Trend Template | EMA200 | **SMA50+SMA150+SMA200** |\n`;
  md += `| 52W-Filter | fehlte | within 25% high / >30% above low |\n`;
  md += `| Profit-Ziel | ~6% (2R×3%) | **20%** |\n`;
  md += `| Stop-Referenz | 3% unter EMA20 | **3% unter EMA10** |\n`;
  md += `| Volumen-Avg | 20 Bars | **50 Bars** |\n`;
  md += `| VCP Volume Dry-Up | fehlte | **<65% des Avg** |\n`;
  md += `| RSI Entry-Filter | Pflicht 45–75 | **kein Pflichtfilter** |\n`;
  md += `| Wedge Drop | close < EMA50 | **close < EMA10 UND EMA20** |\n`;

  return md;
}

// ── Hauptprogramm ─────────────────────────────────────────────────────────────
async function main() {
  console.log('\nKell + Minervini VCP — Batch-Backtest');
  console.log('======================================');
  console.log(`Symbole: ${SYMBOLS.join(', ')}`);
  console.log(`Zeitraum: ab ${FROM} | Script: ${SCRIPT}\n`);

  console.log('[1] Verbindung prüfen...');
  await checkConnection();

  console.log('\n[2] Backtest-Script kompilieren...');
  await pushAndCompile();

  console.log('\n[3] Strategy Tester öffnen...');
  await openStrategyTester();

  const results = [];

  for (let i = 0; i < SYMBOLS.length; i++) {
    const symbol = SYMBOLS[i];
    console.log(`\n[${i+4}] ${symbol}...`);
    try {
      await setSymbol(symbol);
      const raw     = getStrategyResults();
      const metrics = parseMetrics(raw);
      if (metrics) {
        console.log(`  Trades: ${metrics.totalTrades} | WR: ${metrics.winRate} | PF: ${metrics.profitFactor} | DD: ${metrics.maxDD}%`);
        results.push({ symbol, metrics });
      } else {
        console.log(`  Keine Metriken (Script aktiv auf Chart?)`);
        results.push({ symbol, metrics: null, error: 'Keine Metriken' });
      }
    } catch (e) {
      console.log(`  Fehler: ${e.message}`);
      results.push({ symbol, metrics: null, error: e.message });
    }
  }

  // Report speichern
  mkdirSync(join(ROOT, 'results'), { recursive: true });
  const md      = buildMarkdown(results);
  const outFile = join(ROOT, 'results', 'backtest_results.md');
  writeFileSync(outFile, md);

  // Terminaltabelle
  console.log('\n=== ERGEBNIS ===');
  console.log('Symbol  | Trades |  Win Rate | Prof.Faktor | Max DD');
  console.log('--------|--------|-----------|-------------|-------');
  for (const { symbol, metrics, error } of results) {
    if (metrics) console.log(`${symbol.padEnd(7)} | ${String(metrics.totalTrades).padStart(6)} | ${metrics.winRate.padStart(9)} | ${metrics.profitFactor.padStart(11)} | ${metrics.maxDD}%`);
    else         console.log(`${symbol.padEnd(7)} | FEHLER: ${error}`);
  }
  console.log(`\nReport: ${outFile}`);
}

main().catch(err => {
  console.error('\nFatal:', err.message);
  process.exit(1);
});
