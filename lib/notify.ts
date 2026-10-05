/** Webhook + Telegram notifications on job state transitions. */

import { createHmac } from "crypto";
import { updateJob, type JobEvent, type SwarmJob } from "./jobs";

/** HMAC-signed POST to the order's callbackUrl (signed with the API key). */
export async function notifyWebhook(job: SwarmJob, event: JobEvent): Promise<void> {
  if (!job.callbackUrl) return;
  const body = JSON.stringify({
    orderId: job.id,
    event,
    state: job.state,
    mint: job.mint,
    customer: job.customer,
    done: job.done,
    target: job.target,
    paymentSig: job.paymentSig ?? null,
    error: job.error ?? null,
  });
  const secret = webhookSecret(job.apiKeyName);
  const sig = createHmac("sha256", secret).update(body).digest("hex");
  try {
    await fetch(job.callbackUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-moonlauncher-signature": sig,
      },
      body,
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    /* webhook delivery is best-effort */
  }
}

function webhookSecret(keyName?: string): string {
  const keys = process.env.SWARM_API_KEYS ?? "";
  for (const pair of keys.split(",")) {
    const [key, name] = pair.split(":");
    if (name && name.trim() === keyName) return key.trim();
  }
  return process.env.WEBHOOK_FALLBACK_SECRET ?? "moonlauncher";
}

/** Post/edit the group's progress message. */
export async function notifyTelegram(job: SwarmJob): Promise<void> {
  if (!job.tg) return;
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;
  const text = progressText(job);
  try {
    if (job.tg.messageId) {
      await tg(token, "editMessageText", {
        chat_id: job.tg.chatId,
        message_id: job.tg.messageId,
        text,
      });
    } else {
      const res = await tg(token, "sendMessage", {
        chat_id: job.tg.chatId,
        text,
      });
      const msgId = (res as { result?: { message_id?: number } })?.result?.message_id;
      if (msgId) {
        job.tg.messageId = msgId;
        await updateJob(job);
      }
    }
  } catch {
    /* telegram delivery is best-effort */
  }
}

export function progressText(job: SwarmJob): string {
  const coin = `https://pump.fun/coin/${job.mint}`;
  switch (job.state) {
    case "awaiting_payment":
      return `Boost order ${job.id}\nWaiting for payment.\nSend exactly ${(Number(job.depositLamports) / 1e9).toFixed(3)} SOL with memo ${job.memo}`;
    case "buying":
      return `Boost order ${job.id}\nBuying: ${job.done}/${job.target} wallets\n${coin}`;
    case "consolidating":
      return `Boost order ${job.id}\nAll buys done. Moving tokens to the recipient…\n${coin}`;
    case "done":
      return `Boost order ${job.id}\nDone. All tokens moved to the recipient.\n${coin}`;
    case "expired":
      return `Boost order ${job.id}\nExpired — no payment in 30 minutes.`;
    default:
      return `Boost order ${job.id}\nState: ${job.state}`;
  }
}

async function tg(
  token: string,
  method: string,
  payload: Record<string, unknown>
): Promise<unknown> {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15_000),
  });
  return res.json();
}
