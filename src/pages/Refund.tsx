import { SEO } from "@/components/SEO";
import { MarketingNav, MarketingFooter } from "@/components/marketing/MarketingShell";

const LAST_UPDATED = "July 15, 2026";
const CONTACT_EMAIL = "QuickWaiterz@gmail.com";

export default function Refund() {
  return (
    <>
      <SEO
        title="Refund Policy — QuickWaiterz"
        description="QuickWaiterz's refund and cancellation policy for subscriptions."
      />
      <MarketingNav />
      <main className="container mx-auto px-4 lg:px-8 py-16 max-w-3xl">
        <h1 className="font-display text-4xl font-bold mb-2">Refund Policy</h1>
        <p className="text-sm text-muted-foreground mb-10">Last updated: {LAST_UPDATED}</p>

        <div className="space-y-8 text-sm leading-relaxed text-foreground/90">
          <section>
            <p>
              This policy covers refunds and cancellations for QuickWaiterz subscription
              plans. It applies to Business owners who subscribe to a paid plan — it doesn't
              apply to individual food/drink orders placed by customers through a Business's
              menu, which are a transaction between the customer and that Business (see our{" "}
              <a href="/terms" className="text-accent hover:underline">Terms of Service</a>).
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold mb-2">1. Try before you pay</h2>
            <p>
              Every new Business account starts on a 14-day free trial with no credit card
              required, so you can evaluate QuickWaiterz fully before paying anything.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold mb-2">2. 14-day refund window</h2>
            <p>
              In line with standard consumer cancellation rights, you can request a full refund
              on a paid subscription payment within 14 days of that charge (your initial payment
              or a renewal) — no questions asked. Contact us within that window and we'll refund
              it. After 14 days, that payment becomes non-refundable, though you can still cancel
              at any time to stop future billing.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold mb-2">3. Cancel anytime</h2>
            <p>
              You can cancel your subscription at any time by contacting us. Cancelling stops
              future billing — you keep access to your paid plan until the end of the billing
              period you've already paid for (or receive a refund for it if you're still within
              the 14-day window above), after which your account moves to the free plan. We
              don't charge cancellation fees.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold mb-2">4. Exceptions</h2>
            <p>
              If you were charged in error — for example a duplicate charge or a billing
              mistake on our part — contact us and we'll investigate and refund it. This
              policy doesn't limit any refund rights you have under applicable law that can't
              be waived by agreement.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold mb-2">5. Changes to this policy</h2>
            <p>
              We may update this policy as the service evolves. We'll update the "last
              updated" date above when we do.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold mb-2">6. Contact</h2>
            <p>
              To cancel a subscription or ask about a charge, email{" "}
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
