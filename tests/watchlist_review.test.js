// Offline-Tests fuer den woechentlichen Watchlist-Review (keine TradingView noetig).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reviewWatchlist, formatReview } from '../scripts/watchlist_review.js';

// Hilfsfunktion: minimaler Scan-Report, wie ihn `patterns -s watchlist` speichert.
function scan(dateStr, rows) {
  return {
    success: true,
    generated_at: `${dateStr}T07:30:00.000Z`,
    results: rows.map(([symbol, score, patterns, trendOk]) => ({
      symbol,
      success: true,
      score,
      patterns,
      metrics: { above_key_mas: trendOk, sma50_rising: trendOk },
    })),
  };
}

test('reviewWatchlist sortiert Symbole in die richtigen Toepfe', () => {
  const scans = [
    scan('2026-07-06', [
      ['NYSE:GUT', 50, [], true],     // Score >= 45 -> verdient
      ['NYSE:LAHM', 10, [], false],   // schwach, kein Trend -> streichen
      ['NYSE:MITTE', 38, [], true],   // dazwischen -> mittelfeld
    ]),
    scan('2026-07-07', [
      ['NYSE:GUT', 40, ['HTF'], true], // Muster-Tag zaehlt, auch wenn Score sinkt
      ['NYSE:LAHM', 12, [], false],
      ['NYSE:MITTE', 30, [], true],
    ]),
  ];
  const r = reviewWatchlist(scans);
  assert.equal(r.scansUsed, 2);
  assert.equal(r.from, '2026-07-06');
  assert.equal(r.to, '2026-07-07');
  const byName = Object.fromEntries(r.symbols.map((s) => [s.symbol, s]));
  assert.equal(byName['NYSE:GUT'].topf, 'verdient');
  assert.equal(byName['NYSE:GUT'].patternDays, 1);
  assert.equal(byName['NYSE:LAHM'].topf, 'streichen');
  assert.equal(byName['NYSE:LAHM'].trendOkDays, 0);
  assert.equal(byName['NYSE:MITTE'].topf, 'mittelfeld');
  assert.equal(byName['NYSE:MITTE'].maxScore, 38);
});

test('nur der neueste Scan bestimmt die Watchlist-Basis', () => {
  const scans = [
    scan('2026-07-06', [['NYSE:RAUS', 55, ['HTF'], true], ['NYSE:BLEIBT', 20, [], false]]),
    scan('2026-07-07', [['NYSE:BLEIBT', 20, [], false]]), // RAUS wurde entfernt
  ];
  const r = reviewWatchlist(scans);
  assert.deepEqual(r.symbols.map((s) => s.symbol), ['NYSE:BLEIBT']);
});

test('formatReview: HTML escaped Symbole und markiert Abschnitte fett', () => {
  const r = reviewWatchlist([scan('2026-07-06', [['NYSE:A&B', 5, [], false]])]);
  const msg = formatReview(r, { html: true });
  assert.match(msg, /<b>🧹 WATCHLIST-REVIEW<\/b>/);
  assert.match(msg, /NYSE:A&amp;B/);
  assert.match(msg, /STREICHKANDIDATEN \(1\)/);
});

test('formatReview: ohne Datenbasis gibt es eine ehrliche Meldung', () => {
  const msg = formatReview(reviewWatchlist([]), { html: false });
  assert.match(msg, /keine Scan-Reports/);
});
