import { Helmet } from "react-helmet-async";
import { SITE_URL } from "@/lib/site";

interface Props {
  title: string;
  description: string;
  image?: string;
  type?: "website" | "article" | "restaurant";
  noIndex?: boolean;
  jsonLd?: Record<string, unknown>;
}

const DEFAULT_OG_IMAGE = "/pwa-512x512.png";

const absoluteUrl = (path: string) => (path.startsWith("http") ? path : `${SITE_URL}${path}`);

export function SEO({ title, description, image, type = "website", noIndex, jsonLd }: Props) {
  // Canonical/og:url intentionally drop query strings and hash — those
  // vary per visit (?type=takeaway, ?qr=..., #features) without changing
  // the page's actual content, so keeping them would create duplicate
  // canonical URLs for what search engines should treat as one page.
  const path = typeof window !== "undefined" ? window.location.pathname : "/";
  const url = `${SITE_URL}${path}`;
  const ogImage = absoluteUrl(image ?? DEFAULT_OG_IMAGE);
  return (
    <Helmet>
      <title>{title}</title>
      <meta name="description" content={description} />
      {noIndex && <meta name="robots" content="noindex,nofollow" />}
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:type" content={type === "restaurant" ? "website" : type} />
      <meta property="og:url" content={url} />
      <meta property="og:image" content={ogImage} />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={ogImage} />
      <link rel="canonical" href={url} />
      {jsonLd && <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>}
    </Helmet>
  );
}
