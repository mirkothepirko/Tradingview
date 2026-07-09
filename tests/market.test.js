/**
 * Unit tests fuer die pure Marktampel-Logik (analyzeMarket & Helfer).
 * Keine TradingView-Verbindung noetig — laeuft offline gegen synthetische Bars.
 *
 * Run: node --test tests/market.test.js
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeMarket,
  changePct,
  mcclellan,
  stageAnalysis,
  MARKET_THRESHOLDS,
} from '../src/core/market.js';

// ── Bar-Fabrik: aus Schlusskursen eine Bar-Serie (aeltester zuerst) bauen ──
const bars = (closes) =>
  closes.map((c, i) => ({ time: i, open: c, high: c + 1, low: c - 1, close: c, volume: 1000 }));

/** Linear steigende/fallende Schlusskurse. */
const ramp = (n, from, to) =>
  Array.from({ length: n }, (_, k) => from + ((to - from) * k) / (n - 1));

describe('changePct', () => {
  it('berechnet die 1-Tages-Veraenderung', () => {
    const b = bars([100, 110]);
    assert.equal(changePct(b, 1), 10.000000000000009); // (110/100-1)*100, Float-Rauschen ok
  });

  it('gibt null bei zu wenigen Bars', () => {
    assert.equal(changePct(bars([100]), 1), null);
    assert.equal(changePct([], 1), null);
    assert.equal(changePct(undefined, 1), null);
  });

  it('gibt null bei Division durch 0', () => {
    assert.equal(changePct(bars([0, 100]), 1), null);
  });
});

describe('mcclellan', () => {
  it('ist positiv, wenn die A/D-Reihe zuletzt steigt (EMA19 > EMA39)', () => {
    const val = mcclellan(bars(ramp(120, -200, 800)));
    assert.ok(val > 0, `erwartet > 0, war ${val}`);
  });

  it('ist negativ bei fallender A/D-Reihe', () => {
    const val = mcclellan(bars(ramp(120, 800, -200)));
    assert.ok(val < 0, `erwartet < 0, war ${val}`);
  });

  it('gibt null bei zu wenigen Werten (EMA39 braucht 39 Bars)', () => {
    assert.equal(mcclellan(bars(ramp(20, 0, 100))), null);
  });
});

describe('stageAnalysis', () => {
  it('erkennt Stage 2 in einem klaren Aufwaertstrend', () => {
    assert.equal(stageAnalysis(ramp(250, 100, 300)), 'Stage 2 (Aufwärtstrend)');
  });

  it('erkennt Stage 4 in einem klaren Abwaertstrend', () => {
    assert.equal(stageAnalysis(ramp(250, 300, 100)), 'Stage 4 (Abwärtstrend)');
  });

  it('gibt null bei zu wenigen Kursen fuer den SMA200', () => {
    assert.equal(stageAnalysis(ramp(100, 100, 200)), null);
  });
});

// ── Szenario-Bausteine fuer analyzeMarket ──────────────────────────────────
function bullishInput() {
  return {
    indexDaily: bars(ramp(250, 100, 300)), // Aufwaertstrend: EMA10>EMA20, Kurs oben
    indexWeekly: bars(ramp(60, 100, 200)),
    riskOn: [
      { name: 'Halbleiter (SMH)', symbol: 'NASDAQ:SMH', bars: bars(ramp(30, 100, 140)) }, // staerker als Index (letzte 5 Tage)
      { name: 'High-Beta (ARKK)', symbol: 'AMEX:ARKK', bars: bars(ramp(30, 100, 120)) },
      { name: 'Tech (XLK)', symbol: 'AMEX:XLK', bars: bars(ramp(30, 100, 115)) },
    ],
    riskOff: [
      { name: 'Volatilität (VIX)', symbol: 'CBOE:VIX', bars: bars(ramp(30, 25, 15)) }, // faellt = gut
      { name: '10J-Rendite (US10Y)', symbol: 'TVC:US10Y', bars: bars(ramp(30, 5, 4.2)) },
      { name: 'Healthcare (XLV)', symbol: 'AMEX:XLV', bars: bars(ramp(30, 150, 145)) },
      { name: 'Utilities (XLU)', symbol: 'AMEX:XLU', bars: bars(ramp(30, 50, 48)) },
    ],
    addBars: bars(ramp(120, -200, 800)), // Breite zieht mit: A/D>0, McClellan>0
    above5dBars: bars(ramp(30, 40, 50)), // 50% = neutral, weder ueberhitzt noch ausgebombt
    watchlist: [
      ...Array.from({ length: 7 }, (_, i) => ({ symbol: `WIN${i}`, change_pct: 1.5 })),
      ...Array.from({ length: 3 }, (_, i) => ({ symbol: `LOSE${i}`, change_pct: -0.5 })),
    ], // 70% gruen
  };
}

function bearishInput() {
  const b = bullishInput();
  return {
    ...b,
    indexDaily: bars(ramp(250, 300, 100)), // Abwaertstrend
    indexWeekly: bars(ramp(60, 200, 100)),
    riskOn: b.riskOn.map((x) => ({ ...x, bars: bars(ramp(30, 140, 90)) })), // High-Beta faellt (schneller als der Index)
    riskOff: [
      { name: 'Volatilität (VIX)', symbol: 'CBOE:VIX', bars: bars(ramp(30, 15, 35)) }, // Angst steigt
      { name: '10J-Rendite (US10Y)', symbol: 'TVC:US10Y', bars: bars(ramp(30, 4, 5)) },
      { name: 'Healthcare (XLV)', symbol: 'AMEX:XLV', bars: bars(ramp(30, 145, 155)) },
      { name: 'Utilities (XLU)', symbol: 'AMEX:XLU', bars: bars(ramp(30, 48, 52)) },
    ],
    addBars: bars(ramp(120, 800, -400)), // Breite kippt
    above5dBars: bars(ramp(30, 60, 50)), // neutral — kein Ausgebombt-Bonus
    watchlist: [
      ...Array.from({ length: 2 }, (_, i) => ({ symbol: `WIN${i}`, change_pct: 0.5 })),
      ...Array.from({ length: 8 }, (_, i) => ({ symbol: `LOSE${i}`, change_pct: -2 })),
    ], // 20% gruen
  };
}

describe('analyzeMarket', () => {
  it('bullishes Szenario -> gruene Ampel (Rueckenwind)', () => {
    const r = analyzeMarket(bullishInput());
    assert.equal(r.success, true);
    assert.equal(r.ampel.farbe, 'gruen');
    assert.ok(r.ampel.score >= MARKET_THRESHOLDS.ampel_gruen_ab);
    assert.equal(r.levels.trend.ema10_over_ema20, true);
    assert.equal(r.levels.risiko.label, 'Risk-On');
    assert.equal(r.levels.watchlist.green_pct, 70);
    assert.ok(r.levels.breite.mcclellan > 0);
    assert.ok(r.levels.kanarienvogel.rel_5d_pp > 0);
  });

  it('bearishes Szenario -> rote Ampel (fischen gehen)', () => {
    const r = analyzeMarket(bearishInput());
    assert.equal(r.ampel.farbe, 'rot');
    assert.ok(r.ampel.score <= MARKET_THRESHOLDS.ampel_rot_ab);
    assert.equal(r.levels.risiko.label, 'Risk-Off');
    assert.ok(r.levels.kanarienvogel.points < 0, 'Kanarienvogel muss warnen');
  });

  it('ueberhitzte Marktbreite kostet einen Punkt (Kontraindikator)', () => {
    const hot = bullishInput();
    hot.above5dBars = bars(ramp(30, 80, 92)); // 92% ueber der 5-Tage-Linie
    const r = analyzeMarket(hot);
    assert.equal(r.levels.breite.above_5d_zone, 'überhitzt');
    const normal = analyzeMarket(bullishInput());
    assert.equal(r.levels.breite.points, normal.levels.breite.points - 1);
  });

  it('ohne Daten -> gelbe Ampel, alle Ebenen als nicht verfuegbar markiert', () => {
    const r = analyzeMarket({});
    assert.equal(r.success, true);
    assert.equal(r.ampel.farbe, 'gelb');
    assert.equal(r.ampel.score, 0);
    for (const key of ['watchlist', 'trend', 'risiko', 'breite', 'kanarienvogel']) {
      assert.equal(r.levels[key].available, false, `${key} muss available:false sein`);
    }
  });

  it('Watchlist-Ebene ignoriert Eintraege ohne change_pct', () => {
    const input = bullishInput();
    input.watchlist = [
      { symbol: 'A', change_pct: 1 },
      { symbol: 'B', change_pct: null },
      { symbol: 'C' },
    ];
    const r = analyzeMarket(input);
    assert.equal(r.levels.watchlist.total, 1);
  });
});
