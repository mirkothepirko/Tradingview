import { z } from "zod";
import { jsonResult } from "./_format.js";
import * as core from "../core/market.js";

export function registerMarketTools(server) {
  server.tool(
    "market_monitor",
    "Daily market health check (Siebenhaar routine): index trend (EMA 10/20 daily+weekly, stage analysis), risk-on vs risk-off sentiment, market breadth (advance/decline, McClellan, % stocks above 5-day MA) and the semiconductor canary. Returns a green/yellow/red traffic light with per-level scores.",
    {
      scan_path: z
        .string()
        .optional()
        .describe(
          "Optional path to today's pattern-scan JSON (adds level 1: watchlist green/red check).",
        ),
    },
    async ({ scan_path } = {}) => {
      try {
        return jsonResult(await core.runMarketMonitor({ scan_path }));
      } catch (err) {
        return jsonResult({ success: false, error: err.message }, true);
      }
    },
  );
}
