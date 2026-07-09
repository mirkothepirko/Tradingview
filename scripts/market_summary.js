#!/usr/bin/env node
/**
 * Formatiert das Marktampel-JSON (tv market / market_monitor) als kompakten
 * Textblock fuer das Telegram-Briefing. Gegenstueck zu scan_summary.js —
 * gleiche Idee: reines Node, laeuft identisch auf Linux und Windows.
 *
 * Aufruf:  node scripts/market_summary.js <market.json>
 */
import { readFileSync } from 'node:fs';

const reportPath = process.argv[2];
if (!reportPath) {
  process.stderr.write('Usage: node scripts/market_summary.js <market.json>\n');
  process.exit(1);
}

let d;
try {
  d = JSON.parse(readFileSync(reportPath, 'utf8'));
} catch (e) {
  // Kein hartes Scheitern: das Briefing soll auch ohne Ampel rausgehen.
  console.log('MARKTAMPEL: heute nicht verfuegbar (' + e.message + ')');
  process.exit(0);
}
if (!d.success || !d.ampel) {
  console.log('MARKTAMPEL: heute nicht verfuegbar (' + (d.error || 'keine Daten') + ')');
  process.exit(0);
}

const EMOJI = { gruen: '🟢', gelb: '🟡', rot: '🔴' };
const NAME = { gruen: 'RUECKENWIND', gelb: 'GEMISCHT', rot: 'GEGENWIND' };
const sign = (v, unit = '%') => (v == null ? 'n/a' : `${v > 0 ? '+' : ''}${v}${unit}`);
const check = (ok) => (ok ? '✓' : '✗');

const L = d.levels || {};
const out = [];

out.push(`MARKTAMPEL ${EMOJI[d.ampel.farbe] || ''} ${NAME[d.ampel.farbe] || ''} (Score ${sign(d.ampel.score, '')})`);
out.push(d.ampel.label);
out.push('');

// 1) Watchlist
if (L.watchlist?.available) {
  out.push(`1) Watchlist: ${L.watchlist.green}/${L.watchlist.total} gruen (${L.watchlist.green_pct}%)`);
} else {
  out.push('1) Watchlist: keine Daten (Scan fehlt)');
}

// 2) Trend
if (L.trend?.available) {
  const t = L.trend;
  const parts = [
    `EMA10>EMA20 ${check(t.ema10_over_ema20)}`,
    `Kurs ${sign(t.dist_ema10_pct)} zur EMA10`,
  ];
  if (t.stage) parts.push(t.stage);
  if (t.weekly) parts.push(`Weekly ${sign(t.weekly.dist_ema10_pct)} zur EMA10`);
  out.push(`2) Trend NDX: ${parts.join(' | ')}`);
} else {
  out.push('2) Trend NDX: keine Daten');
}

// 3) Risk On / Risk Off
if (L.risiko?.available) {
  const fmt = (x) => `${x.name.replace(/\s*\(.*\)/, '')} ${sign(x.chg_pct)}`;
  out.push(`3) Stimmung: ${L.risiko.label}`);
  out.push(`   Risk-On:  ${L.risiko.risk_on.map(fmt).join(' · ')}`);
  out.push(`   Risk-Off: ${L.risiko.risk_off.map(fmt).join(' · ')}`);
} else {
  out.push('3) Stimmung: keine Daten');
}

// 4) Marktbreite
if (L.breite?.available) {
  const b = L.breite;
  const parts = [];
  if (b.advance_decline != null) parts.push(`A/D ${sign(b.advance_decline, '')} ${check(b.advance_decline > 0)}`);
  if (b.mcclellan != null) parts.push(`McClellan ${sign(b.mcclellan, '')} ${check(b.mcclellan > 0)}`);
  if (b.above_5d_pct != null) parts.push(`${b.above_5d_pct}% ueber 5-Tage-Linie (${b.above_5d_zone})`);
  out.push(`4) Breite: ${parts.join(' | ')}`);
} else {
  out.push('4) Breite: keine Daten');
}

// 5) Kanarienvogel
if (L.kanarienvogel?.available) {
  const k = L.kanarienvogel;
  const warn = k.points < 0 ? '⚠ Halbleiter fallen voraus' : check(k.rel_5d_pp > 0);
  out.push(`5) Kanarienvogel SMH: ${sign(k.rel_5d_pp, 'pp')} vs NDX (5d) ${warn}`);
} else {
  out.push('5) Kanarienvogel SMH: keine Daten');
}

// Datenluecken transparent machen, statt sie zu verschweigen.
if (Array.isArray(d.errors) && d.errors.length) {
  out.push(`⚠ Datenluecken: ${d.errors.map((e) => e.symbol || e.name).join(', ')}`);
}

console.log(out.join('\n'));
