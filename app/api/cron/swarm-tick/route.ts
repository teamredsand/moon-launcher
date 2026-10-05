import { NextResponse } from "next/server";
import { activeJobs, advanceJob } from "@/lib/jobs";
import { connection } from "@/lib/rpc";
import { notifyTelegram, notifyWebhook } from "@/lib/notify";

export const maxDuration = 300;

/** Cron tick: advance every active job one step. Called every 5 minutes by
 * the GitHub Actions scheduler (Authorization: Bearer CRON_SECRET). */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const conn = connection();
  const jobs = await activeJobs();
  const events: Record<string, string> = {};
  for (const job of jobs) {
    const event = await advanceJob(conn, job);
    if (event) {
      events[job.id] = event;
      await notifyWebhook(job, event);
      await notifyTelegram(job);
    }
  }
  return NextResponse.json({ advanced: jobs.length, events });
}
