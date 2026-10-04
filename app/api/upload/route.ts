import { NextResponse } from "next/server";
import { uploadToIpfs } from "@/lib/ipfs";

export const maxDuration = 30;

const MAX_BYTES = 5 * 1024 * 1024;

/** Forward a user image to pump.fun's IPFS upload and build the metadata. */
export async function POST(req: Request) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "multipart body expected" }, { status: 400 });
  }
  const file = form.get("file");
  const name = String(form.get("name") ?? "").slice(0, 32);
  const symbol = String(form.get("symbol") ?? "").slice(0, 10);
  const description = String(form.get("description") ?? "").slice(0, 280);
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file missing" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "image too large (max 5 MB)" }, { status: 400 });
  }
  if (!name || !symbol) {
    return NextResponse.json({ error: "name/symbol missing" }, { status: 400 });
  }
  try {
    const bytes = Buffer.from(await file.arrayBuffer());
    const { imageUri, metadataUri } = await uploadToIpfs(bytes, {
      name,
      symbol,
      description,
    });
    return NextResponse.json({ imageUri, metadataUri });
  } catch (e) {
    return NextResponse.json(
      { error: `upload failed: ${(e as Error).message}` },
      { status: 502 }
    );
  }
}
