-- ============================================================
-- MENU IMAGE UPLOADS
--
-- Until now the only way to attach a photo to a menu item or business cover
-- was pasting an already-hosted URL — no real upload existed anywhere in
-- the app. That's especially a gap right after an AI menu scan: scanning a
-- physical paper menu gets you names and prices, never photos (there aren't
-- any on the paper), so every scanned item landed with no image at all.
--
-- This adds a public storage bucket for menu/cover photos, uploaded straight
-- from a phone's camera or gallery. Objects are stored under
-- "<business_id>/<random>.jpg" — public read (customers need to see them on
-- the menu with no login), but a business can only write into its own
-- business_id folder, checked the same way every other business-scoped
-- write in this app is checked (is_business_member).
-- ============================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('menu-images', 'menu-images', true, 5242880, ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Menu images are publicly readable"
ON storage.objects FOR SELECT
USING (bucket_id = 'menu-images');

CREATE POLICY "Business members upload their own menu images"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'menu-images'
  AND public.is_business_member(auth.uid(), (storage.foldername(name))[1]::uuid)
);

CREATE POLICY "Business members update their own menu images"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'menu-images'
  AND public.is_business_member(auth.uid(), (storage.foldername(name))[1]::uuid)
);

CREATE POLICY "Business members delete their own menu images"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'menu-images'
  AND public.is_business_member(auth.uid(), (storage.foldername(name))[1]::uuid)
);
