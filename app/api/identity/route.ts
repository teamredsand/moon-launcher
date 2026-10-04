import { NextResponse } from "next/server";
import { generateIdentity, generateImage } from "@/lib/minimax";
import { uploadToIpfs } from "@/lib/ipfs";

export const maxDuration = 60;

const HITS = new Map<string, { n: number; t: number }>();
const LIMIT = 5;
const WINDOW_MS = 60 * 60 * 1000;

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const h = HITS.get(ip);
  if (!h || now - h.t > WINDOW_MS) {
    HITS.set(ip, { n: 1, t: now });
    return false;
  }
  h.n += 1;
  return h.n > LIMIT;
}

export async function POST(req: Request) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "local";
  if (rateLimited(ip)) {
    return NextResponse.json(
      { error: "rate limited — try again in an hour" },
      { status: 429 }
    );
  }
  let theme = "a chaotic swarm of bees taking over the internet";
  try {
    const body = (await req.json()) as { theme?: string };
    if (body.theme && body.theme.length >= 3) theme = body.theme.slice(0, 200);
  } catch {
    /* default theme */
  }
  try {
    const identity = await generateIdentity(theme);
    const { bytes, url } = await generateImage(identity.image_prompt);
    const { imageUri, metadataUri } = await uploadToIpfs(bytes, identity);
    return NextResponse.json({ identity, imageUri, metadataUri, previewUri: url });
  } catch (e) {
    return NextResponse.json(
      { error: `identity generation failed: ${(e as Error).message}` },
      { status: 502 }
    );
  }
}
