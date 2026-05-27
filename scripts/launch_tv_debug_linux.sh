#!/bin/bash
# Launch TradingView Desktop on Linux with Chrome DevTools Protocol enabled
# Usage: ./scripts/launch_tv_debug_linux.sh [port]

PORT="${1:-9222}"

# If launched from an Electron host (Claude Code / VSCode integrated terminal),
# ELECTRON_RUN_AS_NODE=1 is inherited and forces TradingView into Node mode, where
# --remote-debugging-port is rejected as a "bad option". Clear it so CDP can start.
unset ELECTRON_RUN_AS_NODE ELECTRON_NO_ATTACH_CONSOLE

# Auto-detect TradingView install location
APP=""
LOCATIONS=(
  "/opt/TradingView/tradingview"
  "/opt/TradingView/TradingView"
  "$HOME/.local/share/TradingView/TradingView"
  "/usr/bin/tradingview"
  "/usr/local/bin/tradingview"
  "/snap/tradingview/current/tradingview"
  "/var/lib/flatpak/app/com.tradingview.TradingView/current/active/files/bin/tradingview"
  "$HOME/.local/share/flatpak/app/com.tradingview.TradingView/current/active/files/bin/tradingview"
)

for loc in "${LOCATIONS[@]}"; do
  if [ -f "$loc" ] && [ -x "$loc" ]; then
    APP="$loc"
    break
  fi
done

# Fallback: which / whereis
if [ -z "$APP" ]; then
  APP=$(which tradingview 2>/dev/null || which TradingView 2>/dev/null)
fi

# Fallback: find in common dirs
if [ -z "$APP" ]; then
  APP=$(find /opt /usr/local /snap "$HOME/.local" -name "tradingview" -o -name "TradingView" -type f -executable 2>/dev/null | head -1)
fi

if [ -z "$APP" ] || [ ! -f "$APP" ]; then
  echo "Error: TradingView not found."
  echo "Checked: /opt/TradingView, ~/.local/share/TradingView, snap, flatpak, PATH"
  echo ""
  echo "If installed elsewhere, run manually:"
  echo "  /path/to/tradingview --remote-debugging-port=$PORT"
  exit 1
fi

# Kill any existing TradingView. Match the resolved binary path ("$APP"), NOT the
# word "TradingView" — otherwise pkill -f also matches this script's own shell when
# it runs from a directory named ".../Tradingview" (which kills the script itself).
pkill -f "$APP" 2>/dev/null
sleep 1

# Remove stale single-instance locks left by the killed process; otherwise the
# fresh launch can silently fail to start (locks point at the dead PID).
rm -f "$HOME/.config/TradingView/SingletonLock" \
      "$HOME/.config/TradingView/SingletonCookie" \
      "$HOME/.config/TradingView/SingletonSocket" 2>/dev/null

echo "Found TradingView at: $APP"
echo "Launching with --remote-debugging-port=$PORT ..."
"$APP" --remote-debugging-port=$PORT &
TV_PID=$!
echo "PID: $TV_PID"

# Wait for CDP to be ready
echo "Waiting for CDP..."
for i in $(seq 1 15); do
  if curl -s "http://localhost:$PORT/json/version" > /dev/null 2>&1; then
    echo "CDP ready at http://localhost:$PORT"
    curl -s "http://localhost:$PORT/json/version" | python3 -m json.tool 2>/dev/null || curl -s "http://localhost:$PORT/json/version"
    exit 0
  fi
  sleep 1
done

echo "Warning: CDP not responding after 15s. TradingView may still be loading."
