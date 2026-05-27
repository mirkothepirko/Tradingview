/**
 * Core watchlist logic.
 * Uses TradingView's internal widget API with DOM fallback.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { evaluate, evaluateAsync, getClient } from '../connection.js';
import { loadRules } from './morning.js';
import { openPanel } from './ui.js';

// Symbole dieser Anbieter sind keine Aktien (Indizes/Forex/Krypto/Rohstoff-CFDs/Futures)
// und damit für einen High-Tight-Flag-Scan nicht sinnvoll.
const NON_EQUITY_PREFIXES = new Set([
  'TVC', 'CAPITALCOM', 'FX', 'FX_IDC', 'OANDA', 'FOREXCOM', 'FXCM', 'SAXO', 'PEPPERSTONE',
  'CMCMARKETS', 'SKILLING', 'CURRENCYCOM', 'SPREADEX', 'EASYMARKETS',
  'BITSTAMP', 'COINBASE', 'BINANCE', 'BITFINEX', 'KRAKEN', 'BYBIT', 'OKX', 'BITGET',
  'CRYPTO', 'CRYPTOCAP', 'INDEX',
  'NYMEX', 'COMEX', 'CBOT', 'CME', 'ICEUS', 'ICEEUR', 'MOEX',
]);

/** Aus einer TradingView-Symbolliste nur Aktien behalten (Indizes/Krypto/Forex/Futures raus). */
export function filterEquities(symbols) {
  const kept = [], dropped = [];
  for (const s of symbols) {
    const i = s.indexOf(':');
    const prefix = i > 0 ? s.slice(0, i).toUpperCase() : '';
    if (prefix && NON_EQUITY_PREFIXES.has(prefix)) dropped.push(s);
    else kept.push(s);
  }
  return { kept, dropped };
}

export async function get() {
  // Try internal API first — reads from the active watchlist widget
  const symbols = await evaluate(`
    (function() {
      // Method 1: Try the watchlist widget's internal data
      try {
        var rightArea = document.querySelector('[class*="layout__area--right"]');
        if (!rightArea || rightArea.offsetWidth < 50) return { symbols: [], source: 'panel_closed' };
      } catch(e) {}

      // Method 2: Read data-symbol-full attributes from watchlist rows
      var results = [];
      var seen = {};
      var container = document.querySelector('[class*="layout__area--right"]');
      if (!container) return { symbols: [], source: 'no_container' };

      // Find all elements with symbol data attributes
      var symbolEls = container.querySelectorAll('[data-symbol-full]');
      for (var i = 0; i < symbolEls.length; i++) {
        var sym = symbolEls[i].getAttribute('data-symbol-full');
        if (!sym || seen[sym]) continue;
        seen[sym] = true;

        // Find the row and extract price data
        var row = symbolEls[i].closest('[class*="row"]') || symbolEls[i].parentElement;
        var cells = row ? row.querySelectorAll('[class*="cell"], [class*="column"]') : [];
        var nums = [];
        for (var j = 0; j < cells.length; j++) {
          var t = cells[j].textContent.trim();
          if (t && /^[\\-+]?[\\d,]+\\.?\\d*%?$/.test(t.replace(/[\\s,]/g, ''))) nums.push(t);
        }
        results.push({ symbol: sym, last: nums[0] || null, change: nums[1] || null, change_percent: nums[2] || null });
      }

      if (results.length > 0) return { symbols: results, source: 'data_attributes' };

      // Method 3: Scan for ticker-like text in the right panel
      var items = container.querySelectorAll('[class*="symbolName"], [class*="tickerName"], [class*="symbol-"]');
      for (var k = 0; k < items.length; k++) {
        var text = items[k].textContent.trim();
        if (text && /^[A-Z][A-Z0-9.:!]{0,20}$/.test(text) && !seen[text]) {
          seen[text] = true;
          results.push({ symbol: text, last: null, change: null, change_percent: null });
        }
      }

      return { symbols: results, source: results.length > 0 ? 'text_scan' : 'empty' };
    })()
  `);

  return {
    success: true,
    count: symbols?.symbols?.length || 0,
    source: symbols?.source || 'unknown',
    symbols: symbols?.symbols || [],
  };
}

export async function add({ symbol }) {
  // Use keyboard shortcut to open symbol search in watchlist, type symbol, press Enter
  const c = await getClient();

  // First ensure watchlist panel is open
  const panelState = await evaluate(`
    (function() {
      var btn = document.querySelector('[data-name="base-watchlist-widget-button"]')
        || document.querySelector('[aria-label*="Watchlist"]');
      if (!btn) return { error: 'Watchlist button not found' };
      var isActive = btn.getAttribute('aria-pressed') === 'true'
        || btn.classList.toString().indexOf('Active') !== -1
        || btn.classList.toString().indexOf('active') !== -1;
      if (!isActive) { btn.click(); return { opened: true }; }
      return { opened: false };
    })()
  `);

  if (panelState?.error) throw new Error(panelState.error);
  if (panelState?.opened) await new Promise(r => setTimeout(r, 500));

  // Click the "Add symbol" button (various selectors)
  const addClicked = await evaluate(`
    (function() {
      var selectors = [
        '[data-name="add-symbol-button"]',
        '[aria-label="Add symbol"]',
        '[aria-label*="Add symbol"]',
        'button[class*="addSymbol"]',
      ];
      for (var s = 0; s < selectors.length; s++) {
        var btn = document.querySelector(selectors[s]);
        if (btn && btn.offsetParent !== null) { btn.click(); return { found: true, selector: selectors[s] }; }
      }
      // Fallback: find + button in right panel
      var container = document.querySelector('[class*="layout__area--right"]');
      if (container) {
        var buttons = container.querySelectorAll('button');
        for (var i = 0; i < buttons.length; i++) {
          var ariaLabel = buttons[i].getAttribute('aria-label') || '';
          if (/add.*symbol/i.test(ariaLabel) || buttons[i].textContent.trim() === '+') {
            buttons[i].click();
            return { found: true, method: 'fallback' };
          }
        }
      }
      return { found: false };
    })()
  `);

  if (!addClicked?.found) throw new Error('Add symbol button not found in watchlist panel');
  await new Promise(r => setTimeout(r, 300));

  // Type the symbol into the search input
  await c.Input.insertText({ text: symbol });
  await new Promise(r => setTimeout(r, 500));

  // Press Enter to select the first result
  await c.Input.dispatchKeyEvent({ type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  await c.Input.dispatchKeyEvent({ type: 'keyUp', key: 'Enter', code: 'Enter' });
  await new Promise(r => setTimeout(r, 300));

  // Press Escape to close search
  await c.Input.dispatchKeyEvent({ type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await c.Input.dispatchKeyEvent({ type: 'keyUp', key: 'Escape', code: 'Escape' });

  return { success: true, symbol, action: 'added' };
}

/**
 * Liest die TradingView-Watchlist (UI), filtert auf Aktien und schreibt sie in rules.json.
 * "Beide synchron halten": TradingView ist die Quelle, rules.json die versionierte Kopie,
 * die der tägliche Scan (patterns_detect -s watchlist) und morning_brief lesen.
 */
export async function syncToRules({ rules_path } = {}) {
  // Watchlist-Panel muss offen sein, um es auslesen zu können.
  try { await openPanel({ panel: 'watchlist', action: 'open' }); await new Promise(r => setTimeout(r, 700)); } catch (_) {}

  const wl = await get();
  const all = (wl.symbols || []).map(s => s.symbol).filter(Boolean);
  if (!all.length) {
    throw new Error(`TradingView-Watchlist nicht lesbar (source=${wl.source}). Ist das Watchlist-Panel offen?`);
  }

  const { kept, dropped } = filterEquities(all);
  if (!kept.length) throw new Error('Nach dem Aktien-Filter blieb kein Symbol übrig.');

  const { path } = loadRules(rules_path);
  const text = readFileSync(path, 'utf8');
  const re = /"watchlist"\s*:\s*\[[^\]]*\]/;
  if (!re.test(text)) throw new Error(`Feld "watchlist" in ${path} nicht gefunden.`);
  const arr = '["' + kept.join('", "') + '"]';
  writeFileSync(path, text.replace(re, '"watchlist": ' + arr));

  return {
    success: true,
    written_to: path,
    source_count: all.length,
    kept_count: kept.length,
    kept,
    excluded: dropped,
  };
}
