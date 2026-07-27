-- ============================================================
-- CUSTOMER MENU THEME PRESETS
--
-- Lets an owner pick how their public /:slug/menu looks (warm_classic,
-- modern_minimal, bold_dark — the actual color/font/shape values live in
-- src/lib/theme.ts, not the database — this column only stores which one
-- a business has chosen).
--
-- TEXT + CHECK rather than a native Postgres ENUM type: adding a fourth
-- preset later is a one-line CHECK constraint change (DROP/ADD CONSTRAINT),
-- not an ALTER TYPE ... ADD VALUE, which can't run inside a transaction
-- with other schema changes in the same migration.
-- ============================================================

ALTER TABLE public.businesses
  ADD COLUMN theme_preset TEXT NOT NULL DEFAULT 'warm_classic'
  CHECK (theme_preset IN ('warm_classic', 'modern_minimal', 'bold_dark'));

-- Already covered by the businesses table's existing public-read policy
-- (menu pages are anon-visible) — no new RLS needed, same as every other
-- display column on this table (name, cover_image_url, etc.).
