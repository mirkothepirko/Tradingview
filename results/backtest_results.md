# Backtest-Ergebnisse: Kell + Minervini VCP v1 vs v2

**Erstellt:** 2026-04-13 | **Zeitraum:** ab 2022-01-01 | **Timeframe:** Daily

## v2 Ergebnisse (Recherche-Korrekturen April 2026)

| Symbol | Trades | Win Rate | Profit Faktor | Max DD | Fazit |
|--------|--------|----------|---------------|--------|-------|
| **GOOGL** | 28 | 32.1% | 2.42 ✅ | 1.59% | Profitabel |
| **AMZN** | 27 | 29.6% | 1.35 ⚠️ | 1.95% | Break-Even |
| **AAPL** | 38 | 23.7% | 0.92 ❌ | 2.82% | Verlust |
| **META** | 35 | 40.0% | 2.15 ✅ | 2.70% | Profitabel |
| **NVDA** | 60 | 20.0% | 1.24 ⚠️ | 3.59% | Break-Even |
| **MSFT** | 23 | 30.4% | 1.40 ⚠️ | 1.95% | Break-Even |
| **TSLA** | 59 | 11.9% | 0.56 ❌ | 5.95% | Verlust |

## v1 Baseline (EMA50-Exit, ~6% Profit, RSI-Filter, EMA20-Stop)

| Symbol | Trades | Win Rate | Profit Faktor | Fazit |
|--------|--------|----------|---------------|-------|
| **GOOGL** | 36 | 50.0% | 2.10 ✅ | Profitabel |
| **AMZN** | 35 | 43.0% | 1.29 ⚠️ | Break-Even |
| **AAPL** | 41 | 32.0% | 1.24 ⚠️ | Break-Even |
| **META** | 39 | 41.0% | 0.96 ❌ | Verlust |
| **NVDA** | 55 | 35.0% | 0.93 ❌ | Verlust |
| **MSFT** | 21 | 29.0% | 0.85 ❌ | Verlust |
| **TSLA** | 60 | 25.0% | 0.67 ❌ | Verlust |

## v1 vs v2 Vergleich (Profit Faktor)

| Symbol | PF v1 | PF v2 | Δ | Trades v1 → v2 | Trend |
|--------|-------|-------|---|----------------|-------|
| **GOOGL** | 2.10 | 2.42 | +0.32 | 36 → 28 | ↑ Besser |
| **AMZN** | 1.29 | 1.35 | +0.06 | 35 → 27 | → Gleich |
| **AAPL** | 1.24 | 0.92 | -0.32 | 41 → 38 | ↓ Schlechter |
| **META** | 0.96 | 2.15 | +1.19 | 39 → 35 | ↑ Besser |
| **NVDA** | 0.93 | 1.24 | +0.31 | 55 → 60 | ↑ Besser |
| **MSFT** | 0.85 | 1.40 | +0.55 | 21 → 23 | ↑ Besser |
| **TSLA** | 0.67 | 0.56 | -0.11 | 60 → 59 | ↓ Schlechter |

## Änderungen v1 → v2

| Bereich | v1 | v2 |
|---------|----|----||
| Kell Primär-MAs | EMA20+EMA50 | **EMA10+EMA20** |
| Trend Template | EMA200 | **SMA50+SMA150+SMA200** |
| 52W-Filter | fehlte | within 25% high / >30% above low |
| Profit-Ziel | ~6% (2R×3%) | **20%** |
| Stop-Referenz | 3% unter EMA20 | **3% unter EMA10** |
| Volumen-Avg | 20 Bars | **50 Bars** |
| VCP Volume Dry-Up | fehlte | **<65% des Avg** |
| RSI Entry-Filter | Pflicht 45–75 | **kein Pflichtfilter** |
| Wedge Drop | close < EMA50 | **close < EMA10 UND EMA20** |
