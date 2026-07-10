#!/usr/bin/env node
/**
 * Formatiert einen gespeicherten Pattern-Scan-Report (JSON) als lesbares
 * Text-Briefing auf stdout. Plattformneutral (reines Node) — ersetzt den
 * frueheren inline-Python-Block in morning_scan.sh, damit dieselbe Logik
 * auf Linux UND Windows laeuft (Windows braucht so kein Python).
 *
 * Aufruf:  node scripts/scan_summary.js [--html] <report.json>
 *
 * Ohne Flag: reiner Text (Konsole / .txt-Archiv). Mit --html: Telegram-HTML —
 * fette Abschnitts-Titel und Symbole, eine kompakte Metrik-Zeile je Wert,
 * kein Report-Pfad (auf dem Handy nutzlos). Geht als EIGENE Nachricht raus,
 * getrennt von der Marktlage (siehe morning_scan.sh).
 */
import { readFileSync } from 'node:fs';

const args = process.argv.slice(2);
const html = args.includes('--html');
const reportPath = args.find((a) => a !== '--html');
if (!reportPath) {
  process.stderr.write('Usage: node scripts/scan_summary.js [--html] <report.json>\n');
  process.exit(1);
}

const esc = html ? (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') : (s) => String(s);
const b = html ? (s) => `<b>${s}</b>` : (s) => s;
const SEP = html ? ' · ' : ' | ';

let d;
try {
  d = JSON.parse(readFileSync(reportPath, 'utf8'));
} catch (e) {
  console.log('[morning_scan] Konnte Report nicht lesen:', e.message);
  process.exit(1);
}

const out = [];
const res = Array.isArray(d.results) ? d.results : [];
const trade = Array.isArray(d.tradeable) ? d.tradeable : [];
const hits = res.filter((r) => r.patterns && r.patterns.length);
const bySymbol = new Map(res.map((r) => [r.symbol, r]));

out.push(
  html
    ? `${b(`📋 SETUPS ${(d.generated_at || '').slice(0, 10)}`)} — ${res.length} Symbole (Daily)`
    : `Morning Scan ${(d.generated_at || '').slice(0, 10)} — ${res.length} Symbole (Daily)`,
);

// 1) Handelbare Setups = Muster erkannt UND einstelliges Swing-Low-Risiko (die Vorauswahl).
// Pro Eintrag eine Leerzeile dahinter, damit das Briefing in Telegram lesbar bleibt.
if (trade.length) {
  out.push(`\n${b(`✅ HANDELBAR (${trade.length})`)}`);
  for (const r of trade) {
    out.push(
      `${b(esc(r.symbol))}: ${(r.patterns || []).join(',')}${SEP}Einstieg ${r.entry} / Stop ${r.stop} / Risiko ${r.risk_pct}%${SEP}Score ${r.score}`,
    );
    const detail = formatDetail(bySymbol.get(r.symbol)?.metrics);
    if (detail) out.push(`  ${detail}`);
    out.push('');
  }
} else {
  out.push(`\n${b('✅ HANDELBAR:')} keine (kein Muster mit einstelligem Risiko heute).`);
}

// 2) Muster-Treffer, die am Risiko-Filter scheitern (zur Beobachtung)
const filtered = hits.filter((r) => !r.tradeable);
if (filtered.length) {
  out.push(`\n${b(`👀 BEOBACHTEN (${filtered.length})`)} — Muster da, Risiko zu hoch`);
  for (const r of filtered) {
    const m = r.metrics || {};
    out.push(`${b(esc(r.symbol))}: ${r.patterns.join(',')}${SEP}Risiko ${m.risk_pct}%${SEP}${m.dist_below_pivot_pct}% unter Pivot`);
    const detail = formatDetail(m);
    if (detail) out.push(`  ${detail}`);
    out.push('');
  }
}

// 3) Top nach Score (Kontext) — mit kompakter Metrik-Zeile pro Symbol.
// Im HTML-Modus ohne Leerzeile je Eintrag: fette Symbole gliedern schon genug.
out.push(`\n${b('🏆 TOP NACH SCORE')}`);
for (const r of (d.ranked || []).slice(0, 8)) {
  const detail = formatDetail(bySymbol.get(r.symbol)?.metrics);
  if (html) {
    out.push(`${b(esc(r.symbol))} (${r.score ?? 0}) ${(r.patterns || []).join(',') || ''}`.trimEnd());
    if (detail) out.push(`  ${detail}`);
  } else {
    out.push(`  ${String(r.symbol).padEnd(14)} ${String(r.score ?? 0).padStart(3)}  ${(r.patterns || []).join(',') || '-'}`);
    if (detail) out.push(`    ${detail}`);
    out.push('');
  }
}

if (!html) out.push(`\nReport: ${reportPath}`);
console.log(out.join('\n'));

// ── Helpers ──
function round1(x) { return x == null ? null : Math.round(x * 10) / 10; }
function round2(x) { return x == null ? null : Math.round(x * 100) / 100; }

/**
 * Kompakte einzeilige Metrik-Zusammenfassung pro Symbol:
 * Mast (Gewinn %/Tage) | Flagge (Tiefe %/Tage oder "noch nicht") | Pivot-Distanz
 * | Volumen-Dryup-Ratio | Trend (EMA50 + SMA50↑) | Risiko %.
 */
function formatDetail(m) {
  if (!m) return '';
  const parts = [];
  if (m.pole_gain_pct != null) {
    parts.push(`Mast ${m.pole_gain_pct >= 0 ? '+' : ''}${round1(m.pole_gain_pct)}%/${m.pole_days}T`);
  }
  if (m.flag_formed === true) {
    parts.push(`Flagge ${round1(m.flag_depth_pct)}%/${m.flag_days}T`);
  } else if (m.flag_formed === false) {
    parts.push(`Flagge: noch nicht`);
  }
  if (m.dist_below_pivot_pct != null) {
    parts.push(m.breakout ? `Breakout` : `Pivot -${round1(m.dist_below_pivot_pct)}%`);
  }
  if (m.vol_dryup_ratio != null) {
    parts.push(`Vol ${round2(m.vol_dryup_ratio)}x${m.vol_dryup ? ' (dry)' : ''}`);
  }
  // Kompakter Trend: beide ✓ = ✓, einer = ~, keiner = ✗
  const trendBoth = m.above_key_mas === true && m.sma50_rising === true;
  const trendOne  = m.above_key_mas === true || m.sma50_rising === true;
  parts.push(`Trend ${trendBoth ? 'ok' : trendOne ? 'teils' : 'nein'}`);
  if (m.risk_pct != null) {
    parts.push(`Risk ${round1(m.risk_pct)}%${m.risk_ok ? '' : html ? '⚠' : ' !'}`);
  }
  return parts.join(SEP);
}
