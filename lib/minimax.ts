/** MiniMax coin-identity generation (chat model + image-01). */

const IDENTITY_PROMPT = `You invent pump.fun meme-coin identities. Reply with ONLY a JSON object (no markdown fences) with keys:
- "name": coin name, max 16 chars, punchy, lowercase-ish like real pump.fun coins
- "symbol": ticker, 3-6 uppercase letters
- "description": one short meme-y sentence, max 90 chars, like "king of laptop"
- "image_prompt": detailed prompt for an image model: a square meme-coin logo/mascot, bold, clean, centered, simple flat background, no text in image
Theme: {theme}`;

export interface CoinIdentity {
  name: string;
  symbol: string;
  description: string;
  image_prompt: string;
}

export function sanitizeIdentity(raw: Partial<CoinIdentity>): CoinIdentity {
  const name = String(raw.name ?? "moonshot")
    .replace(/[^\w \-.'!]/g, "")
    .trim()
    .slice(0, 16) || "moonshot";
  const symbol = String(raw.symbol ?? "MOON")
    .replace(/[^A-Za-z0-9]/g, "")
    .toUpperCase()
    .slice(0, 6) || "MOON";
  const description = String(raw.description ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 90) || "straight to the moon";
  const image_prompt = String(raw.image_prompt ?? name).slice(0, 400);
  return { name, symbol, description, image_prompt };
}

async function minimaxPost(
  path: string,
  payload: unknown,
  timeoutMs = 120_000
): Promise<unknown> {
  const key = process.env.MINIMAX_API_KEY;
  const base = process.env.MINIMAX_BASE_URL ?? "https://api.minimax.io/v1";
  if (!key) throw new Error("MINIMAX_API_KEY not configured");
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    throw new Error(`minimax ${path} -> ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

/** Full identity (name/symbol/description/image_prompt) for a theme. */
export async function generateIdentity(theme: string): Promise<CoinIdentity> {
  const resp = (await minimaxPost("/chat/completions", {
    model: "MiniMax-M3",
    messages: [
      { role: "user", content: IDENTITY_PROMPT.replace("{theme}", theme) },
    ],
    temperature: 1.0,
  })) as { choices: { message: { content: string } }[] };
  const content = resp.choices?.[0]?.message?.content ?? "";
  const m = content.match(/\{[\s\S]*\}/);
  if (!m) throw new Error(`no JSON in identity reply: ${content.slice(0, 200)}`);
  return sanitizeIdentity(JSON.parse(m[0]) as Partial<CoinIdentity>);
}

/** Render the image; returns the raw JPEG bytes plus the source URL (valid
 * ~24h — good for instant previews, while the IPFS URI is what launches). */
export async function generateImage(
  prompt: string
): Promise<{ bytes: Buffer; url: string }> {
  const resp = (await minimaxPost(
    "/image_generation",
    {
      model: "image-01",
      prompt,
      response_format: "url",
      aspect_ratio: "1:1",
    },
    180_000
  )) as { base_resp?: { status_code: number; status_msg: string } } & {
    data?: { image_urls?: string[] };
  };
  if ((resp.base_resp?.status_code ?? 0) !== 0) {
    throw new Error(`image_generation failed: ${resp.base_resp?.status_msg}`);
  }
  const url = resp.data?.image_urls?.[0];
  if (!url) throw new Error("image_generation returned no url");
  const img = await fetch(url, { signal: AbortSignal.timeout(120_000) });
  if (!img.ok) throw new Error(`image download ${img.status}`);
  const buf = Buffer.from(await img.arrayBuffer());
  if (buf.length < 1000 || buf[0] !== 0xff || buf[1] !== 0xd8 || buf[2] !== 0xff) {
    throw new Error(`suspicious image (${buf.length} bytes)`);
  }
  return { bytes: buf, url };
}
