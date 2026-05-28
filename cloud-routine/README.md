# Cloud-Routine — `morning-market-overview`

Eine kleine **Anthropic-Cloud-Routine**, die werktäglich um 06:30 MEZ ein kompaktes „Marktwetter" per Telegram schickt. Komplement zur lokalen 07:30-Pipeline (`scripts/morning_scan.sh`) — beide arbeiten **unabhängig**, du bekommst auch dann ein Briefing, wenn der Laptop zu ist oder TradingView gecrasht ist.

## Was die Routine macht

- US-Vortagesschluss + Asien-Eröffnung + EU + FX/Renten in einer Zeile pro Block.
- Makro-Kalender für heute und den Rest der Woche (FOMC/EZB/CPI/Mega-Cap-Earnings).
- 2–3 marktbewegende Headlines.
- Versand an Telegram über den bekannten Bot (gleiche `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` wie die lokale Pipeline).

**Keine** technische Analyse, keine Watchlist-Einzelwerte, keine Trading-Signale — das macht das lokale 07:30-Briefing.

## Einrichtung (einmalig, dauert ~5 Minuten)

> Diese Schritte musst du in der Anthropic-Web-UI ausführen — ich kann sie nicht für dich erledigen.

1. **claude.ai/code** öffnen → in der Seitenleiste auf **Routines**.
2. **„New routine"** klicken → **„Remote"** auswählen (nicht „Local" — wir wollen, dass es auch bei zugeklapptem Laptop läuft).
3. Felder ausfüllen:
   - **Name:** `morning-market-overview`
   - **Description:** `Tägliches Marktwetter via Telegram (Komplement zur lokalen 07:30-Pipeline)`
   - **Schedule:** `Weekdays at 06:30` (UI-Picker) — alternativ via Cron-Expression `30 6 * * 1-5`
   - **Instructions:** den **kompletten Inhalt von [`morning-overview-prompt.md`](morning-overview-prompt.md)** kopieren (alles **unter** der HTML-Kommentar-Header-Trennlinie `---`). In das Instructions-Feld einfügen.
4. **Secrets** (in der Routine-Config-UI, NICHT in den Repo committen!):
   - `TELEGRAM_BOT_TOKEN` — derselbe Wert wie in der lokalen `.env`.
   - `TELEGRAM_CHAT_ID` — `85303838` (deine numerische Chat-ID).
5. **Connected repo:** kann auf v1 leer bleiben. (Sinnvoll erst, wenn die Routine später z.B. die Watchlist aus dem Repo lesen soll.)
6. **Permissions / Tools:** Web-Suche sollte aktiviert sein, Bash mit Netzwerk-Zugriff für `curl` ebenfalls. Wenn ein Tool fehlt → in der Routine-Config nachziehen.
7. **„Run now"** klicken zum Test. Erwartung: in 30–60 s erscheint eine Telegram-Nachricht im bekannten Format.
8. Wenn der Test klappt: Routine **aktivieren** (`Active` toggle).

## Wartung & Anpassung

- **Prompt ändern:** [`morning-overview-prompt.md`](morning-overview-prompt.md) im Repo editieren, Commit, dann den neuen Text in der Routine-UI **manuell** ins Instructions-Feld einfügen. (Es gibt keine automatische Sync — der Repo-Stand ist die versionierte Quelle, die UI-Kopie ist der Live-Stand.)
- **Uhrzeit ändern:** in der Routine-UI, nicht hier.
- **Pausieren:** in der Routine-UI auf `Paused` schalten. Die lokale Pipeline läuft unabhängig weiter.
- **Löschen / Neu aufsetzen:** Routine in der UI löschen, dann wieder anlegen wie oben.

## Verifikation nach dem Anlegen

- [ ] Manueller „Run now"-Test ergibt eine Telegram-Nachricht im Format aus dem Prompt.
- [ ] Format-Check: Indizes-Block, Makro-Kalender, Headlines, Schlusszeile vorhanden.
- [ ] Zeichenlänge ≤ 1500.
- [ ] Erster planmäßiger Lauf am nächsten Werktag 06:30 — beide Telegrams kommen (Cloud 06:30 + Local 07:30).
- [ ] Über eine Woche beobachten: Inhalts-Qualität stabil? Falls Format-Drift: Prompt schärfen.

## Architektur-Überblick

```
06:30 (werktags)                          07:30 (werktags)
┌──────────────────────────────┐          ┌──────────────────────────────┐
│ Anthropic-Cloud-Routine      │          │ Laptop: cron → morning_scan.sh│
│ Web-Suche → Markt-Wetter     │          │ TV-CDP → patterns_detect      │
│ → Telegram                   │          │ → Telegram                    │
└──────────────────────────────┘          └──────────────────────────────┘
   läuft IMMER (Cloud)                       läuft NUR wenn Laptop wach
                                              + TV mit Debug-Port
```

Wenn die lokale Pipeline aus irgendeinem Grund ausfällt (Electron-Crash, Laptop zu, Reise), hast du dank der Cloud-Routine zumindest immer das Marktwetter. Ist das lokale Briefing da, ergänzt es das Cloud-Briefing mit den Pattern-Details aus der Watchlist.

## Verwandte Stellen

- [`../scripts/morning_scan.sh`](../scripts/morning_scan.sh) / [`../scripts/morning_scan.ps1`](../scripts/morning_scan.ps1) — lokale Pipeline.
- [`../scripts/telegram_send.js`](../scripts/telegram_send.js) — lokales Telegram-Skript. Die Cloud-Routine ruft die Telegram-API **direkt** per `curl` auf (sie liegt nicht im Repo-Clone aus), nutzt aber den gleichen Bot.
- Anthropic-Docs: [Schedule recurring tasks in Claude Code Desktop](https://code.claude.com/docs/en/desktop-scheduled-tasks), [Routines](https://claude.com/blog/introducing-routines-in-claude-code).
