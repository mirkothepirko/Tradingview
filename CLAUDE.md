# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

This repo **is** the TradingView MCP server (a fork of tradesdontlie/tradingview-mcp via LewisWJackson, extended with a Kell + Minervini VCP strategy layer). It exposes ~82 tools that read and control a live **TradingView Desktop** chart over the Chrome DevTools Protocol (CDP). The same logic is reachable two ways: as MCP tools (`src/server.js`) and as a `tv` CLI (`src/cli/`).

## Commands

```bash
npm start                 # run the MCP server (stdio transport)
npm run tv -- <command>   # run the CLI without installing; e.g. npm run tv -- status
npm link                  # install the `tv` CLI globally (one time), then: tv brief

# Tests (node:test, no framework)
npm test                  # e2e + pine_analyze (the default suite)
npm run test:unit         # offline unit tests only (pine_analyze + cli) — no TradingView needed
npm run test:e2e          # full e2e — REQUIRES TradingView running with CDP on :9222
npm run test:all          # everything
node --test tests/e2e.test.js --test-name-pattern="chart_set_symbol"   # run a single test by name
```

There is **no build step** (plain ESM, `"type": "module"`) and **no linter configured**. Node 18+.

**E2E tests and most tools require a live target:** TradingView Desktop must be running with `--remote-debugging-port=9222` and a chart open. Launch it with the platform scripts in `scripts/` (`launch_tv_debug_linux.sh`, `launch_tv_debug_mac.sh`, `launch_tv_debug.bat`, or `launch_tv_debug_win.ps1` for the Microsoft-Store/MSIX install) or the `tv_launch` tool. The unit tests (`test:unit`) are the only ones that run without it.

## Architecture

Every capability flows through three layers. When adding or changing a feature, touch the layer that owns the concern — don't put CDP logic in a tool file or formatting in a core file.

```
src/connection.js   CDP transport. Singleton client, retry/backoff, evaluate()/evaluateAsync().
                    Holds KNOWN_PATHS — the verified window.TradingViewApi.* paths everything
                    builds JS expressions against. New API path? Add it here, not inline.
        │
src/core/*.js       Pure logic. Each module builds JS-as-strings, runs them via evaluate(),
                    and returns plain { success, ... } objects. NO MCP/CLI coupling here.
                    This is the layer reused by both transports and re-exported as a library
                    via src/core/index.js (package export "./core").
        │
   ┌────┴─────────────────────────┐
src/tools/*.js                src/cli/commands/*.js
MCP wrappers. Zod schema +    CLI wrappers. register(name, {options, handler}) in router.js.
server.tool(). Wrap every     Handlers call the SAME core fn and return the object;
core call in try/catch and    router.js prints it as JSON.
return jsonResult(...).
```

**The two transports are thin adapters over `core/`.** `src/server.js` calls the `registerXxxTools(server)` function from each `src/tools/*.js`. `src/cli/index.js` imports each `src/cli/commands/*.js` for its side-effect `register()` calls, then runs `router.js` (a zero-dependency `parseArgs` router; CLI exit codes: `0` ok, `1` error, `2` connection failure).

### Conventions that matter

- **Tool handlers never throw.** Always `try { return jsonResult(await core.fn(...)); } catch (err) { return jsonResult({ success: false, error: err.message }, true); }`. The `_format.js` `jsonResult(obj, isError)` helper is the only way tools build a response.
- **Core returns data, tools format it.** A core function returns a plain object; only the tool/CLI layer serializes.
- **CDP values are often `WatchedValue` objects** — call `.value()` to unwrap (see the `wv()` helper in `tests/e2e.test.js` and the `_activeChartWidgetWV.value()` pattern throughout `core/`).
- **String-interpolated JS must escape user input** (e.g. `symbol.replace(/'/g, "\\'")` in `core/chart.js`). Everything runs as `Runtime.evaluate` in the page.
- **After actions that mutate the chart, wait for readiness** via `src/wait.js` (`waitForChartReady`) rather than a fixed sleep, where possible.

### Adding a new tool (the full path)

1. Add the logic to the relevant `src/core/<group>.js` (or a new module + re-export in `core/index.js`).
2. Add the MCP tool in `src/tools/<group>.js` with a Zod schema, wired through `jsonResult`.
3. If the group is new, register it in `src/server.js` (`registerXxxTools(server)`).
4. Add the CLI command in `src/cli/commands/<group>.js` via `register(...)` and import it in `src/cli/index.js`.
5. Add coverage in `tests/e2e.test.js` (live) or `tests/pine_analyze.test.js` / `tests/cli.test.js` (offline).

## Pine Script / UI automation gotchas

- **German UI support is load-bearing.** TradingView localizes button labels, and the Pine save/compile flow matches both English and German text — e.g. `core/pine.js` tests `/^add to chart$|dem chart hinzuf/i` and `/^update on chart$|im chart aktualisieren/i`. Preserve both languages when editing button-matching regexes.
- **`chart_manage_indicator` needs full indicator names** ("Relative Strength Index", not "RSI"; "Moving Average Exponential", not "EMA").
- Pine graphics (lines/labels/tables/boxes) are only readable when the indicator is **visible** on the chart. The read path is `study._graphics._primitivesCollection.dwglines.get('lines').get(false)._primitivesDataById`.
- `pine_push.js` / `pine_pull.js` sync `scripts/current.pine` to/from the live editor by reaching into the Monaco editor's React fiber — fragile against TradingView frontend changes.

## The Kell + Minervini VCP strategy layer (this fork)

- `scripts/kell_vcp_strategy.pine` (indicator) and `scripts/kell_vcp_strategy_backtest.pine` (strategy) implement Oliver Kell's 6-phase Cycle of Price Action + Minervini VCP. `scripts/backtest_mag7.js` drives Mag7 backtests; results live in `STRATEGY_INSIGHTS.md`, `RESEARCH.md`, and `results/`.
- **`rules.json`** is the config the morning-brief workflow reads (`watchlist`, `default_timeframe`, `strategy`, `indicators`, `cycle_phases`, `entry_rules`, `market_conditions`). `rules.example.json` is the template; copy it to `rules.json`. `core/morning.js` searches for it in the project root, then `~/.tradingview-mcp/rules.json`.
- **Morning brief flow:** `morning_brief` scans the watchlist and returns structured indicator data → Claude applies `rules.json` criteria → `session_save` writes `~/.tradingview-mcp/sessions/YYYY-MM-DD.json` → `session_get` reads today's (or yesterday's).
- **Automated daily scan (cross-platform):** `scripts/morning_scan.sh` (Linux/macOS, cron) and `scripts/morning_scan.ps1` (Windows, Task Scheduler) run the same pipeline: CDP-up check (self-heal + Telegram warn on failure) → **`scripts/wait_for_chart.js` warm-up** (polls `healthCheck()` until `api_available` + `chart_symbol` are set, default 60 s; Telegram warn on timeout — a partial briefing is **not** acceptable) → `watchlist sync` → `patterns -s watchlist` → `scripts/scan_summary.js` (the shared Node formatter — keep both runners using it, no Python) → optional Telegram via `scripts/telegram_send.js` (token/chat-id from gitignored `.env`). Scheduling/autostart installers: `scripts/install_autostart_linux.sh`, `scripts/install_schedule_win.ps1`. Windows specifics in `WINDOWS_SETUP.md`. Cloud complement: `cloud-routine/README.md` documents an Anthropic-side **Remote Routine** (`morning-market-overview`) that fires daily at 06:30 with a Telegram „Marktwetter" — runs independently of the local pipeline so a briefing exists even when the laptop is off. The two briefings are intentionally decoupled (no shared state).
- `skills/` (kell-vcp, chart-analysis, multi-symbol-scan, pine-develop, replay-practice, strategy-report) and `agents/performance-analyst.md` are workflow definitions layered on top of the tools.
- **Pattern detection** (`src/core/patterns.js`): `detectPatterns(bars, opts)` is a pure, offline-testable function that classifies **High Tight Flag** and **Power Play** from daily OHLCV; `detectOnChart(...)` is the chart wrapper (current symbol / list / `"watchlist"`) mirroring `morning.js`'s scan-and-restore loop. It reuses `loadRules` (exported from `morning.js`) and keeps the same MA/volume/pivot constants as the pine strategy (EMA 50, SMA 50, vol dry-up 0.65, breakout 1.4×, pivot = highest-high-20). `pp_base_min_days` is 10 (was 15 — relaxed 2026-05-29 so faster Power Play bases like INTC's 12-day base aren't missed).
- **Strategy docs**: `HTF/README.md` and `Powerplay/README.md` are reading-only workspaces per strategy (criteria, score components, trading rules, briefing legend). Detector, tests, and CLI stay shared in `src/`, `tests/`, `scripts/`; do not duplicate logic into the strategy folders.

> **Security note:** `scalper-run.js` is a standalone experiment that places **live orders on BitGet** using HMAC-signed API keys read from a local `.env` (gitignored). It is unrelated to the MCP server. Treat with care; never commit the `.env`.

## Tool-selection reference (when operating the running tools)

Always-on context rules to avoid bloat: pass `summary: true` to `data_get_ohlcv`; pass `study_filter` to the `data_get_pine_*` tools when you know the indicator; avoid `verbose: true` and `pine_get_source` on complex scripts (can be 200KB+); call `chart_get_state` once and reuse the entity IDs.

| Goal | Tools (in order) |
|------|------------------|
| What's on my chart | `chart_get_state` → `data_get_study_values` → `quote_get` |
| Custom indicator drawings | `data_get_pine_lines` / `_labels` / `_tables` / `_boxes` (with `study_filter`) |
| Price data | `data_get_ohlcv` (`summary: true`) or `quote_get` |
| Change the chart | `chart_set_symbol` / `chart_set_timeframe` / `chart_set_type` / `chart_manage_indicator` |
| Pine development | `pine_set_source` → `pine_smart_compile` → `pine_get_errors` → `pine_get_console` → `pine_save` |
| Replay practice | `replay_start` → `replay_step` / `replay_autoplay` → `replay_trade` → `replay_status` → `replay_stop` |
| Morning brief | `morning_brief` → (apply `rules.json`) → `session_save` |
| Daily breakout patterns (HTF / Power Play) | `patterns_detect` (no args = current symbol; `symbols:[...]`; or `symbols:"watchlist"`) |
| Multi-symbol screen | `batch_run` with `symbols: [...]` |
| Draw / alerts | `draw_shape`, `draw_list`, `draw_remove_one`; `alert_create` / `alert_list` / `alert_delete` |
| Connection | `tv_launch`, `tv_health_check` |
