import { supabase } from "@/integrations/supabase/client";

const BUCKET = "menu-images";

// Mirrors src/components/menu-scanner/resizeImage.ts's approach (resize on
// a canvas before upload) but returns a Blob for storage instead of a data
// URL for the scan API — a food photo doesn't need 1600px, 1200 is plenty
// for a menu card and keeps uploads fast on a cafe's own wifi/data.
async function resizeToBlob(file: File, maxDim = 1200, quality = 0.82): Promise<Blob> {
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
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Couldn't process that image"))), "image/jpeg", quality);
  });
}

// Uploads under "<businessId>/<random>.jpg" — storage RLS (see
// 20260727010000_menu_images_storage.sql) checks that folder segment
// against is_business_member, so this only ever succeeds for a photo
// landing in the caller's own business's folder.
export async function uploadMenuImage(businessId: string, file: File): Promise<string> {
  const blob = await resizeToBlob(file);
  const path = `${businessId}/${crypto.randomUUID()}.jpg`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
    contentType: "image/jpeg",
    cacheControl: "31536000",
  });
  if (error) throw error;
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

// Best-effort cleanup when a photo is replaced or removed — not called on
// the critical path of saving an item, so a failure here (e.g. a URL that
// was never one of ours) is swallowed rather than blocking the save.
export async function deleteMenuImage(url: string | null | undefined): Promise<void> {
  if (!url) return;
  const marker = `/${BUCKET}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) return;
  const path = url.slice(idx + marker.length);
  await supabase.storage.from(BUCKET).remove([path]).catch(() => {});
}
