#!/usr/bin/env bash
# Swarm tick driver: pokes the job engine every 60 s. Runs from this box as a
# background loop (the GH Actions workflow is the always-on backup).
# Usage: nohup ./scripts/swarm-tick-loop.sh >> /tmp/redsand/swarm-tick.log 2>&1 &
set -u
URL="${TICK_URL:-https://moon-launcher-three.vercel.app/api/cron/swarm-tick}"
SECRET="${CRON_SECRET:?set CRON_SECRET}"
while true; do
  out=$(curl -sf -m 50 -H "Authorization: Bearer ${SECRET}" "$URL" 2>&1) \
    && echo "$(date -u +%FT%TZ) $out" \
    || echo "$(date -u +%FT%TZ) tick failed: $out"
  sleep 60
done
