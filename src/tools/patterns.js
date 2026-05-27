import { z } from 'zod';
import { jsonResult } from './_format.js';
import * as core from '../core/patterns.js';

export function registerPatternTools(server) {
  server.tool(
    'patterns_detect',
    'Detect High Tight Flag (HTF) and Power Play (Minervini) on DAILY bars. Runs on the current chart symbol by default; pass symbols=["AAPL","MSFT"] to scan a list, or symbols="watchlist" to scan rules.json. Textbook-strict thresholds are configurable. Returns matched patterns, a 0-100 score, metrics, and German notes.',
    {
      symbols: z
        .union([z.array(z.string()), z.literal('watchlist')])
        .optional()
        .describe('Omit for the current chart symbol; array of tickers to scan; or "watchlist" to load symbols from rules.json.'),
      timeframe: z.string().optional().describe('Resolution to analyze (default "D" = daily).'),
      count: z.coerce.number().int().optional().describe('Number of daily bars to analyze (default 300, max 500).'),
      rules_path: z.string().optional().describe('Optional path to rules.json (only used with symbols="watchlist").'),
      // Schwellen-Overrides (alle optional)
      pole_min_gain_pct: z.coerce.number().optional().describe('HTF: min flagpole gain % (default 90).'),
      pole_max_days: z.coerce.number().int().optional().describe('HTF: max flagpole length in trading days (default 40).'),
      flag_max_depth_pct: z.coerce.number().optional().describe('HTF: max flag pullback depth % (default 25).'),
      flag_min_days: z.coerce.number().int().optional().describe('HTF: min flag length in days (default 5).'),
      flag_max_days: z.coerce.number().int().optional().describe('HTF: max flag length in days (default 25).'),
      pp_min_gain_pct: z.coerce.number().optional().describe('Power Play: min advance % (default 100).'),
      pp_base_min_days: z.coerce.number().int().optional().describe('Power Play: min base length in days (default 15).'),
      pp_base_max_days: z.coerce.number().int().optional().describe('Power Play: max base length in days (default 30).'),
      near_pivot_max_pct: z.coerce.number().optional().describe('Max % below pivot to count as breakout-ready (default 8).'),
      swing_lookback: z.coerce.number().int().optional().describe('Stop = lowest low of the last N bars (swing low inside the flag, default 7).'),
      max_risk_pct: z.coerce.number().optional().describe('A setup is "tradeable" only if the swing-low stop risk is <= this % (default 8 = single-digit). Lower it (e.g. 5) to be stricter.'),
      vol_dryup_ratio: z.coerce.number().optional().describe('Volume dry-up ratio: sma(vol,5)/avg_vol below this = dried up (default 0.65).'),
      breakout_vol_mult: z.coerce.number().optional().describe('Breakout volume multiple of avg (default 1.4).'),
      pivot_lookback: z.coerce.number().int().optional().describe('Pivot = highest high over this many bars (default 20).'),
    },
    async (args = {}) => {
      try {
        return jsonResult(await core.detectOnChart(args));
      } catch (err) {
        return jsonResult({ success: false, error: err.message }, true);
      }
    },
  );
}
