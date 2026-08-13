# QuickWaiterz — Project Guide

## 1. Overview

QuickWaiterz is a QR-code digital ordering SaaS for cafes/restaurants (Pakistan-focused, PKR currency). A customer scans a QR code at their table, browses a themed menu, and places an order with no app install; kitchen/staff see live orders on a dashboard KDS; owners manage menu, QR codes, analytics, and settings.

Main features:
- Guest ordering via QR code (dine-in, tied to a verified table) or takeaway
- Multi-person ordering at the same table (a second phone auto-detects and adds to the existing order instead of blocking)
- Live order tracking for customers (auto-polling status page, no manual refresh needed)
- Owner Dashboard: menu management (with AI photo-scan import via Groq), QR code generation/print/regenerate, live orders KDS, Analytics (date-range picker, top items, peak hours, category breakdown, CSV export), Settings/branding, staff notification alerts
- Per-business selectable **menu theme presets** (`warm_classic` / `modern_minimal` / `bold_dark`)
- Subscription plans (trial + paid, Paddle billing) with plan-gated feature limits (table count, daily orders, analytics depth, menu-scan quota)
- Offline-first customer ordering (IndexedDB queue) for flaky cafe wifi
- PWA (installable, service worker, push-style browser notifications)

## 2. Tech Stack

- **Frontend**: React 18 + TypeScript (strict), Vite 5, react-router-dom v7 (plain `BrowserRouter`, **not** the data router/RSC APIs)
- **Styling**: Tailwind CSS v4 + shadcn/ui (Radix primitives), Framer Motion
- **State/data**: TanStack React Query, Zustand (`src/store/cart.ts`), Dexie (IndexedDB, offline)
- **Forms/validation**: react-hook-form + zod (validation schemas mirrored in edge functions, since Deno can't import from `src/`)
- **Backend**: Supabase — Postgres, Auth, Storage, Realtime, Edge Functions (Deno)
- **Edge Functions**: `create-order`, `add-order-item`, `scan-menu` — zod-validated, service-role only
- **PWA**: `vite-plugin-pwa` + Workbox
- **Other**: date-fns, qrcode.react, jspdf (QR print sheets), uuid, recharts, html-to-image
- **Package manager**: npm (`package-lock.json` is authoritative — `bun.lockb` is a dead leftover, see §6)
- **Deployment**: Vercel (SPA rewrite, `vercel.json`) + linked Supabase project

## 3. Folder Structure

```
src/
  pages/            Route-level pages (Dashboard, Menu, OrderStatus, BusinessLanding,
                     DisplayScreen, Onboarding, Auth, AdminPanel, Pricing, Home, legal pages)
  components/
    ui/              shadcn/ui primitives — treat as generated, edit sparingly
    menu/            MenuItemCard, ThemePresetPicker (customer menu theming)
    menu-scanner/    ScanMenuDialog, resizeImage (AI menu photo-scan flow)
    qr-print/        QrPrintDialog (jsPDF QR print sheet)
  hooks/             useAuth, useMyOrders, useNotifications, useOfflineMenu,
                     useOfflineOrderQueue, useOfflineSync, useSubscriptionLimits
  lib/               db.ts (Dexie), theme.ts (theme presets), categoryIcon.ts,
                     notificationSound.ts, orderHistory.ts, uploadMenuImage.ts,
                     validation.ts (zod schemas), utils.ts, site.ts
  integrations/supabase/
                     client.ts (ACTIVE browser client) · types.ts (generated —
                     regenerate after schema changes) · client.server.ts +
                     auth-middleware.ts (DEAD, unused, ignore)
  store/cart.ts      Zustand cart store
  router.tsx, routes/  DEAD TanStack Router leftover — see §6
supabase/
  migrations/        29 timestamped SQL files, append-only — source of truth for schema.
                     Never edit an applied migration; add a new one.
  functions/         create-order, add-order-item, scan-menu (Deno edge functions)
scripts/prerender.mjs  Post-build static prerender (meta tags/sitemap for Home & Pricing)
```

## 4. Conventions & Architecture

- **Git workflow**: one branch per fix/feature off `main`; merge only after explicit user confirmation; push to `origin` only on explicit request. Run `npx tsc --noEmit` and `npm run build` before every merge.
- **Security model** (defense in depth, applied consistently — keep it this way):
  - RLS enabled on every public table. Guest/anonymous reads go through narrow, point-lookup `SECURITY DEFINER` functions (`get_order_status`, `resolve_qr_code`, `get_active_order_for_table`, `get_active_orders_for_display`) — never a broad public SELECT policy.
  - Guest **writes** (`create_order_with_items`, `add_order_item`) have **no** anon/authenticated `EXECUTE` grant — they're callable only via the edge functions (service role). This is what makes per-IP rate limiting in the edge function actually unbypassable.
  - Column-level `GRANT`s (not just table-wide) are used on sensitive tables like `businesses`. **Adding a new column requires a matching GRANT migration**, or every query naming that column fails with `42501 permission denied`.
  - Rate limiting: shared `check_rate_limit(bucket_key, max, window)` Postgres helper + `rate_limit_hits` table, layered per-entity (inside RPCs) and per-IP (inside edge functions, via `x-forwarded-for` — verified not client-spoofable on this Supabase project).
  - Every change should be evaluated for security impact and called out explicitly (standing preference).
- **Theme system**: `THEME_PRESETS` in `src/lib/theme.ts` is the single source of truth; components read only `var(--theme-*)` CSS custom properties (set inline on a wrapper in `Menu.tsx`) and never hardcode preset-specific logic. Adding a 4th preset = one new config entry, no component changes.
- **Offline-first ordering**: `useOfflineOrderQueue`/`useOfflineSync`/`useOfflineMenu` cache the menu and queue orders in IndexedDB when the connection drops.
- **No automated test suite** — changes are verified via typecheck + build + manual/Playwright smoke checks against the real Supabase project, not unit/integration tests.

## 5. Key Files

| File | Responsibility |
|---|---|
| `src/pages/Dashboard.tsx` (~1250 lines) | Owner/staff dashboard — Overview, OrdersKDS, MenuManager, QrManager, Analytics, Settings. Large "god component"; splitting it up is a reasonable future cleanup, not yet done. |
| `src/pages/Menu.tsx` | Customer-facing themed menu, cart, order placement |
| `src/pages/OrderStatus.tsx` | Customer order tracking (polls `get_order_status` every 5s + on tab foreground) |
| `supabase/migrations/20260709222148_initial_schema.sql` | Base schema |
| `supabase/migrations/20260713000000_order_items_table.sql` | Normalized `order_items` table + concurrency-safe add-to-order RPCs |
| `src/integrations/supabase/types.ts` | Generated DB types — regenerate with `supabase gen types typescript --linked` after any schema change |
| `src/lib/theme.ts` | Menu theme preset definitions (colors, fonts, button styles per preset) |
| `src/lib/validation.ts` | zod schemas for client-side forms (edge functions keep their own mirrored copies) |

## 6. Known Issues / Pending

- **Dead code, safe to ignore or clean up**: `src/router.tsx`, `src/routes/*` (unused TanStack Router from the original scaffold — causes ~8 harmless pre-existing `tsc` errors), `src/integrations/supabase/client.server.ts`, `src/integrations/supabase/auth-middleware.ts` (unused server-only files), `bun.lockb`, `bunfig.toml`, `wrangler.jsonc` (leftover from the original TanStack Start + bun + Cloudflare scaffold — the project actually runs on npm + Vite + Vercel).
- **Staff accounts are backend-ready but not wired up**: `user_roles` supports a `staff` role and RLS already handles it, but `Dashboard.tsx` only looks up a business by `owner_id`, and there's no staff-invite UI yet. Effectively single-owner-per-business today.
- `AUDIT.md` in the repo root is a point-in-time security audit from early in the project — mostly resolved since, kept for history, **not** authoritative on current state.
- No automated tests.

## 7. Commands

```bash
npm run dev              # dev server
npx tsc --noEmit          # typecheck (expect ~8 pre-existing errors from dead TanStack files)
npm run build             # vite build + prerender script
npm run preview           # serve the production build locally
npm run lint               # eslint
npm run format              # prettier --write .

# Supabase (project must be linked)
npx supabase db query --linked "<sql>"          # or --file <path>
npx supabase db push --linked                    # apply new migrations
npx supabase gen types typescript --linked        # regenerate src/integrations/supabase/types.ts
npx supabase functions deploy <name>              # deploy an edge function
```

No automated test command exists. Required env vars are listed in `.env.example` (Supabase URL + publishable key on the client; service role key is server-only and never committed).
