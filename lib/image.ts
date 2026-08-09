"use client";

/**
 * Client-side image compression before upload. Job-site wifi/cellular is often slow or
 * spotty, and phone cameras routinely produce 3-8MB photos — compressing to a reasonable
 * max dimension + JPEG quality before we ever hit the network makes uploads dramatically
 * faster and more likely to survive a flaky connection. Falls back to the original file
 * on any failure — compression is a nice-to-have, never something that should block a quote.
 */
export async function compressImage(
  file: File,
  opts: { maxDimension?: number; quality?: number; skipBelowBytes?: number } = {}
): Promise<File> {
  const maxDimension = opts.maxDimension ?? 1600;
  const quality = opts.quality ?? 0.82;
  const skipBelowBytes = opts.skipBelowBytes ?? 400_000;

  if (!file.type.startsWith("image/") || file.type === "image/gif" || file.type === "image/svg+xml") {
    return file;
  }
  if (file.size <= skipBelowBytes) {
    return file;
  }

  try {
    const dataUrl = await readFileAsDataUrl(file);
    const img = await loadImage(dataUrl);

    let { width, height } = img;
    if (width > maxDimension || height > maxDimension) {
      const scale = maxDimension / Math.max(width, height);
      width = Math.round(width * scale);
      height = Math.round(height * scale);
    }

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(img, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    if (!blob || blob.size >= file.size) return file; // compression didn't actually help — keep the original

    const newName = file.name.replace(/\.[^./]+$/, "") + ".jpg";
    return new File([blob], newName, { type: "image/jpeg", lastModified: Date.now() });
  } catch {
    return file;
  }
}

/** Compresses a batch of files, reporting progress via onProgress(doneCount, total). */
export async function compressImages(
  files: File[],
  opts: { maxDimension?: number; quality?: number; onProgress?: (done: number, total: number) => void } = {}
): Promise<File[]> {
  const results: File[] = [];
  for (let i = 0; i < files.length; i++) {
    results.push(await compressImage(files[i], opts));
    opts.onProgress?.(i + 1, files.length);
  }
  return results;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error || new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = src;
  });
}
