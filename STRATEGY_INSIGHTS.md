# Oliver Kell + Minervini VCP — Strategy Research & Backtest Insights

## Strategie-Grundlagen

Diese Strategie kombiniert drei bewährte Ansätze erfolgreicher Trader:

| Trader | System | Bekanntes Ergebnis |
|--------|--------|--------------------|
| **Oliver Kell** | Cycle of Price Action | 941% Rendite, 2020 US Investing Championship |
| **Mark Minervini** | SEPA / VCP (Volatility Contraction Pattern) | 4x US Investing Championship |
| **William O'Neil** | CANSLIM | Gründer IBD, Basis vieler moderner Systeme |

---

## Die 6 Zyklusphasen (Oliver Kell)

| Phase | Signal | Aktion |
|-------|--------|--------|
| 1. Reversal Extension | Erste Bewegung vom Tief | Beobachten |
| 2. Wedge Pop (WP) | Ausbruch über EMA 50 + Volumen | Erste Position (25–33%) |
| 3. EMA Crossback (CB) | Pullback zur EMA 20 im Trend | Aufstocken — **bester Einstieg** |
| 4. Base n Break (BnB) | Enge Konsolidierung + Ausbruch | Voll einsteigen |
| 5. Exhaustion Extension (EXT) | Kurs >20% über EMA 20, RSI >78 | Gewinne sichern |
| 6. Wedge Drop (WD) | Unter EMA 50, bärische Ausrichtung | Kein Long |

---

## Einstiegsregeln

**Long-Signal (alle Bedingungen müssen erfüllt sein):**
- Kurs über EMA 20, 50 und 200
- EMA 20 über EMA 50 (bullische Ausrichtung)
- RSI zwischen 45 und 75
- MACD-Histogramm positiv oder drehend
- Volumen ≥ 1,5x Durchschnitt (bei Ausbrüchen)
- Oliver Kell Zyklus zeigt Phase 2, 3 oder 4

**VCP-Zusatzbedingung:**
- ATR(5) < ATR(14) × 0,7 (Volatilitäts-Kontraktion)
- Ausbruch über 20-Tage-Hoch

---

## Exit-Regeln

| Exit-Typ | Bedingung | Kommentar |
|----------|-----------|-----------|
| Stop Loss | 3% unter EMA 20 | Initialer Stop |
| Hard Stop | 8% unter Einstieg | O'Neil-Regel, niemals überschreiten |
| Profit Target | 2× Risiko (automatisch) | R/R ≥ 1:2 |
| Trailing Stop | Close unter EMA 50 | Weniger aggressiv als EMA 20 |
| Trend Exit | Wedge Drop oder Exhaustion | Sofortiger Ausstieg |

---

## Backtest-Ergebnisse

### S&P 500 (1871–2026, 829 Trades)
- G&V: +27,77% | Profitfaktor: 1,267 | Win Rate: 33% | R/R: 2,54
- **Fazit:** Konsistent profitabel über alle Marktzyklen, aber Buy & Hold schlägt es deutlich

### Mag7 (ab 2022, EMA50-Exit)

| Stock | Trades | Win Rate | Profitfaktor | Avg Haltedauer | G&V |
|-------|--------|----------|-------------|----------------|-----|
| **GOOGL** | 36 | **50%** | **2,10** ✅ | 8 Tage | **+$565** |
| **AMZN** | 35 | 43% | **1,29** ✅ | 10 Tage | **+$184** |
| **AAPL** | 41 | 32% | **1,24** ✅ | 9 Tage | **+$164** |
| META | 39 | 41% | 0,96 ⚠️ | 6 Tage | ~0 |
| NVDA | 55 | 35% | 0,93 ❌ | 4 Tage | -$67 |
| MSFT | 21 | 29% | 0,85 ❌ | 14 Tage | -$152 |
| TSLA | 60 | 25% | 0,67 ❌ | 3 Tage | -$133 |

### Kraken Robotics TSXV:PNG (1D, 2022+)
- G&V: +4,78% | Profitfaktor: 1,51 | Win Rate: 46% | Max DD: 2,77%
- **Fazit:** Profitabel, aber zu wenige Trades (50) für statistische Aussagekraft

---

## Schlüssel-Erkenntnisse

### 1. Richtige Asset-Selektion ist entscheidend
Oliver Kell selektiert Aktien **manuell** nach:
- Stage 2 Uptrend (Kurs über allen MAs)
- 30%+ Gewinnwachstum quarterly
- Relative Stärke gegenüber dem Gesamtmarkt
- Liquide Titel (>500k Tagesvolumen)

Ein blinder Backtest über die gesamte Geschichte einer Aktie ist **nicht fair** — NVDA 1999–2002 (Dotcom-Crash) ist ein komplett anderes Regime als NVDA 2023 (KI-Boom).

### 2. Exit-Qualität bestimmt Performance
- EMA20-Exit: avg. 2–4 Tage Haltedauer → zu früh
- EMA50-Exit: avg. 8–14 Tage Haltedauer → besser, aber immer noch optimierbar
- Stabile Titel (GOOGL, AAPL): profitieren am meisten vom längeren Halten

### 3. Win Rate ist zweitrangig
Mit einem R/R von 2:1 ist eine Win Rate von 34% bereits profitabel:
- 34% × 2 - 66% × 1 = 0,68 - 0,66 = **+0,02 je Trade (positiver Erwartungswert)**

### 4. Strategie ist für Trending-Märkte optimiert
- Funktioniert: GOOGL (stabil, fundamental stark), AAPL, AMZN
- Funktioniert schlecht: TSLA, NVDA (zu volatil, extreme Bewegungen)
- Optimal: Small/Mid-Cap Growth Stocks in Stage 2 Uptrend

### 5. Statistische Aussagekraft
- < 50 Trades: Nicht aussagekräftig
- 50–100 Trades: Eingeschränkt aussagekräftig
- 100+ Trades: Statistisch valide
- 200+ Trades: Starke Aussagekraft

---

## Nächste Schritte / Optimierungspotential

- [ ] NVDA ab 2023 (KI-Boom) testen
- [ ] Exit verbessern: gestaffelter Teilausstieg (50% bei Target, Rest trailing)
- [ ] Markt-Filter hinzufügen: nur handeln wenn SPY über 200-EMA
- [ ] Weekly Timeframe für Entry-Bestätigung nutzen
- [ ] Auf weiteren Small-Cap Growth Stocks testen (Kells eigentlicher Fokus)

---

## Indikatoren im Chart (TSXV:PNG, 1D)

| Indikator | Funktion |
|-----------|----------|
| Kell + Minervini VCP Strategy | EMAs, Phasensignale, Info-Tabelle, Stops |
| Oliver Kell Cycle of Price Action [Professional] | Professionelle Zykluserkennung |
| EMA Crossback nach Wedge Pop (Weekly) | Wöchentlicher Crossback-Filter |
| RSI (14) | Visueller Momentum-Pane |
| MACD (12/26/9) | Visueller Trend-Pane |
| Volume | Volumenbestätigung |
| Price to Earnings Ratio | Fundamentaldaten |
