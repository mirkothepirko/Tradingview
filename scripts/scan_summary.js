#!/usr/bin/env node
/**
 * Formatiert einen gespeicherten Pattern-Scan-Report (JSON) als lesbares
 * Text-Briefing auf stdout. Plattformneutral (reines Node) — ersetzt den
 * frueheren inline-Python-Block in morning_scan.sh, damit dieselbe Logik
 * auf Linux UND Windows laeuft (Windows braucht so kein Python).
 *
 * Aufruf:  node scripts/scan_summary.js <report.json>
 */
import { readFileSync } from 'node:fs';

const reportPath = process.argv[2];
if (!reportPath) {
  process.stderr.write('Usage: node scripts/scan_summary.js <report.json>\n');
  process.exit(1);
}

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

out.push(`Morning Scan ${(d.generated_at || '').slice(0, 10)} — ${res.length} Symbole (Daily)`);

// 1) Handelbare Setups = Muster erkannt UND einstelliges Swing-Low-Risiko (die Vorauswahl)
if (trade.length) {
  out.push(`\nHANDELBAR (${trade.length}):`);
  for (const r of trade) {
    out.push(
      `  ${r.symbol}: ${(r.patterns || []).join(',')} | Einstieg ${r.entry} / Stop ${r.stop} / Risiko ${r.risk_pct}% | Score ${r.score}`,
    );
  }
} else {
  out.push('\nHANDELBAR: keine (kein Muster mit einstelligem Risiko heute).');
}

// 2) Muster-Treffer, die am Risiko-Filter scheitern (zur Beobachtung)
const filtered = hits.filter((r) => !r.tradeable);
if (filtered.length) {
  out.push(`\nMuster erkannt, aber Risiko zu hoch (${filtered.length} — beobachten):`);
  for (const r of filtered) {
    const m = r.metrics || {};
    out.push(`  ${r.symbol}: ${r.patterns.join(',')} | Risiko ${m.risk_pct}% | ${m.dist_below_pivot_pct}% unter Pivot`);
  }
}

// 3) Top nach Score (Kontext)
out.push('\nTop nach Score:');
for (const r of (d.ranked || []).slice(0, 8)) {
  out.push(`  ${String(r.symbol).padEnd(14)} ${String(r.score ?? 0).padStart(3)}  ${(r.patterns || []).join(',') || '-'}`);
}

out.push(`\nReport: ${reportPath}`);
console.log(out.join('\n'));
