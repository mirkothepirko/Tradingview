import { register } from '../router.js';
import * as core from '../../core/market.js';

register('market', {
  description:
    'Marktampel (Siebenhaar-Routine): Trend, Risk On/Off, Marktbreite, Kanarienvogel → gruen/gelb/rot',
  options: {
    scan: {
      type: 'string',
      short: 's',
      description: 'Pfad zum heutigen Pattern-Scan-JSON (liefert Ebene 1: Watchlist-Check)',
    },
  },
  handler: async (v) => core.runMarketMonitor({ scan_path: v.scan }),
});
