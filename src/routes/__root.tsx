import { createRootRoute, HeadContent, Scripts, ClientOnly } from "@tanstack/react-router";
import { HelmetProvider } from "react-helmet-async";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import appCss from "../styles.css?url";
import { App } from "../App";
import { Toaster } from "@/components/ui/sonner";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "QuickServe — Smart Restaurant Queue & QR Ordering" },
      {
        name: "description",
        content:
          "QuickServe is the modern QR-code ordering and queue management platform for cafes and restaurants. Eliminate the queue, elevate the experience.",
      },
      { property: "og:title", content: "QuickServe — Smart Restaurant Queue & QR Ordering" },
      {
        property: "og:description",
        content: "QR ordering, live kitchen display, and real-time queue management.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      {
        rel: "preconnect",
        href: "https://fonts.googleapis.com",
      },
      {
        rel: "preconnect",
        href: "https://fonts.gstatic.com",
        crossOrigin: "anonymous",
      },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700;800;900&family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <QueryClientProvider client={queryClient}>
      <HelmetProvider>
        <App />
        <Toaster richColors position="top-center" />
      </HelmetProvider>
    </QueryClientProvider>
  );
}
