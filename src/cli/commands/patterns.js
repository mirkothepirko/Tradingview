import { register } from '../router.js';
import * as core from '../../core/patterns.js';

register('patterns', {
  description: 'Detect High Tight Flag / Power Play on daily bars (current symbol, list, or watchlist)',
  options: {
    symbols: {
      type: 'string',
      short: 's',
      multiple: true,
      description: 'Ticker to scan (repeat -s for several). Use "watchlist" to load rules.json.',
    },
    timeframe: { type: 'string', short: 't', description: 'Resolution (default "D")' },
    count: { type: 'string', short: 'c', description: 'Daily bars to analyze (default 300, max 500)' },
    rules: { type: 'string', short: 'r', description: 'Path to rules.json (with --symbols watchlist)' },
    // gängigste Schwellen als Flags; der MCP-Tool bietet den vollen Satz
    'pole-gain': { type: 'string', description: 'Min flagpole gain % (default 90)' },
    'flag-depth': { type: 'string', description: 'Max flag depth % (default 25)' },
    'vol-dryup': { type: 'string', description: 'Volume dry-up ratio (default 0.65)' },
    'breakout-vol': { type: 'string', description: 'Breakout volume multiple (default 1.4)' },
  },
  handler: async (v) => {
    let symbols;
    if (v.symbols && v.symbols.length) {
      symbols =
        v.symbols.length === 1 && /^watchlist$/i.test(v.symbols[0]) ? 'watchlist' : v.symbols;
    }
    const num = (x) => (x !== undefined ? Number(x) : undefined);
    return core.detectOnChart({
      symbols,
      timeframe: v.timeframe || 'D',
      count: num(v.count),
      rules_path: v.rules,
      pole_min_gain_pct: num(v['pole-gain']),
      flag_max_depth_pct: num(v['flag-depth']),
      vol_dryup_ratio: num(v['vol-dryup']),
      breakout_vol_mult: num(v['breakout-vol']),
    });
  },
});
