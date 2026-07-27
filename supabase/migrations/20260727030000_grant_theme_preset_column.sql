-- ============================================================
-- This project grants column-level privileges explicitly rather than
-- table-wide (see 20260710040000_fix_column_privilege_enforcement.sql) —
-- a newly added column is never automatically included in an existing
-- column-level GRANT, so the theme_preset column added in
-- 20260727020000_menu_theme_presets.sql was invisible to anon/authenticated
-- entirely: any select naming it failed the whole query with "permission
-- denied for table businesses", not just that one column.
--
-- theme_preset is public branding data (same bucket as tagline,
-- cover_image_url, theme_color — already both anon-readable and
-- owner-writable), so it gets the same grant shape as theme_color.
-- ============================================================

GRANT SELECT (theme_preset) ON public.businesses TO anon, authenticated;
GRANT UPDATE (theme_preset) ON public.businesses TO authenticated;
