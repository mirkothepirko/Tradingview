/**
 * Unit tests for the pure pattern-detection logic (detectPatterns).
 * No TradingView connection needed — runs offline against synthetic bars.
 *
 * Run: node --test tests/patterns.test.js
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { detectPatterns } from '../src/core/patterns.js';

// ── Bar factory ────────────────────────────────────────────────────────────
function bar(time, close, vol, range = 0.5) {
  return { time, open: close, high: close + range, low: close - range, close, volume: vol };
}

/** Fluent builder for oldest-first bar series. */
function series() {
  const bars = [];
  let i = 0;
  const api = {
    flat(n, price, vol, range = 0.5) {
      for (let k = 0; k < n; k++) bars.push(bar(i++, price, vol, range));
      return api;
    },
    ramp(n, from, to, vol, range = 0.5) {
      for (let k = 0; k < n; k++) bars.push(bar(i++, from + (to - from) * (k / (n - 1)), vol, range));
      return api;
    },
    closes(arr, vol, range = 0.5) {
      for (const c of arr) bars.push(bar(i++, c, vol, range));
      return api;
    },
    done() {
      return bars;
    },
  };
  return api;
}

// ── Tests ────────────────────────────────────────────────────────────────
describe('detectPatterns — valid setups', () => {
  it('detects a High Tight Flag (steep pole + tight shallow flag)', () => {
    const bars = series()
      .flat(70, 10, 1000) // Aufwärmphase für SMA50
      .ramp(25, 10, 21, 3000) // Flaggenmast: +110 % auf hohem Volumen
      .closes([20.5, 19.5, 18.5, 18.0, 18.5, 19.0, 19.5, 20.0, 20.5, 21.0], 400) // enge Flagge, Volumen trocknet aus
      .done();

    const r = detectPatterns(bars);
    assert.equal(r.eligible, true);
    assert.ok(r.patterns.includes('high_tight_flag'), `erwartet HTF, bekam ${JSON.stringify(r.patterns)}`);
    assert.ok(r.metrics.pole_gain_pct >= 90, `pole_gain_pct=${r.metrics.pole_gain_pct}`);
    assert.ok(r.metrics.flag_depth_pct <= 25, `flag_depth_pct=${r.metrics.flag_depth_pct}`);
    assert.ok(r.metrics.flag_days >= 5 && r.metrics.flag_days <= 25);
    assert.ok(r.score >= 60, `score=${r.score}`);
    // Risiko-Felder vorhanden (Swing-Low-Stop + tradeable-Flag)
    assert.equal(typeof r.metrics.risk_pct, 'number');
    assert.equal(typeof r.metrics.entry, 'number');
    assert.equal(typeof r.tradeable, 'boolean');
    assert.equal(r.tradeable, r.patterns.length > 0 && r.metrics.risk_ok);
  });

  it('detects a Power Play (>100% explosion + tight base above rising 50-MA)', () => {
    const bars = series()
      .flat(70, 10, 1000)
      .ramp(30, 10, 22, 3000) // +120 % Explosion
      .closes(
        [21.5, 21.0, 20.5, 20.3, 20.8, 21.2, 21.5, 21.0, 20.6, 20.4, 20.9, 21.3, 21.5, 21.1, 20.7, 20.5, 21.0, 21.4, 21.2, 21.0],
        400,
      ) // 20-Bar enge Basis, Volumen kontrahiert
      .done();

    const r = detectPatterns(bars);
    assert.equal(r.eligible, true);
    assert.ok(r.patterns.includes('power_play'), `erwartet Power Play, bekam ${JSON.stringify(r.patterns)}`);
    assert.equal(r.metrics.above_key_mas, true);
    assert.equal(r.metrics.sma50_rising, true);
    assert.equal(r.metrics.vol_dryup, true);
    assert.ok(r.metrics.flag_days >= 15 && r.metrics.flag_days <= 30);
  });
});

describe('detectPatterns — no match', () => {
  it('returns no pattern for choppy sideways action', () => {
    const closes = [];
    for (let k = 0; k < 90; k++) closes.push(10 + (k % 2 === 0 ? 0.6 : -0.6)); // Sägezahn, endet tief
    const bars = series().closes(closes, 1000).done();

    const r = detectPatterns(bars);
    assert.equal(r.eligible, true);
    assert.equal(r.patterns.length, 0);
    assert.ok(r.score < 40, `score=${r.score}`);
  });
});

describe('detectPatterns — edge cases', () => {
  it('flags too few bars as not eligible', () => {
    const bars = series().flat(30, 10, 1000).done();
    const r = detectPatterns(bars);
    assert.equal(r.eligible, false);
    assert.equal(r.reason, 'zu_wenige_bars');
  });

  it('reports no flag yet when price is still making new highs', () => {
    const bars = series().flat(40, 10, 1000).ramp(40, 10, 30, 2000).done();
    const r = detectPatterns(bars);
    assert.equal(r.eligible, true);
    assert.equal(r.metrics.flag_formed, false);
    assert.equal(r.patterns.length, 0);
    assert.ok(r.notes.some((n) => n.includes('Noch kein Flag')));
  });

  it('produces no NaN with zero volume', () => {
    const bars = series().flat(70, 10, 0).done();
    const r = detectPatterns(bars);
    assert.equal(r.success, true);
    assert.equal(r.metrics.vol_dryup_ratio, null);
    assert.equal(r.metrics.breakout_vol_ratio, null);
    assert.ok(Number.isFinite(r.score));
  });

  it('returns eligible:false safely for empty / non-array input', () => {
    assert.equal(detectPatterns([]).eligible, false);
    assert.equal(detectPatterns(undefined).eligible, false);
  });
});
