#!/usr/bin/env node
/**
 * Wirtschaftskalender fuers Briefing: holt Termine vom oeffentlichen
 * TradingView-Kalender-Endpoint (economic-calendar.tradingview.com — gleiche
 * Quelle wie der Kalender auf tradingview.com, kein API-Key; braucht nur den
 * Origin-Header). Gewaehlt statt Forex-Factory-Feed, weil der FF-Feed nur die
 * LAUFENDE Woche kennt — fuer den Wochen-Ausblick am Samstag nutzlos.
 *
 * Zwei Modi:
 *   --today   Termine von HEUTE (Europe/Berlin), Wichtigkeit hoch+mittel —
 *             Block fuer die werktaegliche Marktlage-Nachricht.
 *   --week    Ausblick auf die naechsten 8 Tage, nur hohe Wichtigkeit,
 *             nach Tagen gruppiert — fuer den Samstags-Watchlist-Review.
 *
 * Laender: US, Euroraum (EU) und Deutschland (DE). Scheitert der Abruf,
 * gibt es EINE ehrliche Zeile statt eines Fehlers — das Briefing geht
 * trotzdem raus (Exit immer 0).
 *
 * Aufruf:  node scripts/econ_calendar.js (--today | --week) [--html]
 */
import { pathToFileURL } from 'node:url';

const API = 'https://economic-calendar.tradingview.com/events';
const COUNTRIES = ['US', 'EU', 'DE'];
const TZ = 'Europe/Berlin';

// UTC-Zeitstempel des Feeds ("2026-07-14T12:30:00.000Z") -> Berliner Sicht.
function toBerlin(iso) {
  const dt = new Date(iso);
  const fmt = (opts) => new Intl.DateTimeFormat('de-DE', { timeZone: TZ, ...opts }).format(dt);
  return {
    dateKey: new Intl.DateTimeFormat('en-CA', { timeZone: TZ, dateStyle: 'short' }).format(dt), // YYYY-MM-DD
    day: fmt({ weekday: 'short' }),                      // "Di."
    dayNum: fmt({ day: '2-digit', month: '2-digit' }),   // "14.07."
    time: fmt({ hour: '2-digit', minute: '2-digit' }),   // "14:30"
  };
}

/**
 * Kernlogik, pur und offline testbar: filtert Kalender-Events auf die
 * relevanten Laender und die Mindest-Wichtigkeit (importance: 1 = hoch,
 * 0 = mittel, -1 = niedrig) und reichert Berlin-Zeiten an.
 * mode 'today': hoch+mittel, nur Events vom Stichtag (todayKey, YYYY-MM-DD).
 * mode 'week':  nur hoch.
 */
export function filterEvents(events, { mode, todayKey } = {}) {
  const minImportance = mode === 'today' ? 0 : 1;
  return (Array.isArray(events) ? events : [])
    .filter((e) => COUNTRIES.includes(e.country) && (e.importance ?? -1) >= minImportance)
    .map((e) => ({ ...e, berlin: toBerlin(e.date) }))
    .filter((e) => mode !== 'today' || e.berlin.dateKey === todayKey)
    .sort((a, b) => new Date(a.date) - new Date(b.date));
}

/** Formatiert die gefilterten Events als Briefing-Block (Text oder Telegram-HTML). */
export function formatEvents(events, { mode, html = false } = {}) {
  const esc = html ? (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') : (s) => String(s);
  const b = html ? (s) => `<b>${s}</b>` : (s) => s;
  const FLAG = { US: '🇺🇸', EU: '🇪🇺', DE: '🇩🇪' };
  const line = (e) => {
    const unit = e.unit || '';
    const extra = [
      e.forecast != null && `F ${e.forecast}${unit}`,
      e.previous != null && `P ${e.previous}${unit}`,
    ].filter(Boolean).join(' / ');
    const period = e.period ? ` (${esc(e.period)}${extra ? `, ${esc(extra)}` : ''})` : extra ? ` (${esc(extra)})` : '';
    const hot = mode === 'today' && e.importance >= 1 ? '🔥 ' : '';
    return `${e.berlin.time} ${FLAG[e.country] || e.country} ${hot}${esc(e.title)}${period}`;
  };
  const out = [];

  if (mode === 'today') {
    out.push(b('📅 Termine heute') + ' (US/EU/DE, 🔥 = hohe Wichtigkeit)');
    if (!events.length) out.push('keine wichtigen Termine');
    else for (const e of events) out.push(line(e));
    return out.join('\n');
  }

  // mode 'week': nach Tagen gruppierter Ausblick
  out.push(b('📅 Wirtschaftskalender kommende Woche') + ' (US/EU/DE, nur hohe Wichtigkeit)');
  if (!events.length) {
    out.push('keine wichtigen Termine gemeldet');
    return out.join('\n');
  }
  let lastDay = '';
  for (const e of events) {
    if (e.berlin.dateKey !== lastDay) {
      lastDay = e.berlin.dateKey;
      out.push('');
      out.push(b(`${e.berlin.day} ${e.berlin.dayNum}`));
    }
    out.push(line(e));
  }
  return out.join('\n');
}

// ── CLI-Einstieg (bei Import fuer Tests inaktiv) ──
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const html = args.includes('--html');
  const mode = args.includes('--week') ? 'week' : 'today';

  try {
    // Abfragefenster: heute (mit Puffer nach hinten) bzw. die naechsten 8 Tage.
    // Grob in UTC gerechnet; die exakte Tageszuordnung macht filterEvents
    // ohnehin in Berliner Zeit.
    const now = new Date();
    const from = new Date(now.getTime() - 12 * 3600e3);
    const to = new Date(now.getTime() + (mode === 'week' ? 8 * 24 : 36) * 3600e3);
    const url = `${API}?from=${from.toISOString()}&to=${to.toISOString()}&countries=${COUNTRIES.join(',')}`;
    const resp = await fetch(url, {
      headers: { Origin: 'https://www.tradingview.com' },
      signal: AbortSignal.timeout(15000),
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    const events = Array.isArray(data) ? data : data.result;
    const todayKey = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, dateStyle: 'short' }).format(now);
    console.log(formatEvents(filterEvents(events, { mode, todayKey }), { mode, html }));
  } catch (e) {
    // Ehrlich, aber leise: Briefing soll ohne Kalender trotzdem rausgehen.
    console.log(`📅 Wirtschaftskalender heute nicht verfuegbar (${e.message})`);
  }
  process.exit(0);
}
