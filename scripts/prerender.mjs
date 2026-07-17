// Runs after `vite build`. This is a plain Vite/React SPA (React Router,
// client-only rendering via createRoot — no Next.js, no server) so the
// raw HTML response for any route is normally just the empty
// `<div id="root"></div>` shell until JS executes. That's invisible to
// crawlers that don't run JS (Paddle's domain reviewer among them).
//
// True SSR isn't available without switching frameworks (Next.js/Remix),
// which is out of scope here. This does the practical alternative for a
// Vite SPA instead: at build time, fetch the same plan_configs data the
// live Pricing page fetches client-side, and write it as static HTML
// into dist/index.html and dist/pricing/index.html. Vercel serves a
// matching static file before falling back to the SPA rewrite in
// vercel.json, so `curl /pricing` now returns real price text.
//
// This is inserted into the same #root div React mounts into.
// main.tsx uses createRoot(...).render(), not hydrateRoot(...), so
// React fully replaces this content on mount rather than trying to
// reconcile against it — no hydration-mismatch risk.
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// Keep in sync with src/lib/site.ts — this is a plain Node script and
// can't import that TS module directly.
const SITE_URL = "https://quickwaiterz.com";

// Vercel injects real env vars directly into process.env at build time —
// no .env file exists there (it's gitignored). Locally, load it by hand
// so `npm run build` works the same way without adding a dotenv dependency.
const envPath = resolve(root, ".env");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)\s*=\s*"?([^"\n]*)"?\s*$/i);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.warn("prerender: VITE_SUPABASE_URL/VITE_SUPABASE_PUBLISHABLE_KEY not set — skipping. The SPA still works, it just won't have crawler-visible pricing text.");
  process.exit(0);
}

const res = await fetch(
  `${SUPABASE_URL}/rest/v1/plan_configs?select=*&is_active=eq.true&order=display_order`,
  { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } },
);
if (!res.ok) {
  console.warn(`prerender: failed to fetch plan_configs (status ${res.status}) — skipping.`);
  process.exit(0);
}
const plans = await res.json();

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// The React <SEO> component (src/components/SEO.tsx) sets title/meta tags
// via react-helmet-async, which only runs once JS executes — invisible to
// crawlers reading the raw HTML of these two prerendered static files. So
// the same tags need to be baked into <head> here too, kept in sync by
// hand with the <SEO title=.../description=.../image=...> props on
// src/pages/Home.tsx and src/pages/Pricing.tsx.
const DEFAULT_OG_IMAGE = `${SITE_URL}/pwa-512x512.png`;

// Vite fingerprints asset filenames at build time (hero-cafe-<hash>.jpg),
// so the real filename is only known after `vite build` has run — find it
// on disk rather than hardcoding a hash that will go stale on rebuild.
const findAsset = (prefix) => {
  const dir = resolve(root, "dist/assets");
  if (!existsSync(dir)) return null;
  const match = readdirSync(dir).find((f) => f.startsWith(prefix));
  return match ? `${SITE_URL}/assets/${match}` : null;
};

// Every tag except <title> carries data-prerendered so src/components/SEO.tsx
// can sweep them off routes that fall back to serving this same file but
// render a different page client-side (see SEO.tsx for why <title> is
// deliberately left unmarked and untouched by that sweep).
const buildHead = ({ title, description, path, image, jsonLd }) => `<title>${esc(title)}</title>
    <meta data-prerendered="true" name="description" content="${esc(description)}" />
    <meta data-prerendered="true" property="og:title" content="${esc(title)}" />
    <meta data-prerendered="true" property="og:description" content="${esc(description)}" />
    <meta data-prerendered="true" property="og:type" content="website" />
    <meta data-prerendered="true" property="og:url" content="${SITE_URL}${path}" />
    <meta data-prerendered="true" property="og:image" content="${image ?? DEFAULT_OG_IMAGE}" />
    <meta data-prerendered="true" name="twitter:card" content="summary_large_image" />
    <meta data-prerendered="true" name="twitter:title" content="${esc(title)}" />
    <meta data-prerendered="true" name="twitter:description" content="${esc(description)}" />
    <meta data-prerendered="true" name="twitter:image" content="${image ?? DEFAULT_OG_IMAGE}" />
    <link data-prerendered="true" rel="canonical" href="${SITE_URL}${path}" />${jsonLd ? `
    <script data-prerendered="true" type="application/ld+json">${JSON.stringify(jsonLd)}</script>` : ""}`;

const injectHead = (html, headContent) =>
  html.replace(/<title>.*?<\/title>/s, "").replace("</head>", `${headContent}\n  </head>`);

const formatPrice = (p) =>
  p.plan_type === "trial" ? "Free" : `${p.currency === "USD" ? "$" : "PKR "}${Number(p.monthly_price).toLocaleString()}`;

const planCard = (p) => {
  const isTrial = p.plan_type === "trial";
  const features = Array.isArray(p.features) ? p.features : [];
  return `<article>
    <h2>${esc(p.name)}</h2>
    <p><strong>${esc(formatPrice(p))}${isTrial ? "" : "/mo"}</strong></p>
    ${isTrial ? "<p>14 days, no credit card</p>" : "<p>Taxes may apply and will be calculated at checkout.</p>"}
    ${p.setup_fee > 0 ? `<p>+ PKR ${Number(p.setup_fee).toLocaleString()} one-time setup fee</p>` : ""}
    <ul>${features.map((f) => `<li>${esc(f)}</li>`).join("")}</ul>
  </article>`;
};

const selfServe = plans.find((p) => p.plan_type === "self_serve_pkr");
const intl = plans.find((p) => p.plan_type === "international_usd");
const heroLine = `14-day free trial, then PKR ${Number(selfServe?.monthly_price ?? 0).toLocaleString()}/month in Pakistan or $${intl?.monthly_price ?? 0}/month internationally. Taxes may apply and will be calculated at checkout.`;

const template = readFileSync(resolve(root, "dist/index.html"), "utf8");
const ROOT_DIV = '<div id="root"></div>';
const heroImage = findAsset("hero-cafe");

let pricingHtml = template.replace(
  ROOT_DIV,
  `<div id="root"><main data-prerendered="pricing"><h1>QuickWaiterz Pricing</h1><p>${esc(heroLine)}</p>${plans.map(planCard).join("\n")}</main></div>`,
);
pricingHtml = injectHead(pricingHtml, buildHead({
  title: "Pricing — QuickWaiterz QR Ordering System",
  description: "Simple pricing for QuickWaiterz's QR code menu ordering software: a 14-day free trial, then Pakistan (PKR) or international (USD) plans for restaurants.",
  path: "/pricing",
}));
mkdirSync(resolve(root, "dist/pricing"), { recursive: true });
writeFileSync(resolve(root, "dist/pricing/index.html"), pricingHtml);

let homeHtml = template.replace(
  ROOT_DIV,
  `<div id="root"><main data-prerendered="home"><h1>QuickWaiterz — QR Code Menu &amp; Ordering for Restaurants</h1><p>${esc(heroLine)} <a href="/pricing">Full pricing</a>.</p></main></div>`,
);
homeHtml = injectHead(homeHtml, buildHead({
  title: "QuickWaiterz — QR Code Menu & Ordering for Restaurants",
  description: "QuickWaiterz is a QR code menu ordering system for restaurants and cafes — contactless ordering, live kitchen display, and real-time order tracking.",
  path: "/",
  image: heroImage,
  jsonLd: {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "QuickWaiterz",
    description: "QR code menu ordering and kitchen display system for restaurants and cafes.",
    applicationCategory: "Restaurant Management Software",
    operatingSystem: "Web",
    ...((selfServe || intl) && {
      offers: [selfServe, intl].filter(Boolean).map((p) => ({
        "@type": "Offer",
        price: String(p.monthly_price),
        priceCurrency: p.currency,
        url: `${SITE_URL}/pricing`,
      })),
    }),
  },
}));
writeFileSync(resolve(root, "dist/index.html"), homeHtml);

// --- sitemap.xml ---
// Static marketing pages plus every active business's public pages
// (landing + menu) — dynamic, so this is generated at build time rather
// than living as a static file in public/. robots.txt (static, no
// per-business content) lives in public/ and is copied by Vite as-is.
const STATIC_PAGES = [
  { path: "/", priority: "1.0" },
  { path: "/pricing", priority: "0.9" },
  { path: "/privacy", priority: "0.3" },
  { path: "/terms", priority: "0.3" },
  { path: "/refund", priority: "0.3" },
];

const bizRes = await fetch(
  `${SUPABASE_URL}/rest/v1/businesses?select=slug,updated_at&is_active=eq.true`,
  { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } },
);
const businesses = bizRes.ok ? await bizRes.json() : [];
if (!bizRes.ok) console.warn(`prerender: failed to fetch businesses for sitemap (status ${bizRes.status}) — sitemap will only include static pages.`);

const today = new Date().toISOString().slice(0, 10);
const urlEntry = (path, lastmod, priority) =>
  `  <url><loc>${SITE_URL}${path}</loc><lastmod>${lastmod}</lastmod><priority>${priority}</priority></url>`;

const staticEntries = STATIC_PAGES.map((p) => urlEntry(p.path, today, p.priority));
const bizEntries = businesses.flatMap((b) => {
  const lastmod = (b.updated_at ?? today).slice(0, 10);
  return [urlEntry(`/${b.slug}`, lastmod, "0.6"), urlEntry(`/${b.slug}/menu`, lastmod, "0.6")];
});

writeFileSync(
  resolve(root, "dist/sitemap.xml"),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${[...staticEntries, ...bizEntries].join("\n")}\n</urlset>\n`,
);

console.log(`prerender: wrote dist/index.html and dist/pricing/index.html with static pricing content and head meta tags, dist/sitemap.xml with ${STATIC_PAGES.length + bizEntries.length} URLs`);
