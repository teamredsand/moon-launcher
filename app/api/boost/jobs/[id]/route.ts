import { NextResponse } from "next/server";
import { getJob, publicJob } from "@/lib/jobs";

export const maxDuration = 30;

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const job = await getJob(params.id);
  if (!job) return NextResponse.json({ error: "job not found" }, { status: 404 });
  return NextResponse.json(publicJob(job));
}
