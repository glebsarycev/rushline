#!/bin/bash
# Double-click to play Rushline: starts a small local web server and opens the game.
cd "$(dirname "$0")" || exit 1
PORT=8080
while lsof -i :"$PORT" >/dev/null 2>&1; do PORT=$((PORT + 1)); done
echo "Rushline is running at http://localhost:$PORT"
echo "Keep this window open while you play. Close it (or press Ctrl+C) to stop."
(sleep 1 && open "http://localhost:$PORT") &
python3 -m http.server "$PORT" --bind 127.0.0.1
