#!/usr/bin/env node
/**
 * Formatiert das Marktampel-JSON (tv market / market_monitor) als kompakten
 * Textblock fuer das Telegram-Briefing. Gegenstueck zu scan_summary.js —
 * gleiche Idee: reines Node, laeuft identisch auf Linux und Windows.
 *
 * Aufruf:  node scripts/market_summary.js [--html] <market.json>
 *
 * Ohne Flag: reiner Text (Konsole / .txt-Archiv). Mit --html: Telegram-HTML —
 * fette Titel, Ampel-Emoji je Ebene (aus den points der Ebene), kompaktere
 * Zeilen. telegram_send.js schickt das dann mit parse_mode=HTML.
 */
import { readFileSync } from 'node:fs';

const args = process.argv.slice(2);
const html = args.includes('--html');
const reportPath = args.find((a) => a !== '--html');
if (!reportPath) {
  process.stderr.write('Usage: node scripts/market_summary.js [--html] <market.json>\n');
  process.exit(1);
}

// HTML-Helfer: b() = fett, esc() = dynamische Werte entschaerfen (< > &).
// Im Text-Modus geben beide den String unveraendert zurueck.
const esc = html ? (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') : (s) => String(s);
const b = html ? (s) => `<b>${s}</b>` : (s) => s;

let d;
try {
  d = JSON.parse(readFileSync(reportPath, 'utf8'));
} catch (e) {
  // Kein hartes Scheitern: das Briefing soll auch ohne Ampel rausgehen.
  console.log('MARKTAMPEL: heute nicht verfuegbar (' + esc(e.message) + ')');
  process.exit(0);
}
if (!d.success || !d.ampel) {
  console.log('MARKTAMPEL: heute nicht verfuegbar (' + esc(d.error || 'keine Daten') + ')');
  process.exit(0);
}

const EMOJI = { gruen: '🟢', gelb: '🟡', rot: '🔴' };
const NAME = { gruen: 'RUECKENWIND', gelb: 'GEMISCHT', rot: 'GEGENWIND' };
const sign = (v, unit = '%') => (v == null ? 'n/a' : `${v > 0 ? '+' : ''}${v}${unit}`);
const check = (ok) => (ok ? '✓' : '✗');
// Ampel je Ebene: die points der Ebene sagen, ob sie stuetzt oder bremst.
const dot = (lvl) => (!lvl?.available ? '⚪' : lvl.points > 0 ? '🟢' : lvl.points < 0 ? '🔴' : '🟡');
// Trennzeichen: im HTML-Modus der kompaktere Mittelpunkt.
const SEP = html ? ' · ' : ' | ';

const L = d.levels || {};
const out = [];

out.push(`${b(`MARKTAMPEL ${EMOJI[d.ampel.farbe] || ''} ${NAME[d.ampel.farbe] || ''}`)} (Score ${sign(d.ampel.score, '')})`);
out.push(html ? `<i>${esc(d.ampel.label)}</i>` : d.ampel.label);
out.push('');

// Ebenen-Zeile: Text-Modus behaelt die Nummerierung, HTML-Modus setzt das
// Ampel-Emoji der Ebene davor — das ist auf dem Handy schneller erfassbar.
const level = (n, lvl, title, rest) => out.push(html ? `${dot(lvl)} ${b(title)} ${rest}` : `${n}) ${title}: ${rest}`);

// 1) Watchlist
if (L.watchlist?.available) {
  level(1, L.watchlist, 'Watchlist', `${L.watchlist.green}/${L.watchlist.total} gruen (${L.watchlist.green_pct}%)`);
} else {
  level(1, L.watchlist, 'Watchlist', 'keine Daten (Scan fehlt)');
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
  level(2, L.trend, 'Trend NDX', esc(parts.join(SEP)));
} else {
  level(2, L.trend, 'Trend NDX', 'keine Daten');
}

// 3) Risk On / Risk Off
if (L.risiko?.available) {
  const fmt = (x) => `${x.name.replace(/\s*\(.*\)/, '')} ${sign(x.chg_pct)}`;
  level(3, L.risiko, 'Stimmung', esc(L.risiko.label));
  out.push(`   Risk-On:  ${esc(L.risiko.risk_on.map(fmt).join(' · '))}`);
  out.push(`   Risk-Off: ${esc(L.risiko.risk_off.map(fmt).join(' · '))}`);
} else {
  level(3, L.risiko, 'Stimmung', 'keine Daten');
}

// 4) Marktbreite
if (L.breite?.available) {
  const bb = L.breite;
  const parts = [];
  if (bb.advance_decline != null) parts.push(`A/D ${sign(bb.advance_decline, '')} ${check(bb.advance_decline > 0)}`);
  if (bb.mcclellan != null) parts.push(`McClellan ${sign(bb.mcclellan, '')} ${check(bb.mcclellan > 0)}`);
  if (bb.above_5d_pct != null) parts.push(`${bb.above_5d_pct}% ueber 5-Tage-Linie (${bb.above_5d_zone})`);
  level(4, L.breite, 'Breite', esc(parts.join(SEP)));
} else {
  level(4, L.breite, 'Breite', 'keine Daten');
}

// 5) Kanarienvogel
if (L.kanarienvogel?.available) {
  const k = L.kanarienvogel;
  const warn = k.points < 0 ? '⚠ Halbleiter fallen voraus' : check(k.rel_5d_pp > 0);
  level(5, L.kanarienvogel, 'Kanarienvogel SMH', `${sign(k.rel_5d_pp, 'pp')} vs NDX (5d) ${warn}`);
} else {
  level(5, L.kanarienvogel, 'Kanarienvogel SMH', 'keine Daten');
}

// Datenluecken transparent machen, statt sie zu verschweigen.
if (Array.isArray(d.errors) && d.errors.length) {
  out.push(`⚠ Datenluecken: ${esc(d.errors.map((e) => e.symbol || e.name).join(', '))}`);
}

console.log(out.join('\n'));
