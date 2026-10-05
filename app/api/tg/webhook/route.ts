import { NextResponse } from "next/server";
import { handleUpdate, type TgUpdate } from "@/lib/telegram";

export const maxDuration = 60;

/** Telegram webhook (register with BotFather token via scripts/tg-set-webhook.sh). */
export async function POST(req: Request) {
  const secret = process.env.TG_WEBHOOK_SECRET;
  if (secret && req.headers.get("x-telegram-bot-api-secret-token") !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const update = (await req.json()) as TgUpdate;
    await handleUpdate(update);
  } catch {
    /* never 500 to telegram — it retries aggressively */
  }
  return NextResponse.json({ ok: true });
}
