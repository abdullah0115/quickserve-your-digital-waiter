import { SEO } from "@/components/SEO";
import { MarketingNav, MarketingFooter } from "@/components/marketing/MarketingShell";

const LAST_UPDATED = "July 13, 2026";
const CONTACT_EMAIL = "QuickWaiterz@gmail.com";

export default function Terms() {
  return (
    <>
      <SEO
        title="Terms of Service — QuickWaiterz"
        description="The terms that govern use of QuickWaiterz."
      />
      <MarketingNav />
      <main className="container mx-auto px-4 lg:px-8 py-16 max-w-3xl">
        <h1 className="font-display text-4xl font-bold mb-2">Terms of Service</h1>
        <p className="text-sm text-muted-foreground mb-10">Last updated: {LAST_UPDATED}</p>

        <div className="space-y-8 text-sm leading-relaxed text-foreground/90">
          <section>
            <p>
              These terms govern use of QuickWaiterz (the "Service"), a QR-code ordering and
              queue-management tool for cafes and restaurants. By creating a Business account
              or placing an order through a QuickWaiterz menu, you agree to these terms.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold mb-2">1. The service</h2>
            <p>
              QuickWaiterz lets a Business owner ("Business", "you") set up a digital menu
              and QR codes so customers can place orders from their table without an app or
              account. We provide the software; the Business is responsible for its own
              menu content, pricing, food preparation, and fulfilling orders.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold mb-2">2. Accounts</h2>
            <ul className="list-disc pl-6 space-y-1">
              <li>You must provide accurate information when creating a Business account and keep your login credentials secure</li>
              <li>You're responsible for activity that happens under your account</li>
              <li>We may suspend or terminate an account that we reasonably believe is being used abusively, fraudulently, or in violation of these terms</li>
            </ul>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold mb-2">3. Subscriptions and billing</h2>
            <p>
              Subscription plans and pricing are shown on our Pricing page. Subscriptions are
              currently activated and managed manually rather than through automatic recurring
              billing — your plan and its status are set by us based on your agreement with
              us. We'll communicate any change to your plan or billing arrangement directly.
              We may change plan pricing going forward, but won't change what you've already
              agreed to pay for a current billing period without notice.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold mb-2">4. Acceptable use</h2>
            <p className="mb-2">You agree not to:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Use the Service to submit false, spam, or abusive orders</li>
              <li>Attempt to bypass rate limits, security controls, or access other Businesses' data</li>
              <li>Reverse engineer, scrape, or overload the Service beyond normal use</li>
              <li>Use the menu-scanning feature to upload anything other than your own menu</li>
            </ul>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold mb-2">5. Customer orders</h2>
            <p>
              Orders placed through a Business's QuickWaiterz menu are a transaction between
              the customer and that Business. QuickWaiterz provides the ordering
              infrastructure but is not a party to that transaction and isn't responsible for
              order accuracy, food quality, pricing, or fulfillment — that's the Business's
              responsibility.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold mb-2">6. Availability</h2>
            <p>
              We aim to keep the Service available and reliable but don't guarantee
              uninterrupted access. We're not liable for losses caused by outages,
              maintenance, or issues with third-party providers we depend on.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold mb-2">7. Limitation of liability</h2>
            <p>
              The Service is provided "as is." To the extent permitted by law, QuickWaiterz
              isn't liable for indirect, incidental, or consequential damages arising from
              use of the Service, including lost orders, lost revenue, or data loss.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold mb-2">8. Termination</h2>
            <p>
              You may stop using the Service and request account deletion at any time by
              contacting us. We may suspend or terminate access for violation of these terms.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold mb-2">9. Changes to these terms</h2>
            <p>
              We may update these terms as the Service evolves. We'll update the "last
              updated" date above when we do. Continued use after a change means you accept
              the update.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold mb-2">10. Contact</h2>
            <p>
              Questions about these terms? Email{" "}
              <a href={`mailto:${CONTACT_EMAIL}`} className="text-accent hover:underline">
                {CONTACT_EMAIL}
              </a>.
            </p>
          </section>
        </div>
      </main>
      <MarketingFooter />
    </>
  );
}
