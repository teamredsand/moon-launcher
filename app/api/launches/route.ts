import { NextResponse } from "next/server";
import { listLaunches } from "@/lib/launches";

export async function GET() {
  return NextResponse.json({ launches: await listLaunches() });
}
