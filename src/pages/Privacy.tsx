import { SEO } from "@/components/SEO";
import { MarketingNav, MarketingFooter } from "@/components/marketing/MarketingShell";

const LAST_UPDATED = "July 13, 2026";
const CONTACT_EMAIL = "QuickWaiterz@gmail.com";

export default function Privacy() {
  return (
    <>
      <SEO
        title="Privacy Policy — QuickWaiterz"
        description="How QuickWaiterz collects, uses, and protects your data."
      />
      <MarketingNav />
      <main className="container mx-auto px-4 lg:px-8 py-16 max-w-3xl">
        <h1 className="font-display text-4xl font-bold mb-2">Privacy Policy</h1>
        <p className="text-sm text-muted-foreground mb-10">Last updated: {LAST_UPDATED}</p>

        <div className="space-y-8 text-sm leading-relaxed text-foreground/90">
          <section>
            <p>
              QuickWaiterz ("we", "us") provides a QR-code ordering and queue-management
              service for cafes and restaurants ("Businesses"). This policy explains what
              data we collect from Business owners and their customers, why, and how it's
              handled.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold mb-2">1. Information we collect</h2>
            <p className="mb-2"><strong>From Business owners (accounts):</strong></p>
            <ul className="list-disc pl-6 space-y-1 mb-3">
              <li>Email address and password, used to create and log in to your account</li>
              <li>Business details you provide (name, menu items, prices, table/QR setup)</li>
              <li>Subscription plan and status</li>
            </ul>
            <p className="mb-2"><strong>From customers placing orders (no account required):</strong></p>
            <ul className="list-disc pl-6 space-y-1 mb-3">
              <li>Name, and phone number if you choose to provide it, at the time of ordering</li>
              <li>Order details (items, quantities, notes, table number)</li>
            </ul>
            <p className="mb-2"><strong>Automatically:</strong></p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Basic technical data needed to prevent abuse (e.g. IP address, used only for rate-limiting order and menu-scan requests)</li>
              <li>Locally on your device: your cart and a temporary offline cache of the menu, stored in your browser (not sent to us) so the app works with a poor connection</li>
            </ul>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold mb-2">2. How we use this information</h2>
            <ul className="list-disc pl-6 space-y-1">
              <li>To create and display orders to Business staff and customers, and keep order status updated</li>
              <li>To let a Business owner manage their menu, tables, and subscription</li>
              <li>To send account-related emails (signup confirmation, password reset)</li>
              <li>To detect and limit automated abuse (e.g. spam orders, excessive menu scans)</li>
              <li>We do not sell customer or Business data to third parties, and we do not use it for advertising</li>
            </ul>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold mb-2">3. Third-party services we use</h2>
            <p className="mb-2">We rely on a small number of providers to run the service:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li><strong>Supabase</strong> — hosts our database, authentication, and file storage</li>
              <li><strong>Groq</strong> — when a Business owner uses the "scan menu" feature, the photo they upload is sent to Groq's AI service to read the menu text. Menu photos are not used for anything else</li>
              <li><strong>Gmail / SMTP</strong> — used to send account emails (confirmation, password reset)</li>
              <li><strong>Vercel</strong> — hosts the website itself</li>
            </ul>
            <p className="mt-2">Each of these providers processes data only as needed to provide their service to us.</p>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold mb-2">4. Data retention</h2>
            <p>
              Order and account data is kept for as long as the related Business account is
              active, so owners can see order history. You can request deletion of your
              Business account and associated data at any time by contacting us (below).
              Customer order data tied to a deleted Business account is deleted along with it.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold mb-2">5. Your rights</h2>
            <p>
              You can ask us to access, correct, or delete the personal data we hold about
              you by emailing the address below. If you're a customer who placed an order
              through a QR menu, you can contact the Business directly, or reach us and
              we'll help.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold mb-2">6. Changes to this policy</h2>
            <p>
              We may update this policy as the service evolves. We'll update the "last
              updated" date above when we do. Continued use of QuickWaiterz after a change
              means you accept the update.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold mb-2">7. Contact</h2>
            <p>
              Questions about this policy or your data? Email{" "}
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
