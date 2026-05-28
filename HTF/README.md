# High Tight Flag (HTF)

Strategie-Workspace für das **High Tight Flag**-Setup (Minervini / O'Neil / Kell).
Reine Doku — der gemeinsame Detektor, Tests und CLI liegen weiterhin in
[`../src/core/patterns.js`](../src/core/patterns.js) und werden auch von
[Power Play](../Powerplay/README.md) genutzt.

## Was ist ein High Tight Flag

Eines der explosivsten Fortsetzungsmuster: erst ein steiler Anstieg („Flaggenmast"),
dann eine sehr enge, flache Konsolidierung („Flagge"), die mit einem Ausbruch endet.
Im Gegensatz zum Power Play darf die Flagge **kurz** sein (eine bis fünf Wochen) —
genau das Tempo, das oft an „Beinahe-Treffer" scheitert.

## Detektions-Kriterien (Default-Schwellen)

Quelle der Wahrheit: [`../src/core/patterns.js`](../src/core/patterns.js) → `DEFAULT_THRESHOLDS`.

| Element | Schwelle | Bedeutung |
|---|---|---|
| **Mast (`pole_min_gain_pct`)** | **≥ 90 %** | Kurs steigt um mindestens +90 % vom Tief des Masts zum Hoch. |
| **Mast-Dauer (`pole_max_days`)** | **≤ 40 Tage** | ~8 Wochen Handelstage — schneller Anstieg, nicht ein langes Wegklettern. |
| **Flaggen-Tiefe (`flag_max_depth_pct`)** | **≤ 25 %** | Rücksetzer vom Hoch in der Konsolidierung darf höchstens 25 % betragen. |
| **Flaggen-Dauer (`flag_min_days` / `flag_max_days`)** | **5 – 25 Tage** | ~1–5 Wochen. Kürzer als beim Power Play. |
| **Ausbruchsbereitschaft** | ≤ 8 % unter Pivot **oder** schon ausgebrochen | Sonst „zu weit weg vom Trigger". |

> Optional, aber stark gewichtet im Score (siehe unten): Volumen-Austrocknung
> während der Flagge und Trend über EMA50/SMA50.

## Score-Berechnung (0–100)

Beide Strategien teilen sich denselben Score — er bewertet auch Teil-Treffer,
damit Beinahe-Treffer in der „Top nach Score"-Liste sichtbar bleiben.
Code: [`../src/core/patterns.js:206-219`](../src/core/patterns.js#L206-L219).

| Komponente | max. Punkte | Wie berechnet | Volle Punktzahl bei |
|---|---|---|---|
| **Mast-Stärke** | 30 | `pole_gain_pct / 90` | Mast ≥ 90 % |
| **Flaggen-Enge** | 25 | `(25 − flag_depth_pct) / 25` | Tiefe 0 % (sehr eng) |
| **Volumen-Austrocknung** | 20 | `1 − min(vol_dryup_ratio, 1)` | 5-Bar-Vol weit unter 50-Bar-Vol |
| **Pivot-Nähe** | 15 | `(8 − Pivot-Abstand %) / 8` oder volle 15 bei Breakout | Direkt am Pivot |
| **Trend** | 10 | je 5 P für `above_key_mas` und `sma50_rising` | über EMA50 **und** SMA50 steigt |

## Trading-Regeln (Mirkos Vorgaben, festgehalten 2026-05-27)

- **Entry (prozyklisch):** Buy-Stop knapp über dem Hoch der Ausbruchskerze /
  oberer Flaggen-Trendlinie. Alternativ Pullback auf untere Flaggenkante oder 10 EMA.
- **Stop:** unter Tagestief der Ausbruchs-/Umkehrkerze oder letztem Swing Low
  in der Flagge.
- **Risiko:** optimal < 5 %, in jedem Fall einstellig. Der Scanner markiert eine
  HTF-Position nur dann als **HANDELBAR**, wenn das Swing-Low-Risiko ≤ 8 % beträgt
  (`max_risk_pct`). Höher → erscheint unter „Risiko zu hoch (beobachten)".
- **Gewinnmitnahme:** Teilverkauf bei 1.5–2× Anfangsrisiko → Position risk-free.

## Lesen des Morning-Briefings

Eine HTF-Zeile in der HANDELBAR-Sektion sieht so aus (siehe
[`../scripts/scan_summary.js`](../scripts/scan_summary.js)):

```
HANDELBAR (1):
  NASDAQ:FOO: high_tight_flag | Einstieg 100.0 / Stop 95.0 / Risiko 5.0% | Score 75
    Mast +110%/22T | Flagge 14.0%/10T | Pivot -2.1% | Vol 0.55x (dry) | Trend ok | Risk 5.0%
```

- `high_tight_flag` ↔ Muster erkannt.
- Detail-Zeile: Mast-Gewinn/Dauer, Flaggen-Tiefe/Dauer, Pivot-Abstand,
  Volumen-Dryup-Ratio (`(dry)` = unter Schwelle 0.65), Trend (`ok` = beides ✓),
  Risk (`!` = außerhalb des einstelligen Bereichs).

In „Top nach Score" tauchen oft Beinahe-Treffer auf — typisch `patterns: []`,
aber hohe Mast-Punkte. Das sind die „Mast steht, wartet auf Konsolidierung"-Fälle.

## On-Chart-Indikator

[`../scripts/htf_levels.pine`](../scripts/htf_levels.pine) — zeichnet Pivot
(Einstieg), Swing-Low-Stop und R-Targets (1.5R, 2R) auf den Chart, plus
Status-Label *„High Tight Flag"* / *„Power Play"* / *„HTF + Power Play"* /
*„kein Muster"*. Manuell ins TradingView laden (Clipboard-Workflow — die
`tv pine set`-Automatik ist seit v3.1.0 unzuverlässig).

## Verwandte Stellen

- [Power Play](../Powerplay/README.md) — Schwesterstrategie, gleicher Detektor,
  strengere Mindestbedingungen.
- [`../src/core/patterns.js`](../src/core/patterns.js) — Detektor (`detectPatterns`).
- [`../tests/patterns.test.js`](../tests/patterns.test.js) — Offline-Tests.
- [`../scripts/morning_scan.sh`](../scripts/morning_scan.sh) — tägliche Auswertung
  (Linux); Windows-Pendant: `../scripts/morning_scan.ps1`.
