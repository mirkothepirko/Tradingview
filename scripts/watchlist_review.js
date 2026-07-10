#!/usr/bin/env node
/**
 * Woechentlicher Watchlist-Review: hinterfragt die statische Watchlist kritisch,
 * damit sie nicht versandet. Arbeitet rein OFFLINE auf den gespeicherten
 * Morning-Scan-Reports (~/.tradingview-mcp/scans/YYYY-MM-DD.json) — braucht
 * also weder TradingView noch CDP und kann gefahrlos am Wochenende laufen.
 *
 * Logik: pro Symbol werden die Scans der Woche aggregiert (Muster-Tage,
 * bester Score, Trend-Tage). Daraus drei Toepfe:
 *   - STREICHKANDIDATEN: ganze Woche kein Muster, bester Score unter 30,
 *     Trend an hoechstens 40 % der Tage intakt → Platz freimachen?
 *   - MITTELFELD: kein Muster, aber Trend/Score rechtfertigen den Platz noch.
 *   - VERDIENT: Muster erkannt oder Score >= 45 → bleibt.
 * NEUE Kandidaten schlaegt das Skript bewusst NICHT vor — die nimmt der
 * Mensch selbst in die TradingView-Watchlist auf; der naechste Morning-Scan
 * uebernimmt sie automatisch (watchlist sync).
 *
 * Aufruf:  node scripts/watchlist_review.js [--html] [--days N] [--dir PFAD]
 * Cron-Beispiel (Samstag 09:00, Versand via telegram_send.js):
 *   0 9 * * 6 cd /pfad/zum/repo && node scripts/watchlist_review.js --html | node scripts/telegram_send.js --html
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

// Schwellen fuer die Einordnung — bewusst als Konstanten sichtbar, damit man
// sie beim Nachschaerfen sofort findet.
const SCORE_STARK = 45;      // ab hier verdient ein Symbol seinen Platz auch ohne Muster
const SCORE_SCHWACH = 30;    // darunter + kein Muster + kaum Trend = Streichkandidat
const TREND_MIN_QUOTE = 0.4; // Anteil der Tage, an denen der Trend mindestens intakt sein muss

/**
 * Kernlogik, pur und offline testbar: nimmt geparste Scan-Reports
 * (chronologisch, aeltester zuerst) und liefert die Einordnung zurueck.
 * Basis der Watchlist ist der NEUESTE Scan — nur was heute noch auf der
 * Liste steht, wird bewertet.
 */
export function reviewWatchlist(scans) {
  const valid = scans.filter((s) => s && Array.isArray(s.results));
  if (!valid.length) return { scansUsed: 0, symbols: [] };
  const newest = valid[valid.length - 1];

  const symbols = [];
  for (const r of newest.results) {
    const agg = { symbol: r.symbol, days: 0, patternDays: 0, trendOkDays: 0, maxScore: 0 };
    for (const scan of valid) {
      const row = scan.results.find((x) => x.symbol === r.symbol);
      if (!row || row.success === false) continue;
      agg.days++;
      if (row.patterns && row.patterns.length) agg.patternDays++;
      const m = row.metrics || {};
      if (m.above_key_mas === true && m.sma50_rising === true) agg.trendOkDays++;
      if ((row.score ?? 0) > agg.maxScore) agg.maxScore = row.score ?? 0;
    }
    const trendQuote = agg.days ? agg.trendOkDays / agg.days : 0;
    if (agg.patternDays > 0 || agg.maxScore >= SCORE_STARK) agg.topf = 'verdient';
    else if (agg.maxScore < SCORE_SCHWACH && trendQuote <= TREND_MIN_QUOTE) agg.topf = 'streichen';
    else agg.topf = 'mittelfeld';
    symbols.push(agg);
  }
  // Innerhalb der Toepfe nach Score sortieren — die schwaechsten zuerst
  // bei den Streichkandidaten, die staerksten zuerst beim Rest.
  symbols.sort((a, b) => a.maxScore - b.maxScore);
  return {
    scansUsed: valid.length,
    from: (valid[0].generated_at || '').slice(0, 10),
    to: (newest.generated_at || '').slice(0, 10),
    symbols,
  };
}

/** Formatiert das Review-Ergebnis als Telegram-/Konsolen-Text. */
export function formatReview(review, { html = false } = {}) {
  const esc = html ? (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') : (s) => String(s);
  const b = html ? (s) => `<b>${s}</b>` : (s) => s;

  if (!review.scansUsed) {
    return 'WATCHLIST-REVIEW: keine Scan-Reports gefunden — diese Woche keine Datenbasis.';
  }
  const topf = (name) => review.symbols.filter((s) => s.topf === name);
  const streichen = topf('streichen');
  const mittel = topf('mittelfeld').reverse();
  const verdient = topf('verdient').reverse();
  const out = [];

  out.push(`${b('🧹 WATCHLIST-REVIEW')} — ${review.symbols.length} Symbole, Basis: ${review.scansUsed} Scans (${review.from} bis ${review.to})`);
  out.push('');

  if (streichen.length) {
    // "unter" statt "<": ein rohes < wuerde Telegram im HTML-Modus als Tag-Anfang deuten
    out.push(`${b(`🗑 STREICHKANDIDATEN (${streichen.length})`)} — ganze Woche kein Muster, Score unter ${SCORE_SCHWACH}, Trend kaum intakt:`);
    for (const s of streichen) {
      out.push(`${b(esc(s.symbol))} — Top-Score ${s.maxScore} · Trend an ${s.trendOkDays}/${s.days} Tagen ok`);
    }
  } else {
    out.push(`${b('🗑 STREICHKANDIDATEN:')} keine — die Liste traegt sich diese Woche.`);
  }
  out.push('');

  if (mittel.length) {
    out.push(`${b(`😐 MITTELFELD (${mittel.length})`)} — kein Muster, aber Trend/Score halten sie (noch) drin:`);
    out.push(mittel.map((s) => `${esc(s.symbol)} (${s.maxScore})`).join(' · '));
    out.push('');
  }

  if (verdient.length) {
    out.push(`${b(`💪 VERDIENEN IHREN PLATZ (${verdient.length})`)} — Muster oder Score ≥ ${SCORE_STARK}:`);
    out.push(verdient.map((s) => `${esc(s.symbol)} (${s.maxScore})`).join(' · '));
    out.push('');
  }

  out.push('➕ Nachschub ist Handarbeit: neue Kandidaten direkt in die TradingView-Watchlist aufnehmen — der naechste Morning-Scan uebernimmt sie automatisch.');
  return out.join('\n');
}

// ── CLI-Einstieg (bei Import fuer Tests inaktiv) ──
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const html = args.includes('--html');
  const flag = (name, fallback) => {
    const i = args.indexOf(name);
    return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
  };
  const days = Number(flag('--days', 5));
  const dir = flag('--dir', join(process.env.HOME || '', '.tradingview-mcp', 'scans'));

  // Die letzten N Tages-Reports einsammeln (Dateiname = Datum, sortierbar).
  let files = [];
  try {
    files = readdirSync(dir)
      .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
      .sort()
      .slice(-days);
  } catch (e) {
    console.log(`WATCHLIST-REVIEW: Scan-Verzeichnis nicht lesbar (${e.message})`);
    process.exit(0); // kein Cron-Fehler — naechste Woche wieder
  }
  const scans = files.map((f) => {
    try { return JSON.parse(readFileSync(join(dir, f), 'utf8')); } catch { return null; }
  });
  console.log(formatReview(reviewWatchlist(scans), { html }));
}
