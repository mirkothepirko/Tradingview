// Offline-Tests fuer den Wirtschaftskalender-Block (kein Netz, kein TradingView).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filterEvents, formatEvents } from '../scripts/econ_calendar.js';

// Fixture im Format des TradingView-Kalender-Endpoints (Zeiten in UTC,
// importance: 1 = hoch, 0 = mittel, -1 = niedrig).
const FEED = [
  { title: 'Core Inflation Rate YoY', country: 'US', date: '2026-07-14T12:30:00.000Z', importance: 1, forecast: 2.9, previous: 2.9, unit: '%', period: 'Jun' },
  { title: 'ECB Interest Rate Decision', country: 'EU', date: '2026-07-16T12:15:00.000Z', importance: 1, forecast: 2.15, previous: 2.15, unit: '%' },
  { title: 'NY Empire State Manufacturing', country: 'US', date: '2026-07-14T12:30:00.000Z', importance: 0, forecast: null, previous: -16, unit: '' },
  { title: 'BoJ Interest Rate Decision', country: 'JP', date: '2026-07-14T03:00:00.000Z', importance: 1, forecast: null, previous: 0.5, unit: '%' }, // falsches Land
  { title: 'Redbook YoY', country: 'US', date: '2026-07-14T12:55:00.000Z', importance: -1, forecast: null, previous: 5.2, unit: '%' },               // zu unwichtig
];

test('filterEvents (week): nur hohe Wichtigkeit aus US/EU/DE, chronologisch', () => {
  const ev = filterEvents(FEED, { mode: 'week' });
  assert.deepEqual(ev.map((e) => e.title), ['Core Inflation Rate YoY', 'ECB Interest Rate Decision']);
});

test('filterEvents (today): mittel zaehlt mit, Stichtag nach Berlin-Zeit', () => {
  // 12:30 UTC = 14:30 Berlin am selben Tag (Sommerzeit)
  const ev = filterEvents(FEED, { mode: 'today', todayKey: '2026-07-14' });
  assert.deepEqual(ev.map((e) => e.title), ['Core Inflation Rate YoY', 'NY Empire State Manufacturing']);
  assert.equal(ev[0].berlin.time, '14:30');
});

test('filterEvents: Datumswechsel ueber Mitternacht landet am Berliner Folgetag', () => {
  const late = [{ title: 'X', country: 'US', date: '2026-07-13T22:30:00.000Z', importance: 1 }];
  const ev = filterEvents(late, { mode: 'today', todayKey: '2026-07-14' });
  assert.equal(ev.length, 1); // 22:30 UTC = 00:30 Berlin am 14.
  assert.equal(ev[0].berlin.time, '00:30');
});

test('formatEvents (week/html): fette Tagesueberschriften, Periode/Forecast/Previous dabei', () => {
  const msg = formatEvents(filterEvents(FEED, { mode: 'week' }), { mode: 'week', html: true });
  assert.match(msg, /<b>📅 Wirtschaftskalender kommende Woche<\/b>/);
  assert.match(msg, /<b>Di\.? 14\.07\.<\/b>/);
  assert.match(msg, /14:30 🇺🇸 Core Inflation Rate YoY \(Jun, F 2.9% \/ P 2.9%\)/);
});

test('formatEvents (today): hohe Wichtigkeit bekommt die Flamme', () => {
  const ev = filterEvents(FEED, { mode: 'today', todayKey: '2026-07-14' });
  const msg = formatEvents(ev, { mode: 'today' });
  assert.match(msg, /🔥 Core Inflation Rate YoY/);
  assert.doesNotMatch(msg, /🔥 NY Empire State/);
});

test('formatEvents: leere Liste ergibt ehrliche Ein-Zeilen-Meldung', () => {
  assert.match(formatEvents([], { mode: 'today' }), /keine wichtigen Termine/);
  assert.match(formatEvents([], { mode: 'week' }), /keine wichtigen Termine gemeldet/);
});
