#!/usr/bin/env node
/**
 * Sendet eine Nachricht (von stdin) an Telegram. Wird von morning_scan.sh genutzt.
 *
 * Mit --html wird die Nachricht als Telegram-HTML gesendet (fette Titel usw.).
 * Der Absender (Formatter) ist dann dafuer verantwortlich, dass < > & in
 * dynamischen Werten escaped sind. Lehnt Telegram das HTML ab ("can't parse
 * entities"), wird automatisch einmal als reiner Text nachgesendet — lieber
 * ein unformatiertes Briefing als gar keins.
 *
 * Konfiguration in der .env im Projektwurzelverzeichnis (NIEMALS committen — ist gitignored):
 *   TELEGRAM_BOT_TOKEN=123456:ABC...     (von @BotFather)
 *   TELEGRAM_CHAT_ID=123456789           (eigene Chat-ID, z.B. via @userinfobot)
 *
 * Exit 0 = gesendet, !=0 = nicht konfiguriert / Fehler (Aufrufer ueberspringt dann).
 */
import { readFileSync } from 'node:fs';

// .env laden — bereits gesetzte Umgebungsvariablen haben Vorrang.
try {
  const envText = readFileSync(new URL('../.env', import.meta.url), 'utf8');
  for (const line of envText.split('\n')) {
    if (line.trim().startsWith('#')) continue;
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
    }
  }
} catch (_) {
  /* keine .env — evtl. echte Umgebungsvariablen gesetzt */
}

const useHtml = process.argv.includes('--html');

const token = process.env.TELEGRAM_BOT_TOKEN;
const chatId = process.env.TELEGRAM_CHAT_ID;
if (!token || !chatId) {
  process.stderr.write('Telegram nicht konfiguriert (TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID fehlen).\n');
  process.exit(1);
}

// Nachricht von stdin lesen.
let text = '';
if (!process.stdin.isTTY) {
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) text += chunk;
}
text = (text || '').trim() || '(leeres Briefing)';
if (text.length > 4000) {
  // Am letzten Zeilenumbruch kuerzen, nie mitten in der Zeile: so wird im
  // HTML-Modus kein <b>…</b>-Tag zerschnitten (Tags sind immer zeilenlokal).
  const cutAt = text.lastIndexOf('\n', 3990);
  text = text.slice(0, cutAt > 0 ? cutAt : 3990) + '\n…(gekürzt)';
}

// Bei transienten Netzfehlern (DNS/TLS/'fetch failed') bis zu MAX_ATTEMPTS Versuche
// mit RETRY_DELAY_MS Pause. NICHT retrigern bei echtem Telegram-API-Fehler
// (ok:false z.B. wegen falschem Token/Chat) — das wuerde es nicht besser machen.
const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 3000;

let asHtml = useHtml;
for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
  try {
    const body = { chat_id: chatId, text, disable_web_page_preview: true };
    if (asHtml) body.parse_mode = 'HTML';
    const resp = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await resp.json();
    if (data.ok) process.exit(0);
    // Kaputtes HTML (z.B. unescaptes "<" in einem Wert): einmal ohne
    // parse_mode nachsenden, Tags grob entfernen — Inhalt vor Form.
    if (asHtml && /parse/i.test(data.description || '')) {
      process.stderr.write('Telegram lehnt HTML ab — sende als reinen Text: ' + data.description + '\n');
      asHtml = false;
      text = text.replace(/<\/?(b|i|u|s|code|pre)>/g, '');
      attempt--; // dieser Ersatzversuch zaehlt nicht gegen die Netz-Retries
      continue;
    }
    // API-Fehler (z.B. chat_not_found, bot_token_invalid) — Retry waere sinnlos.
    process.stderr.write('Telegram-Fehler: ' + JSON.stringify(data) + '\n');
    process.exit(1);
  } catch (err) {
    if (attempt < MAX_ATTEMPTS) {
      process.stderr.write(
        `Telegram-Sendefehler (Versuch ${attempt}/${MAX_ATTEMPTS}): ${err.message} — neuer Versuch in ${RETRY_DELAY_MS / 1000}s\n`,
      );
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
      continue;
    }
    process.stderr.write(`Telegram-Sendefehler nach ${MAX_ATTEMPTS} Versuchen: ${err.message}\n`);
    process.exit(1);
  }
}
