import { Helmet } from "react-helmet-async";

interface Props {
  title: string;
  description: string;
  image?: string;
  type?: "website" | "article" | "restaurant";
  noIndex?: boolean;
  jsonLd?: Record<string, unknown>;
}

export function SEO({ title, description, image, type = "website", noIndex, jsonLd }: Props) {
  const url = typeof window !== "undefined" ? window.location.href : "";
  return (
    <Helmet>
      <title>{title}</title>
      <meta name="description" content={description} />
      {noIndex && <meta name="robots" content="noindex,nofollow" />}
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:type" content={type === "restaurant" ? "website" : type} />
      <meta property="og:url" content={url} />
      {image && <meta property="og:image" content={image} />}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      {image && <meta name="twitter:image" content={image} />}
      <link rel="canonical" href={url} />
      {jsonLd && <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>}
    </Helmet>
  );
}
