import { NextResponse } from "next/server";
import { getJob, publicJob } from "@/lib/jobs";
import { checkApiKey } from "@/lib/api-auth";

export const maxDuration = 30;

/** GET /v1/swarm/orders/:id → order status (x-api-key). */
export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  const auth = await checkApiKey(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }
  const job = await getJob(params.id);
  if (!job) return NextResponse.json({ error: "order not found" }, { status: 404 });
  return NextResponse.json(publicJob(job));
}
