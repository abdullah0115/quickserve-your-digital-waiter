# QuickServe — Production Readiness Audit

**Date:** 2026-07-09
**Scope:** Security, code quality, and architecture review of the Supabase + React (Vite SPA) codebase.
**Note:** No code was changed. This is a read-only audit. Fixes are recommendations only.

---

## Summary

| Priority | Count | Theme |
|----------|-------|-------|
| 🔴 CRITICAL | 3 | Public RLS leaks customer PII + Stripe IDs; client-controlled order totals |
| 🟠 HIGH | 4 | `.env` in git; broken RBAC; schema drift (`notifications`); no input validation |
| 🟡 MEDIUM | 5 | Dead duplicate router; dead server code; silent error handling; god-component |
| 🔵 LOW | 6 | Dead token logic, console logs, `as any`, tracked build artifacts, duplicated providers |

**Good news first:** RLS *is* enabled (`ENABLE ROW LEVEL SECURITY`) on every table in the migrations, the Supabase key shipped to the browser is the **publishable/anon key** (safe by design — it is *meant* to be public), and there is no real hardcoded secret in the client bundle. The problems below are about **RLS policies being too permissive** and the app trusting the client — not about a leaked key.

---

## 🔴 CRITICAL

### C1. `orders` table is publicly readable — customer names + phone numbers leak
**File:** `supabase/migrations/20260423152229_...sql`
Policy `"Orders are publicly viewable" FOR SELECT USING (true)`. Anyone holding the public anon key (i.e. anyone who opens the site) can run `supabase.from('orders').select('*')` and read **every order of every business**, including `customer_name` and `customer_phone`.
**Why it matters:** This is a PII / privacy breach and a competitor-scraping vector. A customer's order should only be visible to that business's owner and to the customer who placed it (e.g. via order id + token).

### C2. `businesses` table publicly exposes Stripe IDs and owner contact info
**File:** `supabase/migrations/20260423152229_...sql`
Policy `"Active businesses are publicly viewable" ... USING (is_active = true OR ...)` combined with `select('*')` returns `stripe_customer_id`, `stripe_subscription_id`, `email`, and `phone` for every active business to any anonymous visitor.
**Why it matters:** Billing identifiers and private contact details should never be public. The public menu only needs name/slug/logo/theme — sensitive columns must be excluded via a view or column-scoped policy.

### C3. Order totals are set by the client — price tampering & fake orders
**Files:** `src/pages/Menu.tsx` (`placeOrder`, line ~68), `src/hooks/useCreateOrder.ts`, migration policy `"Anyone can create orders" ... WITH CHECK (true)`
The order is inserted with `total_amount: cart.total()` straight from the browser; nothing server-side recomputes the total from `menu_items.price`. Insert is fully unauthenticated (`WITH CHECK (true)`).
**Why it matters:** A user can place an order for **PKR 0** (or any amount) by editing the request, and anyone can spam unlimited fake orders into any business with no rate limit. Totals must be validated/recomputed server-side (Edge Function or DB trigger) against real menu prices.

---

## 🟠 HIGH

### H1. `.env` is committed to git (and not in `.gitignore`)
**Files:** `.env` (tracked — confirmed via `git ls-files`), `.gitignore` (does not list `.env`)
Right now the file only holds the publishable key (safe) plus a **placeholder** service-role value (`"aapki-service-role-key"`), so no live secret is leaked *today*. But the file is tracked, so the moment a real `SUPABASE_SERVICE_ROLE_KEY` is pasted in, it will be committed and pushed.
**Why it matters:** The service-role key bypasses all RLS. Add `.env` to `.gitignore`, `git rm --cached .env`, and commit a `.env.example` instead. Rotate any key that has ever been committed.

### H2. Role/permission system is broken and internally inconsistent
**Files:** `src/hooks/useAuth.ts`, `src/pages/Onboarding.tsx`, `src/integrations/supabase/types.ts`
`useAuth` reads from tables `profiles` and `business_members` that **do not exist** in the migrations or generated types — every load silently fails (caught, logged), so `isOwner`, `isStaff`, and all `can*` permissions are **always false/undefined**. Meanwhile onboarding writes the owner role to a *different* table, `user_roles`, which has **no INSERT policy** — so that insert is actually denied by RLS.
**Why it matters:** The advertised "staff accounts" (Pro plan) don't work at all, and the `has_role` / `is_business_member` SQL functions are defined but referenced by **zero** policies. The whole RBAC layer is non-functional; access currently works only because every write policy checks `owner_id` directly.

### H3. `notifications` table is used in code but missing from migrations (schema drift)
**Files:** `src/hooks/useNotifications.ts`, `src/components/NotificationBell.tsx`, `supabase/migrations/*`
The notifications feature queries/subscribes to a `notifications` table (and it's cast with `(supabase as any)` because it's absent from `types.ts`). No migration creates it — it was presumably made by hand in the Supabase dashboard.
**Why it matters:** Its RLS status **cannot be verified from the repo** (could be wide open like `orders`), and a fresh environment/CI cannot reproduce the schema. Add a migration for it and confirm its RLS policies.

### H4. No real input validation anywhere (`zod` is installed but unused)
**Files:** `src/pages/Menu.tsx`, `src/pages/Dashboard.tsx` (MenuManager/QrManager/Settings), `src/pages/Onboarding.tsx`
Validation is limited to `if (!form.name || !form.price)`. `price` is `Number(form.price)` with no NaN/negative/upper-bound check; `image_url` accepts any string; text fields are unbounded. `zod` + `@hookform/resolvers` are dependencies but never imported (no `z.object`/`zodResolver` in the codebase).
**Why it matters:** Bad/negative prices corrupt revenue math, and unvalidated free-text goes straight to the DB. DB-side there are no length/`CHECK` constraints either, so validation must exist somewhere.

---

## 🟡 MEDIUM

### M1. Dead + duplicate routing system (TanStack Router)
**Files:** `src/router.tsx`, `src/routeTree.gen.ts`, `src/routes/__root.tsx`, `src/routes/index.tsx`, `src/routes/$.tsx`
The app actually runs on **react-router-dom** (`main.tsx` → `BrowserRouter` → `App`). The entire TanStack Router setup is unused, nothing imports `getRouter`/`routeTree`, and `__root.tsx` even imports `{ App }` (named) when `App.tsx` only has a default export — so it's broken *and* dead.
**Why it matters:** Two routing frameworks in one repo is a major source of confusion for anyone onboarding, plus dead code and dependency bloat. Pick one (react-router) and delete the other.

### M2. Dead server-side code with service-role client
**Files:** `src/integrations/supabase/client.server.ts`, `src/integrations/supabase/auth-middleware.ts`
Both are written for a server runtime (`process.env`, `supabaseAdmin`, request middleware), but this is a **static SPA** (Vercel rewrite-to-`/`, no API routes). Nothing imports them.
**Why it matters:** They imply a server layer that doesn't exist. Either wire real Edge Functions/API routes (which C3/H1 actually need) or remove them so no one accidentally bundles the service-role path.

### M3. Inconsistent / missing error handling on reads
**Files:** `src/pages/Dashboard.tsx` (Overview, Analytics, MenuManager, SettingsPanel), `src/pages/Menu.tsx`, `src/pages/BusinessLanding.tsx`, `src/pages/DisplayScreen.tsx`
Many queries destructure only `{ data }` and ignore `error` (e.g. `const { data: orders } = await supabase...`). On failure the UI just shows empty/zero state with no message, retry, or log. Mutations (order status, save) mostly handle errors via toast — reads mostly don't.
**Why it matters:** A failing fetch (offline edge, RLS denial, network) silently renders "0 orders / empty menu", which looks like data loss to the user.

### M4. `Dashboard.tsx` is a 620-line god component
**File:** `src/pages/Dashboard.tsx`
Six feature panels (Overview, OrdersKDS, MenuManager, QrManager, Analytics, SettingsPanel) plus data fetching, realtime subscriptions, and forms all live in one file.
**Why it matters:** Hard to test, review, and maintain; merge-conflict magnet. Should be split into `src/pages/dashboard/*` components with shared data hooks.

### M5. Duplicated app-shell providers across the live and dead trees
**Files:** `src/main.tsx` vs `src/routes/__root.tsx`
`QueryClient`, `HelmetProvider`, and `Toaster` are configured in **both** `main.tsx` (live) and `__root.tsx` (dead TanStack root), with different settings (e.g. `Toaster` from `sonner` vs `@/components/ui/sonner`).
**Why it matters:** Divergent config is a trap — a future fix applied to the wrong file silently does nothing. Resolves once M1 is done.

---

## 🔵 LOW

### L1. Dead client-side token calculation
**File:** `src/hooks/useCreateOrder.ts` (`getNextTokenNumber`)
Token is computed client-side and sent, but the `trg_set_order_token` trigger overwrites it on insert. `Menu.tsx` already passes `token_number: 0`. The client function is dead work and racy — remove it.

### L2. `console.*` left in production paths
**Files:** `useAuth.ts`, `useNotifications.ts`, `useOfflineSync.ts`, `useCreateOrder.ts`, `main.tsx`, `useOfflineMenu.ts`
Console logging of errors/PWA state ships to production. Use a gated logger or strip on build.

### L3. `(supabase as any)` casts hide schema drift
**Files:** `useAuth.ts`, `useNotifications.ts` (8 occurrences total)
Casting to `any` is what allowed H2/H3 (queries against non-existent tables) to compile. Regenerate `types.ts` from the real DB and drop the casts so the compiler catches drift.

### L4. Build artifacts tracked in git
**Files:** `dev-dist/sw.js`, `dev-dist/registerSW.js` (tracked despite `dev-dist` being in `.gitignore`)
These regenerate on every dev run (hence the `M dev-dist/sw.js` in git status). `git rm --cached` them.

### L5. No React error boundary
**File:** `src/App.tsx`
A render error in any lazy page throws to a blank screen (only a `Suspense` fallback exists). Add an error boundary around `<Routes>`.

### L6. Duplicate migration + minor DB nits
**Files:** `supabase/migrations/20260423152251_...sql`
The second migration only re-defines `touch_updated_at` (already created in the first). Also `menu_categories`/`menu_items`/`qr_codes` are all `USING (true)` for SELECT — acceptable for a public menu, but worth a conscious decision before launch.

---

## Folder structure (current)

```
src/
  App.tsx                 # react-router-dom routes (ACTIVE entry)
  main.tsx                # ReactDOM root, providers, PWA register (ACTIVE)
  router.tsx              # TanStack router (DEAD — see M1)
  routeTree.gen.ts        # TanStack generated (DEAD)
  routes/                 # TanStack file routes (DEAD): __root, index, $
  pages/                  # Home, Pricing, Auth, Onboarding, Dashboard, Menu,
                          #   OrderStatus, DisplayScreen, BusinessLanding, NotFound
  components/
    ui/                   # ~50 shadcn/ui primitives (fine)
    marketing/            # MarketingShell
    NotificationBell, OfflineIndicator, SEO
  hooks/                  # useAuth, useCreateOrder, useNotifications,
                          #   useOfflineSync, useOfflineMenu, use-mobile
  integrations/supabase/  # client.ts (ACTIVE), client.server.ts (DEAD),
                          #   auth-middleware.ts (DEAD), types.ts
  lib/                    # db.ts (Dexie/IndexedDB), utils.ts
  store/                  # cart.ts (zustand)
supabase/
  config.toml
  migrations/             # 2 files — note notifications table is MISSING (H3)
```

**Architectural verdict:** The feature-based layout is reasonable, but two structural problems dominate: (1) **two routing frameworks** coexist (M1), and (2) the app is architected as if it has a **trusted server tier** (`client.server.ts`, `auth-middleware.ts`) while actually shipping as a pure static SPA — which is exactly why the security-sensitive logic (order totals, role assignment) leaks to the client and to permissive RLS. The single highest-leverage architectural fix is to add a small trusted server surface (Supabase Edge Functions) for order creation and role management, then tighten the RLS policies behind it.

---

## Suggested fix order

1. **C1, C2** — tighten `orders` and `businesses` SELECT policies (stop the PII/Stripe leak). *Fastest, highest impact.*
2. **H1** — untrack `.env`, add `.gitignore` entry, rotate keys.
3. **C3 + H2/H4** — add an Edge Function for order creation (server-computed totals) and fix/complete the RBAC + validation.
4. **H3** — add the `notifications` migration and verify its RLS.
5. **M1–M2** — delete the dead TanStack + server code.
6. Everything in MEDIUM/LOW as cleanup before launch.
