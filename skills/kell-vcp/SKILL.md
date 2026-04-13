---
name: kell-vcp
description: Kell + Minervini VCP — Vollanalyse eines Titels. Prüft alle Bedingungen der Strategie (Trend Template, Kell-Phase, VCP), gibt eine klare Handlungsempfehlung und optional Backtest-Report. Aufruf: /kell-vcp [SYMBOL] oder ohne Symbol für aktiven Chart.
---

# Kell + Minervini VCP — Analyse-Skill

Du führst eine vollständige Analyse nach dem Oliver Kell Cycle of Price Action + Mark Minervini SEPA/VCP System durch.

## Strategie-Kurzreferenz

**Oliver Kell — 6 Phasen (tägliche EMAs, Primär: EMA10 + EMA20):**
- Phase 2 Wedge Pop (WP): Ausbruch über EMA20, hält sich über EMA10, Volumen hoch
- Phase 3 EMA Crossback (CB): Pullback zur EMA10 oder EMA20 im Aufwärtstrend — bester Einstieg
- Phase 4 Base n' Break (BnB): Enge Konsolidierung (<8% Range über 10 Bars) + Ausbruch mit Volumen
- Phase 5 Exhaustion (EXT): Kurs >15% über EMA10 + RSI >78 → GEWINNE SICHERN, kein Kauf
- Phase 6 Wedge Drop (WD): Kurs unter EMA10 UND EMA20 → sofort aussteigen / meiden

**Minervini Trend Template (alle 8 Kriterien nötig — SMA, nicht EMA!):**
1. Kurs > SMA50
2. SMA50 > SMA150
3. SMA150 > SMA200
4. SMA200 steigt seit ≥ 1 Monat
5. Kurs ≤ 25% unter 52-Wochen-Hoch
6. Kurs ≥ 30% über 52-Wochen-Tief
7. RS Rating > 70 (manuell prüfen)
8. Earnings Growth ≥ 20% YoY (fundamental, manuell prüfen)

**Minervini VCP (Volatility Contraction Pattern):**
- 2–6 progressiv kleiner werdende Pullbacks (Bsp.: 18% → 12% → 6%)
- Volumen trocknet während Kontraktion aus (<65% des 50-Tage-Avg)
- Ausbruch über Pivot (letztes Kontraktion-Hoch) mit Volumen ≥140% des Avg

**Einstiegsregeln:**
- Stop: 3% unter EMA10 (Kell) | Hard Stop: max. 8% unter Einstieg (O'Neil)
- Erstes Profit-Ziel: 20–25% Gewinn (Minervini: "nail down first profits")
- Trailing Stop: EMA50 (Minervini) oder bei Wedge Drop (Kell: EMA10 + EMA20 beide verloren)

---

## Schritt 1: Symbol setzen

Falls ein Symbol als Argument übergeben wurde (z.B. `/kell-vcp AAPL`):
- `chart_set_symbol` mit dem übergebenen Symbol
- `chart_set_timeframe` auf "D" (Daily)

Falls kein Symbol angegeben: Aktuellen Chart-Zustand lesen.

## Schritt 2: Chart-Zustand lesen

1. `chart_get_state` → Symbol, Timeframe, aktive Indikatoren
2. `quote_get` → aktueller Kurs, OHLC, Volumen

## Schritt 3: Indikatoren ablesen

3. `data_get_study_values` → alle verfügbaren Indikator-Werte (EMAs, RSI, MACD)
4. `data_get_pine_lines` mit `study_filter: "Kell"` → Kurs-Levels aus dem VCP-Overlay (falls aktiv)
5. `data_get_pine_tables` mit `study_filter: "Kell"` → Tabellen-Status (Phase, Bias, Trend Template)

## Schritt 4: Preisdaten analysieren

6. `data_get_ohlcv` mit `summary: true, count: 20` → kompakte Preis-Zusammenfassung
7. Screenshot: `capture_screenshot` mit region "chart"

## Schritt 5: Kell-Phase bestimmen

Berechne oder lies ab:
- **EMA10, EMA20, EMA50, EMA200** (aus study values oder OHLCV-Daten)
- **SMA50, SMA150, SMA200** (für Trend Template)
- **RSI** aktueller Wert
- **Volumen** vs. 50-Tage-Durchschnitt

Bestimme die aktuelle Kell-Phase:
```
Wedge Drop  → Kurs < EMA10 UND Kurs < EMA20
Exhaustion  → Kurs > EMA10 × 1.15 UND RSI > 78
Wedge Pop   → Kurs hat EMA20 von unten gekreuzt + über EMA10 + Volumen hoch
EMA CB      → Kurs ±2% von EMA10 oder EMA20 + über EMA50 + über EMA200
Base n Brk  → Enge Range (<8%) über 10 Bars + Ausbruch + Volumen
Aufwärtstr. → über EMA10, 20, 50, 200 + EMA10>20>50
```

## Schritt 6: Trend Template prüfen

Prüfe alle 6 automatisierbaren Kriterien:
- [ ] Kurs > SMA50?
- [ ] SMA50 > SMA150?
- [ ] SMA150 > SMA200?
- [ ] SMA200 steigt?
- [ ] Kurs ≤ 25% unter 52W-Hoch?
- [ ] Kurs ≥ 30% über 52W-Tief?

## Schritt 7: VCP prüfen

- ATR(5) vs ATR(14): Liegt ATR5 < ATR14 × 0.7? (Volatilitäts-Kontraktion)
- Volumen der letzten 5 Bars vs. 50-Tage-Avg: Unter 65%? (Dry-Up bestätigt)
- Nähe zum Pivot (letztes Hoch): Innerhalb 3–5% des Ausbruchspunkts?

## Schritt 8: Handlungsempfehlung ausgeben

Gib eine klare, strukturierte Empfehlung:

```
## Kell + Minervini Analyse: [SYMBOL] — [Datum]

**Kurs:** [Preis] | **Timeframe:** Daily

### Kell-Phase
[Phase-Name + kurze Begründung mit konkreten Zahlen]

### Minervini Trend Template
[✓/✗ für jedes Kriterium] → Gesamt: ERFÜLLT / NICHT ERFÜLLT

### VCP Status
[Kontraktion aktiv? Volumen ausgetrocknet? Pivot-Abstand?]

### Handlungsempfehlung
**BIAS:** [LONG / MEIDEN / NEUTRAL]

[Konkrete Begründung — welche Bedingungen fehlen noch / sind erfüllt]

**Entry:** [Preis-Level oder "noch nicht"]
**Stop:** [Preis-Level — 3% unter EMA10]
**Ziel:** [Preis-Level — 20% über Entry]
**R/R:** [berechnet]
```

## Optional: Backtest-Report abrufen

Falls der Nutzer explizit einen Backtest-Report will:
1. Prüfe ob "Kell + Minervini VCP [Backtest v2]" im Chart aktiv ist
2. Falls nicht: `chart_manage_indicator` add "Kell + Minervini VCP [Backtest v2]" (aus gespeicherten Scripts)
3. Warte 2s auf Strategy Tester
4. `ui_open_panel` mit "strategy-tester"
5. Warte 3s
6. `capture_screenshot` mit region "strategy_tester"
7. Verwende den `/strategy-report` Skill für vollständige Auswertung

## Hinweise

- Kell's Primär-MAs: **EMA10 + EMA20** (nicht EMA50!)
- Minervini nutzt **SMA** (Simple), nicht EMA für sein Trend Template
- Profit-Ziel erst bei **20–25%** (nicht 2R aus engem Stop)
- Strategie ist optimiert für: Mid-Cap Growth Stocks ($2B–$25B), Stage 2 Uptrend, 30%+ Earnings-Wachstum
- Für volatile Mega-Caps (TSLA, NVDA) ist die Strategie weniger geeignet
