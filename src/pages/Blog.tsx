import { SEO } from "@/components/SEO";
import { MarketingNav, MarketingFooter } from "@/components/marketing/MarketingShell";

export default function Blog() {
  return (
    <>
      {/* noIndex until there's real content here — an empty listing page
          offers nothing to a crawler and reads as thin content. Route and
          shell are in place so content marketing can start without any
          further scaffolding; remove noIndex once posts exist. */}
      <SEO
        title="Blog — QuickWaiterz"
        description="Guides and updates on QR code ordering, digital menus, and running a restaurant or cafe with QuickWaiterz."
        noIndex
      />
      <MarketingNav />
      <main className="container mx-auto px-4 lg:px-8 py-16 max-w-3xl">
        <h1 className="font-display text-4xl font-bold mb-2">Blog</h1>
        <p className="text-muted-foreground">
          We're just getting started — guides on QR ordering, digital menus, and running a
          restaurant or cafe with QuickWaiterz are coming soon.
        </p>
      </main>
      <MarketingFooter />
    </>
  );
}
