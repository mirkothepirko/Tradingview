/**
 * Marktampel — tägliche Marktüberwachung nach der Routine von Dirk Siebenhaar.
 *
 * Beantwortet EINE Frage: Gibt das Marktumfeld heute Rückenwind für die eigene
 * Strategie, oder sollte man besser "fischen gehen"? Dazu werden 5 Ebenen
 * geprüft und zu einer Ampel (gruen/gelb/rot) verdichtet:
 *
 *   1. Watchlist-Check   — wie viel % der eigenen Watchlist ist grün?
 *   2. Trend (Nasdaq)    — EMA 10 vs. EMA 20 (Daily + Weekly), Stage-Analyse
 *   3. Risk On/Off       — High-Beta (SMH/ARKK/XLK) vs. Angst (VIX/Zinsen/Defensive)
 *   4. Marktbreite       — Advance/Decline, McClellan, % Aktien über 5-Tage-Linie
 *   5. Kanarienvogel     — Halbleiter (SMH) relativ zum Nasdaq: läuft er voraus?
 *
 * Aufbau wie patterns.js: analyzeMarket() ist eine PURE Funktion (offline
 * testbar, bekommt fertige Bar-Arrays), collectMarket() ist der Chart-Wrapper,
 * der die Daten über das laufende TradingView einsammelt.
 *
 * Hinweis Datenlage: Der Server nutzt kostenlose Feeds (NASDAQ_DLY, BATS) —
 * verzögerte Kurse. Für ein Morgen-Briefing über den VORTAGES-Schluss ist das
 * ausreichend. INDEX:NYMO (McClellan) gibt es im Datenplan nicht, deshalb wird
 * der McClellan-Oszillator selbst berechnet: EMA19(A/D) − EMA39(A/D).
 */

import { readFileSync } from 'node:fs';
import * as chart from './chart.js';
import * as data from './data.js';
import { ema, sma } from './patterns.js';

/**
 * Welche Symbole je Ebene gelesen werden. Bewusst als Konstante im Code
 * (wie DEFAULT_THRESHOLDS in patterns.js) — Overrides sind über das
 * options-Argument von runMarketMonitor() möglich, brauchen aber niemand.
 */
export const DEFAULT_MARKET_SYMBOLS = {
  index: { symbol: 'NASDAQ:NDX', name: 'Nasdaq 100' },
  risk_on: [
    { symbol: 'NASDAQ:SMH', name: 'Halbleiter (SMH)' },
    { symbol: 'AMEX:ARKK', name: 'High-Beta (ARKK)' },
    { symbol: 'AMEX:XLK', name: 'Tech (XLK)' },
  ],
  risk_off: [
    { symbol: 'CBOE:VIX', name: 'Volatilität (VIX)' },
    { symbol: 'TVC:US10Y', name: '10J-Rendite (US10Y)' },
    { symbol: 'AMEX:XLV', name: 'Healthcare (XLV)' },
    { symbol: 'AMEX:XLU', name: 'Utilities (XLU)' },
  ],
  breadth_add: { symbol: 'USI:ADD', name: 'NYSE Advance-Decline' },
  breadth_above5d: { symbol: 'INDEX:MMFD', name: '% Aktien über 5-Tage-Linie' },
};

/** Schwellen der Ampel-Logik — an einer Stelle, damit sie diskutierbar bleiben. */
export const MARKET_THRESHOLDS = {
  overheated_above5d: 85, // >85% über 5-Tage-Linie = überhitzt (Kontraindikator)
  oversold_above5d: 20, //   <20% = ausgebombt, Erholungspotenzial steigt
  canary_warn_pp: -1.5, //   SMH >1,5 Prozentpunkte schwächer als NDX (5 Tage) = Warnung
  watchlist_green_pct: 60, // ab 60% grüner Watchlist gibt es den Punkt
  watchlist_red_pct: 40, //   unter 40% kostet er einen
  ampel_gruen_ab: 4, //       Gesamt-Score >= 4  → grün ("Rückenwind")
  ampel_rot_ab: -2, //        Gesamt-Score <= -2 → rot  ("fischen gehen")
};

/** Prozentuale Veränderung des Schlusskurses über die letzten n Bars. */
export function changePct(bars, n = 1) {
  if (!Array.isArray(bars) || bars.length < n + 1) return null;
  const last = bars[bars.length - 1]?.close;
  const prev = bars[bars.length - 1 - n]?.close;
  if (!Number.isFinite(last) || !Number.isFinite(prev) || prev === 0) return null;
  return ((last / prev) - 1) * 100;
}

/**
 * McClellan-Oszillator aus Advance-Decline-Werten (Steiger minus Faller):
 * EMA19 − EMA39 der A/D-Reihe. Positiv = breiter Markt zieht mit.
 */
export function mcclellan(addBars) {
  const values = (addBars || []).map((b) => b?.close).filter(Number.isFinite);
  const e19 = ema(values, 19);
  const e39 = ema(values, 39);
  if (e19 == null || e39 == null) return null;
  return e19 - e39;
}

/**
 * Einfache Stage-Analyse (nach Weinstein/Siebenhaar) aus Tages-Schlusskursen:
 * Lage zum SMA200 + Richtung des SMA50 (heute vs. vor 20 Tagen).
 */
export function stageAnalysis(closes) {
  const last = closes[closes.length - 1];
  const s200 = sma(closes, 200);
  const s50 = sma(closes, 50);
  const s50Prev = sma(closes, 50, closes.length - 21);
  if (!Number.isFinite(last) || s200 == null || s50 == null || s50Prev == null) return null;
  const rising = s50 > s50Prev;
  if (last > s200 && rising) return 'Stage 2 (Aufwärtstrend)';
  if (last < s200 && !rising) return 'Stage 4 (Abwärtstrend)';
  if (last > s200) return 'Stage 3 (Topbildung/Seitwärts)';
  return 'Stage 1 (Bodenbildung)';
}

const round = (v, d = 2) => (Number.isFinite(v) ? Number(v.toFixed(d)) : null);

/**
 * PURE Auswertung der 5 Ebenen. Bekommt fertige Bar-Arrays (ältester zuerst)
 * und gibt Score + Ampel zurück — kein Chart-Zugriff, offline testbar.
 *
 * @param {object} input
 * @param {Array}  input.indexDaily   Tagesbars des Leitindex (NDX)
 * @param {Array}  input.indexWeekly  Wochenbars des Leitindex
 * @param {Array}  input.riskOn       [{name, symbol, bars}]
 * @param {Array}  input.riskOff      [{name, symbol, bars}]
 * @param {Array}  input.addBars      Tagesbars USI:ADD
 * @param {Array}  input.above5dBars  Tagesbars INDEX:MMFD
 * @param {Array}  input.watchlist    optional: [{symbol, change_pct}] aus dem Pattern-Scan
 */
export function analyzeMarket(input = {}) {
  const t = MARKET_THRESHOLDS;
  const levels = {};
  let score = 0;

  // ── Ebene 1: Watchlist-Check ─────────────────────────────────────────────
  const wl = (input.watchlist || []).filter((r) => Number.isFinite(r?.change_pct));
  if (wl.length) {
    const green = wl.filter((r) => r.change_pct > 0).length;
    const pct = (green / wl.length) * 100;
    let points = 0;
    if (pct >= t.watchlist_green_pct) points = 1;
    else if (pct < t.watchlist_red_pct) points = -1;
    levels.watchlist = {
      available: true,
      green,
      total: wl.length,
      green_pct: round(pct, 0),
      points,
    };
    score += points;
  } else {
    levels.watchlist = { available: false, points: 0 };
  }

  // ── Ebene 2: Trend des Leitindex (Daily + Weekly) ────────────────────────
  {
    const closes = (input.indexDaily || []).map((b) => b?.close).filter(Number.isFinite);
    const last = closes[closes.length - 1];
    const e10 = ema(closes, 10);
    const e20 = ema(closes, 20);
    const wCloses = (input.indexWeekly || []).map((b) => b?.close).filter(Number.isFinite);
    const e10w = ema(wCloses, 10);
    const wLast = wCloses[wCloses.length - 1];

    if (last != null && e10 != null && e20 != null) {
      let points = 0;
      points += e10 > e20 ? 2 : -2; // starker Trend: EMA10 über EMA20
      points += last > e10 ? 1 : -1; // Kurs über der schnellen Linie
      levels.trend = {
        available: true,
        close: round(last),
        ema10: round(e10),
        ema20: round(e20),
        ema10_over_ema20: e10 > e20,
        dist_ema10_pct: round(((last / e10) - 1) * 100),
        stage: stageAnalysis(closes),
        weekly: e10w != null && wLast != null
          ? { ema10: round(e10w), dist_ema10_pct: round(((wLast / e10w) - 1) * 100) }
          : null,
        points,
      };
      score += points;
    } else {
      levels.trend = { available: false, points: 0 };
    }
  }

  // ── Ebene 3: Risk On vs. Risk Off (Tagesveränderung Vortag) ──────────────
  {
    const mapChg = (list) =>
      (list || []).map((x) => ({
        name: x.name,
        symbol: x.symbol,
        close: round(x.bars?.[x.bars.length - 1]?.close),
        chg_pct: round(changePct(x.bars, 1)),
      }));
    const riskOn = mapChg(input.riskOn);
    const riskOff = mapChg(input.riskOff);
    const onKnown = riskOn.filter((x) => x.chg_pct != null);
    const offKnown = riskOff.filter((x) => x.chg_pct != null);

    if (onKnown.length && offKnown.length) {
      const onGreen = onKnown.filter((x) => x.chg_pct > 0).length;
      // Risk-Off-Werte STEIGEN = Angst / Flucht in sichere Häfen.
      const offWarn = offKnown.filter((x) => x.chg_pct > 0).length;
      let label = 'Neutral';
      let points = 0;
      if (onGreen >= Math.ceil(onKnown.length / 2) && offWarn <= offKnown.length / 2) {
        label = 'Risk-On';
        points = 2;
      } else if (onGreen < Math.ceil(onKnown.length / 2) && offWarn > offKnown.length / 2) {
        label = 'Risk-Off';
        points = -2;
      }
      levels.risiko = { available: true, label, risk_on: riskOn, risk_off: riskOff, points };
      score += points;
    } else {
      levels.risiko = { available: false, risk_on: riskOn, risk_off: riskOff, points: 0 };
    }
  }

  // ── Ebene 4: Marktbreite ─────────────────────────────────────────────────
  {
    const addLast = input.addBars?.[input.addBars.length - 1]?.close;
    const mcc = mcclellan(input.addBars);
    const above5d = input.above5dBars?.[input.above5dBars.length - 1]?.close;

    if (Number.isFinite(addLast) || mcc != null || Number.isFinite(above5d)) {
      let points = 0;
      let zone = null;
      if (Number.isFinite(addLast)) points += addLast > 0 ? 1 : -1;
      if (mcc != null) points += mcc > 0 ? 1 : -1;
      if (Number.isFinite(above5d)) {
        // Kontraindikator: zu viele Aktien über der 5-Tagelinie = überhitzt.
        if (above5d >= t.overheated_above5d) {
          zone = 'überhitzt';
          points -= 1;
        } else if (above5d <= t.oversold_above5d) {
          zone = 'ausgebombt (Erholungspotenzial)';
          points += 1;
        } else {
          zone = 'neutral';
        }
      }
      levels.breite = {
        available: true,
        advance_decline: round(addLast, 0),
        mcclellan: round(mcc),
        above_5d_pct: round(above5d),
        above_5d_zone: zone,
        points,
      };
      score += points;
    } else {
      levels.breite = { available: false, points: 0 };
    }
  }

  // ── Ebene 5: Kanarienvogel — SMH relativ zum Leitindex ───────────────────
  {
    const smh = (input.riskOn || []).find((x) => /SMH/.test(x.symbol || ''));
    const rel = (n) => {
      const a = changePct(smh?.bars, n);
      const b = changePct(input.indexDaily, n);
      return a != null && b != null ? a - b : null;
    };
    const rel5 = rel(5);
    const rel20 = rel(20);
    if (rel5 != null) {
      let points = 0;
      if (rel5 < t.canary_warn_pp) points = -2; // Halbleiter fallen voraus → Frühwarnung
      else if (rel5 > 0) points = 1;
      levels.kanarienvogel = {
        available: true,
        rel_5d_pp: round(rel5),
        rel_20d_pp: round(rel20),
        points,
      };
      score += points;
    } else {
      levels.kanarienvogel = { available: false, points: 0 };
    }
  }

  // ── Ampel ────────────────────────────────────────────────────────────────
  let farbe = 'gelb';
  let label = 'Gemischt — selektiv agieren, Rückläufe an Unterstützungen statt Ausbrüche';
  if (score >= t.ampel_gruen_ab) {
    farbe = 'gruen';
    label = 'Rückenwind — Umfeld unterstützt die Strategie';
  } else if (score <= t.ampel_rot_ab) {
    farbe = 'rot';
    label = 'Gegenwind — besser fischen gehen: keine Ausbrüche kaufen';
  }

  return { success: true, ampel: { farbe, label, score }, levels };
}

/** Bars für EIN Symbol vom laufenden Chart holen (Symbol + Timeframe setzen). */
async function fetchBars(symbol, timeframe, count) {
  await chart.setSymbol({ symbol });
  await sleep(900);
  await chart.setTimeframe({ timeframe });
  await sleep(900);
  const ohlcv = await data.getOhlcv({ count });
  return ohlcv.bars || [];
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Chart-Wrapper: sammelt alle Ebenen-Daten über das laufende TradingView ein,
 * ruft analyzeMarket() auf und stellt danach den ursprünglichen Chart-Zustand
 * wieder her (gleiche Vorgehensweise wie detectOnChart in patterns.js).
 *
 * @param {object} opts
 * @param {string} opts.scan_path  optional: Pfad zum heutigen Pattern-Scan-JSON
 *                                 (liefert change_pct je Watchlist-Symbol für Ebene 1)
 * @param {object} opts.symbols    optional: Overrides für DEFAULT_MARKET_SYMBOLS
 */
export async function runMarketMonitor({ scan_path, symbols } = {}) {
  const cfg = { ...DEFAULT_MARKET_SYMBOLS, ...(symbols || {}) };
  const errors = [];

  // Ursprünglichen Chart-Zustand merken, um ihn am Ende wiederherzustellen.
  let originalSymbol, originalTimeframe;
  try {
    const s = await chart.getState();
    originalSymbol = s.symbol;
    originalTimeframe = s.resolution;
  } catch (_) {}

  // Einzelne Symbol-Fehler brechen den Monitor NICHT ab — die Auswertung
  // arbeitet mit dem, was da ist, und meldet Lücken über `errors`.
  const tryFetch = async (name, symbol, timeframe, count) => {
    try {
      return await fetchBars(symbol, timeframe, count);
    } catch (err) {
      errors.push({ name, symbol, error: err.message });
      return [];
    }
  };

  const indexDaily = await tryFetch('index_daily', cfg.index.symbol, 'D', 300);
  const indexWeekly = await tryFetch('index_weekly', cfg.index.symbol, 'W', 60);
  const riskOn = [];
  for (const x of cfg.risk_on) {
    riskOn.push({ ...x, bars: await tryFetch(x.name, x.symbol, 'D', 30) });
  }
  const riskOff = [];
  for (const x of cfg.risk_off) {
    riskOff.push({ ...x, bars: await tryFetch(x.name, x.symbol, 'D', 30) });
  }
  const addBars = await tryFetch('breadth_add', cfg.breadth_add.symbol, 'D', 120);
  const above5dBars = await tryFetch('breadth_above5d', cfg.breadth_above5d.symbol, 'D', 30);

  // Ursprünglichen Zustand wiederherstellen (best effort).
  if (originalSymbol) {
    try {
      await chart.setSymbol({ symbol: originalSymbol });
      if (originalTimeframe) await chart.setTimeframe({ timeframe: originalTimeframe });
    } catch (_) {}
  }

  // Ebene 1 optional aus dem Pattern-Scan-JSON lesen (change_pct je Symbol).
  let watchlist = null;
  if (scan_path) {
    try {
      const scan = JSON.parse(readFileSync(scan_path, 'utf8'));
      watchlist = (scan.results || [])
        .filter((r) => Number.isFinite(r?.change_pct))
        .map((r) => ({ symbol: r.symbol, change_pct: r.change_pct }));
    } catch (err) {
      errors.push({ name: 'watchlist_scan', error: err.message });
    }
  }

  const analysis = analyzeMarket({ indexDaily, indexWeekly, riskOn, riskOff, addBars, above5dBars, watchlist });
  return {
    ...analysis,
    generated_at: new Date().toISOString(),
    symbols_used: cfg,
    errors: errors.length ? errors : undefined,
  };
}
