#!/usr/bin/env bash
# Start TRACEPOINT on the lab VM and open a temporary public HTTPS address.
set -euo pipefail
export PATH="/home/admin2/opt/node/bin:${PATH}"
cd /home/admin2/tracepoint

if ! curl -fsS http://127.0.0.1:43123/api/health >/dev/null 2>&1; then
  nohup npx next dev --hostname 0.0.0.0 --port 43123 > /home/admin2/tracepoint/dev-server.log 2>&1 &
  echo $! > /tmp/tracepoint.pid
fi

if ! pgrep -f "cloudflared tunnel --url http://127.0.0.1:43123" >/dev/null 2>&1; then
  nohup /home/admin2/bin/cloudflared tunnel --url http://127.0.0.1:43123 --no-autoupdate > /home/admin2/tracepoint/tunnel.log 2>&1 &
  echo $! > /tmp/tracepoint-tunnel.pid
fi

for _ in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15; do
  if url=$(grep -oE 'https://[a-zA-Z0-9.-]+\.trycloudflare\.com' /home/admin2/tracepoint/tunnel.log | head -1); then
    if [ -n "${url}" ]; then
      echo "${url}"
      exit 0
    fi
  fi
  sleep 1
done
echo "App is starting. Check /home/admin2/tracepoint/tunnel.log" >&2
exit 1
