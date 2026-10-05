#!/usr/bin/env bash
# Register the Telegram webhook after setting TELEGRAM_BOT_TOKEN + TG_WEBHOOK_SECRET.
# Usage: TG_TOKEN=<botfather-token> TG_SECRET=<secret> ./scripts/tg-set-webhook.sh
set -euo pipefail
URL="${SITE_URL:-https://moon-launcher-three.vercel.app}/api/tg/webhook"
curl -sf "https://api.telegram.org/bot${TG_TOKEN}/setWebhook" \
  -d "url=${URL}" \
  -d "secret_token=${TG_SECRET}" | python3 -m json.tool
