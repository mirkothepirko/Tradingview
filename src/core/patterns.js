/**
 * Mustererkennung — High Tight Flag (HTF) und Power Play (Minervini).
 *
 * Zwei Ebenen:
 *  - detectPatterns(bars, opts): REINE Funktion über ein OHLCV-Bar-Array (ältester Bar zuerst,
 *    genau wie data.getOhlcv es liefert). Keine I/O — offline (ohne TradingView) testbar.
 *  - detectOnChart({...}): holt Tages-Bars vom Chart (aktuelles Symbol, Liste oder Watchlist),
 *    ruft detectPatterns auf und stellt den ursprünglichen Chart-Zustand wieder her
 *    (gleiches Muster wie src/core/morning.js).
 *
 * Die Konstanten (EMA/SMA-Perioden, Volumen-Schwellen, Pivot-Lookback) sind konsistent mit
 * scripts/kell_vcp_strategy.pine, damit der Detektor zur restlichen Kell+Minervini-Strategie passt.
 */
import * as chart from './chart.js';
import * as data from './data.js';
import { loadRules } from './morning.js';

// Lehrbuch-strenge Standard-Schwellen. Alle Werte sind via opts überschreibbar.
export const DEFAULT_THRESHOLDS = {
  // High Tight Flag
  pole_min_gain_pct: 90,    // Flaggenmast: mind. +90 %
  pole_max_days: 40,        // in höchstens ~8 Wochen (Handelstage)
  flag_max_depth_pct: 25,   // Flagge: Rücksetzer höchstens 25 %
  flag_min_days: 5,         // ~1 Woche
  flag_max_days: 25,        // ~5 Wochen
  // Power Play (Minervini)
  pp_min_gain_pct: 100,     // explosiv: mind. +100 %
  pp_pole_max_days: 40,     // in höchstens ~8 Wochen
  pp_base_max_depth_pct: 25,// enge Basis: höchstens 25 %
  pp_base_min_days: 10,     // ~2 Wochen (gelockert von 15 — fing INTC-aehnliche Setups nicht ein)
  pp_base_max_days: 30,     // ~6 Wochen
  // gemeinsam (entsprechen kell_vcp_strategy.pine)
  near_pivot_max_pct: 8,    // "ausbruchbereit": höchstens 8 % unter dem Pivot
  vol_dryup_ratio: 0.65,    // sma(vol,5) < 0.65 * avg_vol  → Volumen trocknet aus
  breakout_vol_mult: 1.4,   // Ausbruchsvolumen >= 1.4 * avg_vol
  pivot_lookback: 20,       // Pivot = höchstes Hoch der letzten 20 Bars
  swing_lookback: 7,        // Stop = tiefstes Low der letzten N Bars (Swing-Low in der Flagge)
  max_risk_pct: 8,          // "tradeable" nur wenn Swing-Low-Risiko einstellig (<= diesem Wert)
  min_bars: 60,             // genug für SMA50-Aufwärmung + Mast + Flagge
};

const round2 = (x) => (Number.isFinite(x) ? Math.round(x * 100) / 100 : null);
const clamp01 = (x) => Math.max(0, Math.min(1, x));

/** undefined/null aus opts entfernen, damit sie die Defaults nicht überschreiben. */
function clean(obj = {}) {
  const out = {};
  for (const k in obj) if (obj[k] !== undefined && obj[k] !== null) out[k] = obj[k];
  return out;
}

// --- Gleitende Durchschnitte aus reinen Werten (NICHT von Chart-Indikatoren) ---
// Liefert null, wenn nicht genug Bars vorhanden sind oder ein Wert ungültig ist.

export function sma(values, period, endIdx = values.length - 1) {
  if (endIdx < period - 1) return null;
  let sum = 0;
  for (let i = endIdx - period + 1; i <= endIdx; i++) {
    if (!Number.isFinite(values[i])) return null;
    sum += values[i];
  }
  return sum / period;
}

export function ema(values, period, endIdx = values.length - 1) {
  if (endIdx < period - 1) return null;
  // Seed = SMA der ersten `period` Werte, dann normale EMA-Glättung bis endIdx.
  const k = 2 / (period + 1);
  let prev = sma(values, period, period - 1);
  if (prev == null) return null;
  for (let i = period; i <= endIdx; i++) {
    if (!Number.isFinite(values[i])) return null;
    prev = values[i] * k + prev * (1 - k);
  }
  return prev;
}

/**
 * Reine Mustererkennung über ein Bar-Array (ältester Bar zuerst).
 * @param {Array<{time,open,high,low,close,volume}>} bars
 * @param {object} opts  Schwellen-Overrides (siehe DEFAULT_THRESHOLDS)
 */
export function detectPatterns(bars, opts = {}) {
  const t = { ...DEFAULT_THRESHOLDS, ...clean(opts) };

  // Nur gültige Bars berücksichtigen (NaN/null raus).
  const valid = Array.isArray(bars)
    ? bars.filter(
        (b) => b && Number.isFinite(b.high) && Number.isFinite(b.low) && Number.isFinite(b.close),
      )
    : [];
  const n = valid.length;

  if (n < t.min_bars) {
    return {
      success: true,
      eligible: false,
      reason: 'zu_wenige_bars',
      bar_count: n,
      notes: [`Zu wenige Bars (${n}, benötigt mindestens ${t.min_bars}).`],
    };
  }

  const highs = valid.map((b) => b.high);
  const lows = valid.map((b) => b.low);
  const closes = valid.map((b) => b.close);
  const volumes = valid.map((b) => (Number.isFinite(b.volume) ? b.volume : 0));
  const last = n - 1;

  // 1) Flaggen-/Konsolidierungsfenster + Mast-Top:
  //    höchstes Hoch der letzten flag_max_days Bars. Bei Gleichstand das FRÜHESTE (strikt >),
  //    damit ein späterer Retest desselben Hochs zur Flagge zählt und nicht das Top zurücksetzt.
  const flagWinStart = Math.max(0, last - t.flag_max_days);
  let poleTopIdx = flagWinStart;
  for (let i = flagWinStart; i <= last; i++) {
    if (highs[i] > highs[poleTopIdx]) poleTopIdx = i;
  }
  const poleTopPrice = highs[poleTopIdx];
  const flag_days = last - poleTopIdx;
  const flag_formed = flag_days >= t.flag_min_days;

  // 2) Mast-Basis: tiefstes Low in den bis zu pole_max_days Bars VOR dem Top
  //    (bei Gleichstand das spätere → jüngster, kürzester Mast).
  const poleWinStart = Math.max(0, poleTopIdx - t.pole_max_days);
  let poleBaseIdx = poleWinStart;
  for (let i = poleWinStart; i <= poleTopIdx; i++) {
    if (lows[i] <= lows[poleBaseIdx]) poleBaseIdx = i;
  }
  const poleBasePrice = lows[poleBaseIdx];
  const pole_days = poleTopIdx - poleBaseIdx;
  const pole_gain_pct =
    poleBasePrice > 0 ? ((poleTopPrice - poleBasePrice) / poleBasePrice) * 100 : null;

  // 3) Flaggen-Tiefe: tiefstes Low im Flaggenfenster gegen das Mast-Top
  let flag_low = poleTopPrice;
  for (let i = poleTopIdx; i <= last; i++) if (lows[i] < flag_low) flag_low = lows[i];
  const flag_depth_pct =
    poleTopPrice > 0 ? ((poleTopPrice - flag_low) / poleTopPrice) * 100 : null;

  // 4) Pivot = höchstes Hoch der letzten pivot_lookback Bars
  let pivot = -Infinity;
  for (let i = Math.max(0, last - t.pivot_lookback + 1); i <= last; i++) {
    if (highs[i] > pivot) pivot = highs[i];
  }
  const last_close = closes[last];
  const dist_below_pivot_pct = pivot > 0 ? ((pivot - last_close) / pivot) * 100 : null;

  // 4b) Einstieg/Stop nach Mirkos Risk-Regel: Einstieg = Breakout-Pivot,
  //     Stop = letztes Swing-Low der Flagge (tiefstes Low der letzten N Bars, max. Flaggenlänge).
  const swN = Math.min(t.swing_lookback, Math.max(flag_days, 1));
  let swing_low = lows[last];
  for (let i = Math.max(0, last - swN); i <= last; i++) if (lows[i] < swing_low) swing_low = lows[i];
  const entry = pivot;
  const stop = swing_low;
  const risk_pct = entry > 0 && entry > stop ? ((entry - stop) / entry) * 100 : null;
  const risk_ok = risk_pct != null && risk_pct <= t.max_risk_pct;

  // 5) Volumen
  const avg_vol = sma(volumes, 50, last);
  const vol5 = sma(volumes, 5, last);
  const vol_dryup_ratio = avg_vol && avg_vol > 0 && vol5 != null ? vol5 / avg_vol : null;
  const vol_dryup = vol_dryup_ratio != null && vol_dryup_ratio < t.vol_dryup_ratio;
  const breakout = last_close >= pivot;
  const breakout_vol_ratio = avg_vol && avg_vol > 0 ? volumes[last] / avg_vol : null;
  const breakout_vol_ok = breakout_vol_ratio != null && breakout_vol_ratio >= t.breakout_vol_mult;

  // 6) Trend-Kontext
  const ema50 = ema(closes, 50, last);
  const sma50 = sma(closes, 50, last);
  const sma50_prev = sma(closes, 50, last - 21);
  const sma50_rising = sma50 != null && sma50_prev != null && sma50 > sma50_prev;
  const above_key_mas = ema50 != null && last_close > ema50;

  // 7) Klassifikation (beide Muster gleichzeitig möglich)
  const patterns = [];

  const htf =
    pole_gain_pct != null &&
    pole_gain_pct >= t.pole_min_gain_pct &&
    pole_days <= t.pole_max_days &&
    flag_formed &&
    flag_depth_pct != null &&
    flag_depth_pct <= t.flag_max_depth_pct &&
    flag_days >= t.flag_min_days &&
    flag_days <= t.flag_max_days &&
    dist_below_pivot_pct != null &&
    (dist_below_pivot_pct <= t.near_pivot_max_pct || breakout);
  if (htf) patterns.push('high_tight_flag');

  const power_play =
    pole_gain_pct != null &&
    pole_gain_pct >= t.pp_min_gain_pct &&
    pole_days <= t.pp_pole_max_days &&
    flag_depth_pct != null &&
    flag_depth_pct <= t.pp_base_max_depth_pct &&
    flag_days >= t.pp_base_min_days &&
    flag_days <= t.pp_base_max_days &&
    above_key_mas &&
    sma50_rising &&
    vol_dryup;
  if (power_play) patterns.push('power_play');

  // Handelbar = Muster erkannt UND Swing-Low-Risiko einstellig (Mirkos Risk-Regel).
  const tradeable = patterns.length > 0 && risk_ok;

  // 8) Score 0–100 (auch bei Teil-Treffer, damit Beinahe-Treffer sichtbar werden)
  let score = 0;
  if (pole_gain_pct != null) score += clamp01(pole_gain_pct / t.pole_min_gain_pct) * 30;
  if (flag_depth_pct != null && flag_formed) {
    score += clamp01((t.flag_max_depth_pct - flag_depth_pct) / t.flag_max_depth_pct) * 25;
  }
  if (vol_dryup_ratio != null) score += clamp01(1 - Math.min(vol_dryup_ratio, 1)) * 20;
  if (dist_below_pivot_pct != null) {
    score +=
      (breakout ? 1 : clamp01((t.near_pivot_max_pct - dist_below_pivot_pct) / t.near_pivot_max_pct)) *
      15;
  }
  score += (above_key_mas ? 5 : 0) + (sma50_rising ? 5 : 0);
  score = Math.round(Math.max(0, Math.min(100, score)));

  // 9) Notizen (Deutsch)
  const notes = [];
  if (pole_gain_pct != null) {
    notes.push(`Mast: ${pole_gain_pct >= 0 ? '+' : ''}${round2(pole_gain_pct)} % in ${pole_days} Tagen`);
  }
  if (!flag_formed) {
    notes.push('Noch kein Flag — Kurs macht neue Hochs');
  } else if (flag_depth_pct != null) {
    notes.push(`Flaggen-Tiefe ${round2(flag_depth_pct)} % über ${flag_days} Tage`);
  }
  if (vol_dryup_ratio != null) {
    notes.push(`Volumen-Austrocknung: ${vol_dryup ? 'ja' : 'nein'} (${round2(vol_dryup_ratio)}×)`);
  }
  if (dist_below_pivot_pct != null) {
    notes.push(
      breakout
        ? `Ausbruch über Pivot ${round2(pivot)} (Volumen ${round2(breakout_vol_ratio)}×)`
        : `Abstand zum Pivot ${round2(dist_below_pivot_pct)} %`,
    );
  }
  if (risk_pct != null) {
    notes.push(
      `Einstieg ${round2(entry)} / Stop ${round2(stop)} → Risiko ${round2(risk_pct)} %` +
        (risk_ok ? '' : ` (> ${t.max_risk_pct} % → meiden/enger einsteigen)`),
    );
  }
  notes.push(
    patterns.length
      ? `Erkannt: ${patterns.join(', ')}${tradeable ? ' — handelbar' : ' — Risiko zu hoch'}`
      : 'Kein Muster erkannt',
  );

  return {
    success: true,
    eligible: true,
    bar_count: n,
    patterns,
    tradeable,
    score,
    metrics: {
      pole_gain_pct: round2(pole_gain_pct),
      pole_days,
      flag_formed,
      flag_depth_pct: round2(flag_depth_pct),
      flag_days,
      pole_base_price: round2(poleBasePrice),
      pole_top_price: round2(poleTopPrice),
      pivot: round2(pivot),
      last_close: round2(last_close),
      dist_below_pivot_pct: round2(dist_below_pivot_pct),
      entry: round2(entry),
      stop: round2(stop),
      swing_low: round2(swing_low),
      risk_pct: round2(risk_pct),
      risk_ok,
      avg_vol: avg_vol != null ? Math.round(avg_vol) : null,
      vol_dryup_ratio: round2(vol_dryup_ratio),
      vol_dryup,
      breakout,
      breakout_vol_ratio: round2(breakout_vol_ratio),
      breakout_vol_ok,
      ema50: round2(ema50),
      sma50: round2(sma50),
      sma50_rising,
      above_key_mas,
      flag_low: round2(flag_low),
    },
    thresholds_used: t,
    notes,
  };
}

/**
 * Holt Tages-Bars vom Chart und erkennt die Muster.
 *  - symbols fehlt/leer  → aktuelles Chart-Symbol (kein Symbolwechsel, nur Timeframe ggf. auf Daily)
 *  - symbols = [..]      → diese Ticker nacheinander scannen
 *  - symbols = "watchlist" → Symbole aus rules.json scannen
 * Stellt am Ende immer das ursprüngliche Symbol + Timeframe wieder her.
 */
export async function detectOnChart({
  symbols,
  timeframe = 'D',
  count,
  rules_path,
  ...thresholds
} = {}) {
  const barCount = Math.min(count || 300, 500);
  const opts = clean(thresholds);

  // Modus + Zielsymbole bestimmen
  let mode, targets;
  if (symbols == null || (Array.isArray(symbols) && symbols.length === 0)) {
    mode = 'current';
    targets = null;
  } else if (typeof symbols === 'string' && symbols.toLowerCase() === 'watchlist') {
    const { rules } = loadRules(rules_path);
    targets = rules.watchlist || [];
    if (!targets.length) {
      throw new Error(
        'rules.json watchlist ist leer. Trage mindestens ein Symbol in das watchlist-Array ein.',
      );
    }
    mode = 'watchlist';
  } else if (Array.isArray(symbols)) {
    targets = symbols;
    mode = 'symbols';
  } else {
    throw new Error('symbols muss fehlen, ein Array von Tickern oder "watchlist" sein.');
  }

  // Ursprünglichen Chart-Zustand merken
  let originalSymbol, originalTimeframe;
  try {
    const s = await chart.getState();
    originalSymbol = s.symbol;
    originalTimeframe = s.resolution;
  } catch (_) {}

  const generated_at = new Date().toISOString();
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // EINZEL-MODUS: aktuelles Symbol behalten, nur Timeframe bei Bedarf auf Daily wechseln
  if (mode === 'current') {
    let switched = false;
    try {
      if (originalTimeframe && String(originalTimeframe) !== String(timeframe)) {
        await chart.setTimeframe({ timeframe });
        await sleep(900);
        switched = true;
      }
      const ohlcv = await data.getOhlcv({ count: barCount });
      const result = detectPatterns(ohlcv.bars, opts);
      return { success: true, mode, symbol: originalSymbol, timeframe, generated_at, ...result };
    } finally {
      if (switched && originalTimeframe) {
        try {
          await chart.setTimeframe({ timeframe: originalTimeframe });
        } catch (_) {}
      }
    }
  }

  // MEHR-SYMBOL-MODUS: Symbol + Timeframe wechseln, scannen, danach wiederherstellen
  const results = [];
  for (const symbol of targets) {
    try {
      await chart.setSymbol({ symbol });
      await sleep(900);
      await chart.setTimeframe({ timeframe });
      await sleep(900);
      const ohlcv = await data.getOhlcv({ count: barCount });
      // Tagesveränderung (letzter vs. vorletzter Schluss) — braucht die
      // Marktampel (Ebene 1: Watchlist-Check) im Morning-Briefing.
      const bars = ohlcv.bars || [];
      const lastClose = bars[bars.length - 1]?.close;
      const prevClose = bars[bars.length - 2]?.close;
      const change_pct =
        Number.isFinite(lastClose) && Number.isFinite(prevClose) && prevClose !== 0
          ? Number((((lastClose / prevClose) - 1) * 100).toFixed(2))
          : null;
      results.push({ symbol, change_pct, ...detectPatterns(bars, opts) });
    } catch (err) {
      results.push({ symbol, error: err.message });
    }
  }

  // Ursprünglichen Zustand wiederherstellen
  if (originalSymbol) {
    try {
      await chart.setSymbol({ symbol: originalSymbol });
      if (originalTimeframe) await chart.setTimeframe({ timeframe: originalTimeframe });
    } catch (_) {}
  }

  // Rangliste: nur erfolgreich ausgewertete Symbole, nach Score absteigend
  const ranked = results
    .filter((r) => Array.isArray(r.patterns))
    .map((r) => ({ symbol: r.symbol, score: r.score, patterns: r.patterns, tradeable: r.tradeable }))
    .sort((a, b) => (b.score || 0) - (a.score || 0));

  // Handelbar = Muster erkannt UND Risiko einstellig (Mirkos Risk-Regel) — die eigentliche Vorauswahl.
  const tradeable = results
    .filter((r) => r.tradeable)
    .map((r) => ({ symbol: r.symbol, score: r.score, patterns: r.patterns, ...(r.metrics ? { entry: r.metrics.entry, stop: r.metrics.stop, risk_pct: r.metrics.risk_pct } : {}) }))
    .sort((a, b) => (b.score || 0) - (a.score || 0));

  return { success: true, mode, timeframe, generated_at, count: results.length, tradeable_count: tradeable.length, tradeable, results, ranked };
}
