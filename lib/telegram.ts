/** Telegram group bot: /swarm wizard, /status, /price. Stateless handler —
 * wizard state lives in the KV store keyed by chat id. Progress posts happen
 * through lib/notify when the tick/advance endpoints move a job. */

import { PublicKey } from "@solana/web3.js";
import { createJob } from "./jobs";
import { swarmQuote } from "./pricing";
import { connection, treasuryPubkey } from "./rpc";
import { curveForMint } from "./pdas";
import { storeDel, storeGet, storeSet } from "./store";
import { getJob, publicJob } from "./jobs";
import { progressText } from "./notify";

interface TgMessage {
  message_id: number;
  chat: { id: number | string };
  text?: string;
}
interface TgCallback {
  id: string;
  message?: TgMessage;
  data?: string;
}
export interface TgUpdate {
  message?: TgMessage;
  callback_query?: TgCallback;
}

interface Wizard {
  step: "mint" | "customer" | "done";
  mint?: string;
  customer?: string;
  perBuy?: number;
  buys?: number;
}

const wizKey = (chatId: number | string) => `tg:wiz:${chatId}`;
const PERBUYS = [0.0005, 0.001, 0.005, 0.01];
const BUYCOUNTS = [50, 100, 250, 500, 1000];

export async function handleUpdate(update: TgUpdate): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;

  if (update.callback_query) {
    await handleCallback(token, update.callback_query);
    return;
  }
  const msg = update.message;
  if (!msg?.text) return;
  const chatId = msg.chat.id;
  const text = msg.text.trim();

  if (text.startsWith("/swarm")) {
    const parts = text.split(/\s+/).slice(1);
    const wiz: Wizard = { step: "mint" };
    if (parts[0]) {
      wiz.mint = parts[0];
      wiz.step = "customer";
    }
    await storeSet(wizKey(chatId), wiz, 900);
    await tg(token, "sendMessage", {
      chat_id: chatId,
      text:
        wiz.step === "mint"
          ? "Send the pump.fun coin address."
          : "Coin set. Now send the wallet address that receives the tokens.",
    });
    return;
  }

  if (text.startsWith("/price")) {
    const parts = text.split(/\s+/).slice(1);
    const q = swarmQuote(Number(parts[0] ?? 0), Number(parts[1] ?? 0));
    await tg(token, "sendMessage", {
      chat_id: chatId,
      text: q.valid
        ? `Price: ${q.depositSol.toFixed(3)} SOL\nInto the coin: ${q.buySol.toFixed(3)}\nNetwork costs: ${q.gasSol.toFixed(3)}\nService fee: ${q.feeSol.toFixed(3)}`
        : `Invalid: ${q.reason}`,
    });
    return;
  }

  if (text.startsWith("/status")) {
    const id = text.split(/\s+/)[1];
    const job = id ? await getJob(id) : null;
    await tg(token, "sendMessage", {
      chat_id: chatId,
      text: job ? progressText(job) : "Order not found. Usage: /status <orderId>",
    });
    return;
  }

  // wizard free-text steps
  const wiz = await storeGet<Wizard>(wizKey(chatId));
  if (!wiz) return;
  if (wiz.step === "mint") {
    try {
      const mint = new PublicKey(text);
      const info = await connection().getAccountInfo(curveForMint(mint));
      if (!info) {
        await tg(token, "sendMessage", {
          chat_id: chatId,
          text: "No bonding curve found. The coin must still trade on pump.fun. Send another address.",
        });
        return;
      }
      wiz.mint = mint.toBase58();
      wiz.step = "customer";
      await storeSet(wizKey(chatId), wiz, 900);
      await tg(token, "sendMessage", {
        chat_id: chatId,
        text: "Coin found. Now send the wallet address that receives the tokens.",
      });
    } catch {
      await tg(token, "sendMessage", {
        chat_id: chatId,
        text: "That is not a valid address. Send the pump.fun coin address.",
      });
    }
    return;
  }
  if (wiz.step === "customer") {
    try {
      wiz.customer = new PublicKey(text).toBase58();
      wiz.step = "done";
      await storeSet(wizKey(chatId), wiz, 900);
      await tg(token, "sendMessage", {
        chat_id: chatId,
        text: "Pick the size of each buy (SOL):",
        reply_markup: {
          inline_keyboard: [
            PERBUYS.map((v) => ({ text: String(v), callback_data: `pb:${v}` })),
          ],
        },
      });
    } catch {
      await tg(token, "sendMessage", {
        chat_id: chatId,
        text: "That is not a valid wallet address. Try again.",
      });
    }
  }
}

async function handleCallback(token: string, cb: TgCallback): Promise<void> {
  const msg = cb.message;
  if (!msg || !cb.data) return;
  const chatId = msg.chat.id;
  const wiz = await storeGet<Wizard>(wizKey(chatId));
  if (!wiz || wiz.step !== "done") return;

  if (cb.data.startsWith("pb:")) {
    wiz.perBuy = Number(cb.data.slice(3));
    await storeSet(wizKey(chatId), wiz, 900);
    await tg(token, "editMessageText", {
      chat_id: chatId,
      message_id: msg.message_id,
      text: `Buy size: ${wiz.perBuy} SOL. Now pick the number of wallets:`,
      reply_markup: {
        inline_keyboard: [
          BUYCOUNTS.slice(0, 3).map((v) => ({ text: String(v), callback_data: `nb:${v}` })),
          BUYCOUNTS.slice(3).map((v) => ({ text: String(v), callback_data: `nb:${v}` })),
        ],
      },
    });
    return;
  }

  if (cb.data.startsWith("nb:") && wiz.perBuy && wiz.mint && wiz.customer) {
    wiz.buys = Number(cb.data.slice(3));
    const q = swarmQuote(wiz.perBuy, wiz.buys);
    if (!q.valid) {
      await tg(token, "editMessageText", {
        chat_id: chatId,
        message_id: msg.message_id,
        text: `Invalid: ${q.reason}. Start again with /swarm.`,
      });
      await storeDel(wizKey(chatId));
      return;
    }
    const job = await createJob({
      mint: wiz.mint,
      customer: wiz.customer,
      perBuySol: wiz.perBuy,
      buys: wiz.buys,
      tg: { chatId },
    });
    await storeDel(wizKey(chatId));
    const deposit = publicJob(job).deposit;
    await tg(token, "editMessageText", {
      chat_id: chatId,
      message_id: msg.message_id,
      text:
        `Boost order ${job.id} created.\n\n` +
        `Pay exactly ${(Number(deposit.lamports) / 1e9).toFixed(3)} SOL to:\n` +
        `${deposit.address}\n\n` +
        `With memo: ${deposit.memo}\n\n` +
        `Into the coin: ${q.buySol.toFixed(3)} SOL. Network: ${q.gasSol.toFixed(3)}. Fee: ${q.feeSol.toFixed(3)}.\n` +
        `Payment expires in 30 minutes. Progress posts here.`,
    });
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

export { treasuryPubkey };
