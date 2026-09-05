import sharp from "sharp";
import { createServiceClient } from "./supabase/server";

/** How long a photo hash is checked against on future uploads. Long enough to catch
 *  someone reusing the same job photos across two free-bid signups within a season;
 *  short enough that a legitimate repeat customer years later isn't falsely flagged. */
export const PHASH_LOOKBACK_DAYS = 30;

/**
 * A resaved-identical copy of the same image scored a Hamming distance of ~6 in
 * testing (resize/recompress noise), while a genuinely different photo scored ~26.
 * 10 gives headroom above the resave-noise floor without drifting into false-positive
 * territory on unrelated photos.
 */
export const NEAR_DUPLICATE_THRESHOLD = 10;

/** dHash (difference hash): resize to 9x8 grayscale, compare each pixel to its right
 *  neighbor, pack the 64 comparison bits into a hex string. Robust to resizing and
 *  recompression (which is exactly what client-side upload compression does to every
 *  photo) while still very different for genuinely different images. */
export async function computeImagePhash(buffer: Buffer): Promise<string> {
  const { data } = await sharp(buffer)
    .resize(9, 8, { fit: "fill" })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  let bits = "";
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const left = data[row * 9 + col]!;
      const right = data[row * 9 + col + 1]!;
      bits += left > right ? "1" : "0";
    }
  }

  // Pack the 64-bit binary string into hex, 4 bits at a time.
  let hex = "";
  for (let i = 0; i < bits.length; i += 4) {
    hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
  }
  return hex;
}

export async function computeImagePhashFromUrl(url: string): Promise<string> {
  const res = await fetch(url);
  const buffer = Buffer.from(await res.arrayBuffer());
  return computeImagePhash(buffer);
}

export function hammingDistance(hexA: string, hexB: string): number {
  if (hexA.length !== hexB.length) return Number.MAX_SAFE_INTEGER;
  let distance = 0;
  for (let i = 0; i < hexA.length; i++) {
    let xor = parseInt(hexA[i]!, 16) ^ parseInt(hexB[i]!, 16);
    while (xor > 0) {
      distance += xor & 1;
      xor >>= 1;
    }
  }
  return distance;
}

/** Checks a photo's hash against every hash recorded by a DIFFERENT company in the
 *  lookback window. Scoped to "different company" rather than "different phone" since
 *  the whole point is catching the same job photos reused under a different signup. */
export async function findNearDuplicatePhoto(phash: string, excludeCompanyId: string): Promise<boolean> {
  const supabase = createServiceClient();
  const since = new Date(Date.now() - PHASH_LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("photo_hashes")
    .select("phash, company_id")
    .neq("company_id", excludeCompanyId)
    .gte("created_at", since);

  if (error || !data) return false;

  return data.some((row) => hammingDistance(phash, row.phash) <= NEAR_DUPLICATE_THRESHOLD);
}

export async function recordPhotoHash(phash: string, quoteId: string, companyId: string): Promise<void> {
  const supabase = createServiceClient();
  await supabase.from("photo_hashes").insert({ phash, quote_id: quoteId, company_id: companyId });
}
