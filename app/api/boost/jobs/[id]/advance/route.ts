import { NextResponse } from "next/server";
import { advanceJob, getJob, publicJob } from "@/lib/jobs";
import { connection } from "@/lib/rpc";
import { notifyWebhook, notifyTelegram } from "@/lib/notify";

export const maxDuration = 60;

/** Poke a job one step forward (throttled server-side). Anyone may call it —
 * browsers, bots, API clients, and the cron tick all drive the same engine. */
export async function POST(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const job = await getJob(params.id);
  if (!job) return NextResponse.json({ error: "job not found" }, { status: 404 });
  const event = await advanceJob(connection(), job, { throttle: true });
  if (event) {
    await notifyWebhook(job, event);
    await notifyTelegram(job);
  }
  return NextResponse.json(publicJob(job));
}
