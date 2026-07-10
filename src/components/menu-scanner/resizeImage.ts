// Downscales/compresses a photo client-side before it's base64-encoded and
// sent to the scan-menu edge function — a full-resolution phone photo can
// be 5-10MB, which is slow to upload and unnecessary for reading menu text.
export async function resizeImageToDataUrl(file: File, maxDim = 1600, quality = 0.85): Promise<string> {
  const bitmap = await createImageBitmap(file);
  let { width, height } = bitmap;
  if (width > maxDim || height > maxDim) {
    const scale = maxDim / Math.max(width, height);
    width = Math.round(width * scale);
    height = Math.round(height * scale);
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", quality);
}
