# Power Play

Strategie-Workspace für das **Power Play**-Setup (Minervini).
Reine Doku — der gemeinsame Detektor, Tests und CLI liegen weiterhin in
[`../src/core/patterns.js`](../src/core/patterns.js) und werden auch vom
[High Tight Flag](../HTF/README.md) genutzt.

## Was ist ein Power Play

Minervinis Variante des explosiven Fortsetzungsmusters. Im Vergleich zum HTF:

- **Mast noch steiler:** mindestens +100 % (statt +90 %) in höchstens 8 Wochen.
- **Basis länger:** zwei bis sechs Wochen (statt 1–5).
- **Trend-Filter zwingend:** der Kurs muss über den wichtigen gleitenden
  Durchschnitten halten **und** der SMA50 muss steigen.
- **Volumen-Austrocknung zwingend:** in der Basis muss das Volumen messbar
  ruhiger werden — der „Akkumulations"-Charakter.

Heißt: Power Plays sind seltener als HTFs, aber das Setup-Profil ist robuster.

## Detektions-Kriterien (Default-Schwellen)

Quelle der Wahrheit: [`../src/core/patterns.js`](../src/core/patterns.js) → `DEFAULT_THRESHOLDS`.

| Element | Schwelle | Bedeutung |
|---|---|---|
| **Mast (`pp_min_gain_pct`)** | **≥ 100 %** | Kurs verdoppelt sich (mindestens) vom Tief des Masts zum Hoch. |
| **Mast-Dauer (`pp_pole_max_days`)** | **≤ 40 Tage** | ~8 Wochen. |
| **Basis-Tiefe (`pp_base_max_depth_pct`)** | **≤ 25 %** | Wie HTF. |
| **Basis-Dauer (`pp_base_min_days` / `pp_base_max_days`)** | **10 – 30 Tage** | ~2–6 Wochen. **Unten gelockert von 15 → 10** (2026-05-29), damit schnellere Marktphasen wie INTC mit 12-Tage-Basis nicht durchrutschen. |
| **Trend (`above_key_mas`)** | **Pflicht** | Kurs schließt über EMA50. |
| **SMA50-Steigung (`sma50_rising`)** | **Pflicht** | SMA50 heute > SMA50 vor 21 Bars. |
| **Volumen-Austrocknung (`vol_dryup_ratio`)** | **< 0.65** | 5-Bar-Volumen weniger als 65 % des 50-Bar-Schnitts. |

> **Wichtig:** Im Gegensatz zum HTF sind `trend` und `vol_dryup` beim Power Play
> **harte Pflichtbedingungen** — fehlt einer, ist es kein PP (kann aber dennoch
> ein HTF sein, wenn die HTF-Schwellen erfüllt sind).

## Score-Berechnung (0–100)

Beide Strategien teilen sich denselben Score — er bewertet auch Teil-Treffer,
damit Beinahe-Treffer in der „Top nach Score"-Liste sichtbar bleiben.
Code: [`../src/core/patterns.js:206-219`](../src/core/patterns.js#L206-L219).

| Komponente | max. Punkte | Wie berechnet | Volle Punktzahl bei |
|---|---|---|---|
| **Mast-Stärke** | 30 | `pole_gain_pct / 90` (Skala kommt von HTF) | bereits bei ≥ 90 % — PP fängt erst bei ≥ 100 % |
| **Basis-Enge** | 25 | `(25 − base_depth_pct) / 25` | Tiefe 0 % (sehr eng) |
| **Volumen-Austrocknung** | 20 | `1 − min(vol_dryup_ratio, 1)` | sehr trockenes Volumen |
| **Pivot-Nähe** | 15 | `(8 − Pivot-Abstand %) / 8` oder volle 15 bei Breakout | Direkt am Pivot |
| **Trend** | 10 | je 5 P für `above_key_mas` und `sma50_rising` | über EMA50 **und** SMA50 steigt |

Hohe Scores ohne PP-Markierung („Top nach Score" Detail-Zeile zeigt `patterns: -`)
sind oft genau die Setups, denen *eine* Pflichtbedingung fehlt — meist Vol-Dryup
oder eine noch nicht geformte Basis.

## Trading-Regeln

Identisch zum [HTF](../HTF/README.md#trading-regeln-mirkos-vorgaben-festgehalten-2026-05-27).

Kurz: prozyklischer Buy-Stop knapp über Ausbruchskerze, Swing-Low-Stop, Risiko
einstellig (idealerweise < 5 %), Teilverkauf bei 1.5–2 R → risk-free.

## Lesen des Morning-Briefings

Eine PP-Zeile in der HANDELBAR-Sektion sieht so aus
([`../scripts/scan_summary.js`](../scripts/scan_summary.js)):

```
HANDELBAR (1):
  NASDAQ:BAR: power_play | Einstieg 50.0 / Stop 47.5 / Risiko 5.0% | Score 82
    Mast +135%/35T | Flagge 12.0%/18T | Pivot -1.5% | Vol 0.55x (dry) | Trend ok | Risk 5.0%
```

- `power_play` ↔ Muster erkannt.
- Ein Symbol kann *gleichzeitig* `high_tight_flag` und `power_play` sein
  (beide Patterns werden im Array angezeigt) — dann erfüllt es beide
  Kriterien-Sätze.

## On-Chart-Indikator

[`../scripts/htf_levels.pine`](../scripts/htf_levels.pine) — zeichnet
Einstieg/Stop/Targets für **beide** Strategien; das Status-Label oben
unterscheidet *„Power Play"* / *„High Tight Flag"* / *„HTF + Power Play"* /
*„kein Muster"*. Manuell ins TradingView laden (Clipboard-Workflow).

## Warum Power Plays selten gefunden werden — und wann das richtig ist

Häufige „Beinahe-Treffer" in der Top-Liste, ohne `power_play`-Markierung:

| Lage | Was sichtbar ist | Warum kein PP |
|---|---|---|
| „Flagge: noch nicht" | starker Mast (+150 % bis +200 %), aber keine Basis | Kurs macht noch neue Hochs — Konsolidierung steht noch aus |
| „Vol …x" (ohne `(dry)`) | Mast + Basis ok, aber Vol-Ratio > 0.65 | Volumen ist nicht trocken — Akkumulation noch nicht abgeschlossen |
| „Basis zu kurz" | Mast + Basis < 10 Tage | Selbst nach der Lockerung 15→10 zu kurz |
| „Flagge X %" mit X > 25 | breite Konsolidierung | Zu tief für ein enges PP-Setup |

**Daumenregel:** Werden in der „Top nach Score"-Sektion mehrere Symbole mit
`Mast > 100 %` *und* `Vol < 0.7x` *und* einer Basis von 10+ Tagen sichtbar,
aber **kein** PP markiert, dann ist die Schwellen-Konfiguration zu prüfen
(vermutlich Vol-Dryup-Schwelle 0.65 zu streng für aktuelle Marktphase).

## Verwandte Stellen

- [High Tight Flag](../HTF/README.md) — Schwesterstrategie, gleicher Detektor,
  weichere Mindestbedingungen.
- [`../src/core/patterns.js`](../src/core/patterns.js) — Detektor (`detectPatterns`).
- [`../tests/patterns.test.js`](../tests/patterns.test.js) — Offline-Tests
  (enthält dedizierten Power-Play-Testfall).
- [`../scripts/morning_scan.sh`](../scripts/morning_scan.sh) — tägliche Auswertung
  (Linux); Windows-Pendant: `../scripts/morning_scan.ps1`.
