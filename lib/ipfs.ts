/** Host the launch image + metadata on pump.fun's own IPFS endpoint.
 *
 * POST multipart to https://pump.fun/api/ipfs with file + name/symbol/
 * description fields; the endpoint builds the standard metadata JSON and
 * returns its metadataUri — the exact string the pump.fun frontend embeds.
 */

const IPFS_UPLOAD = "https://pump.fun/api/ipfs";

export interface IpfsResult {
  imageUri: string;
  metadataUri: string;
}

export async function uploadToIpfs(
  image: Buffer,
  identity: { name: string; symbol: string; description: string },
  socials?: { website?: string; twitter?: string; telegram?: string }
): Promise<IpfsResult> {
  const boundary =
    "----moonlauncher" + Math.random().toString(16).slice(2, 14);
  const parts: Buffer[] = [];
  const field = (k: string, v: string) => {
    parts.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`
      )
    );
  };
  field("name", identity.name);
  field("symbol", identity.symbol);
  field("description", identity.description);
  if (socials?.website) field("website", socials.website);
  if (socials?.twitter) field("twitter", socials.twitter);
  if (socials?.telegram) field("telegram", socials.telegram);
  field("showName", "true");
  field("createdOn", "https://pump.fun");
  parts.push(
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="image.jpeg"\r\nContent-Type: image/jpeg\r\n\r\n`
    )
  );
  parts.push(image);
  parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));
  const body = Buffer.concat(parts);

  const res = await fetch(IPFS_UPLOAD, {
    method: "POST",
    headers: {
      "Content-Type": `multipart/form-data; boundary=${boundary}`,
      "User-Agent": "Mozilla/5.0",
    },
    body: new Uint8Array(body),
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) {
    throw new Error(`ipfs upload ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  const out = (await res.json()) as {
    metadata?: { image?: string };
    metadataUri?: string;
  };
  if (!out.metadataUri || !out.metadata?.image) {
    throw new Error(`ipfs upload response missing uris: ${JSON.stringify(out).slice(0, 200)}`);
  }
  return { imageUri: out.metadata.image, metadataUri: out.metadataUri };
}

export function isValidMetadataUri(uri: string): boolean {
  return /^https:\/\/ipfs\.io\/ipfs\/[A-Za-z0-9]+$/.test(uri);
}
