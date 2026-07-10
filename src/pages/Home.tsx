import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, QrCode, Monitor, Smartphone, BarChart3, Zap, Lock, Play, Check, Sparkles, ShieldCheck, KeyRound, Database, Radar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SEO } from "@/components/SEO";
import { MarketingNav, MarketingFooter } from "@/components/marketing/MarketingShell";
import { useAuth } from "@/hooks/useAuth";
import heroImg from "@/assets/hero-cafe.jpg";
import featureImg from "@/assets/feature-qr.jpg";

const features = [
  { icon: QrCode, title: "QR Code Ordering", description: "Customers scan, order, and track — all from their phone. Zero app downloads required." },
  { icon: Monitor, title: "Live Kitchen Display", description: "Real-time order queue with status updates. Your staff stays perfectly in sync." },
  { icon: Smartphone, title: "Smart Notifications", description: "WhatsApp alerts when orders are ready. No more shouting across the counter." },
  { icon: BarChart3, title: "Sales Analytics", description: "Track daily revenue, bestsellers, and peak hours. Grow your business with data." },
  { icon: Zap, title: "Lightning Fast", description: "Orders appear instantly. Updates in real-time. Built for high-traffic rushes." },
  { icon: Lock, title: "Secure & Reliable", description: "Enterprise-grade security. 99.9% uptime guaranteed. Your data is always safe." },
];

const securityPoints = [
  {
    icon: QrCode,
    title: "Tables can't be spoofed",
    description: "Each table's QR code is a random, unguessable link. The table a customer is ordering for is always verified on our server — never taken from what a browser claims.",
  },
  {
    icon: Database,
    title: "Your data stays yours",
    description: "Every business's menu, orders, and customer details are isolated at the database level. No other business — and no customer — can ever read or change data that isn't theirs.",
  },
  {
    icon: KeyRound,
    title: "Prices set your side, always",
    description: "Order totals are recalculated from your live menu on our server for every single order. A tampered request from a customer's device can never change what they're charged.",
  },
  {
    icon: Radar,
    title: "No double-booked tables",
    description: "Only one active order per table at a time — enforced atomically at the database level, not just checked in the app, so it holds even if two orders land at the exact same instant.",
  },
];

export default function Home() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const ctaHref = user ? "/dashboard" : "/auth?mode=signup";

  return (
    <>
      <SEO
        title="QuickWaiters — Smart Restaurant Queue & QR Ordering System"
        description="Eliminate the queue, elevate the experience. QuickWaiters is the modern QR ordering and kitchen display platform designed for cafes and restaurants."
        image={heroImg}
      />
      <div className="min-h-screen bg-background">
        <MarketingNav />

        {/* HERO */}
        <section className="relative overflow-hidden">
          <div className="absolute inset-0 pattern-warm opacity-60" />
          <div className="container mx-auto px-4 lg:px-8 pt-16 pb-24 lg:pt-24 lg:pb-32 relative">
            <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
              <motion.div
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6 }}
              >
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-accent/15 text-accent-foreground border border-accent/30 mb-6">
                  <Sparkles className="w-3.5 h-3.5 text-accent" />
                  <span className="text-xs font-medium">14-day free trial · No credit card</span>
                </div>
                <h1 className="font-display text-5xl md:text-6xl lg:text-7xl font-bold leading-[1.05] text-balance">
                  Eliminate the queue.
                  <br />
                  <span className="text-accent">Elevate</span> the experience.
                </h1>
                <p className="mt-6 text-lg md:text-xl text-muted-foreground max-w-xl leading-relaxed">
                  The smart QR ordering system designed for modern cafes and restaurants. No more shouting. No more chaos. Just delighted customers.
                </p>
                <div className="mt-8 flex flex-col sm:flex-row gap-3">
                  <Button size="lg" onClick={() => navigate(ctaHref)} className="bg-primary hover:bg-primary-hover text-primary-foreground h-12 px-7 text-base shadow-warm">
                    Start Free Trial <ArrowRight className="ml-2 w-4 h-4" />
                  </Button>
                  <Link to="/pricing">
                    <Button size="lg" variant="outline" className="h-12 px-7 text-base">
                      <Play className="mr-2 w-4 h-4" /> See Pricing
                    </Button>
                  </Link>
                </div>
                <div className="mt-10 flex items-center gap-6 text-sm text-muted-foreground">
                  <div className="flex items-center gap-2"><Check className="w-4 h-4 text-secondary" /> No credit card</div>
                  <div className="flex items-center gap-2"><Check className="w-4 h-4 text-secondary" /> Setup in minutes</div>
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.7, delay: 0.1 }}
                className="relative"
              >
                <div className="absolute -inset-6 bg-gradient-warm opacity-20 blur-3xl rounded-full" />
                <img
                  src={heroImg}
                  alt="Modern cafe interior with friendly barista"
                  width={1600}
                  height={1200}
                  className="relative rounded-3xl shadow-warm w-full h-auto object-cover aspect-4/3"
                />
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5 }}
                  className="absolute -bottom-6 -left-6 bg-card rounded-2xl shadow-warm p-4 border w-56"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-status-ready/15 flex items-center justify-center">
                      <Check className="w-5 h-5 text-status-ready" />
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Order #042</div>
                      <div className="font-semibold text-sm">Ready for pickup</div>
                    </div>
                  </div>
                </motion.div>
                <motion.div
                  initial={{ opacity: 0, y: -20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.7 }}
                  className="absolute -top-4 -right-4 bg-gradient-coffee text-primary-foreground rounded-2xl shadow-warm p-4 w-44"
                >
                  <div className="text-xs text-accent">Today's Revenue</div>
                  <div className="font-mono text-xl font-bold">PKR 47,820</div>
                  <div className="text-xs text-primary-foreground/70 mt-0.5">↑ 23% vs yesterday</div>
                </motion.div>
              </motion.div>
            </div>
          </div>
        </section>

        {/* FEATURES */}
        <section id="features" className="py-20 lg:py-28">
          <div className="container mx-auto px-4 lg:px-8">
            <div className="text-center max-w-2xl mx-auto mb-16">
              <div className="inline-block px-3 py-1 rounded-full bg-secondary/10 text-secondary text-xs font-medium mb-4">
                EVERYTHING YOU NEED
              </div>
              <h2 className="font-display text-4xl md:text-5xl font-bold text-balance">
                Built for the way restaurants really work
              </h2>
              <p className="mt-4 text-lg text-muted-foreground">
                From the first scan to the final receipt — every detail, perfectly orchestrated.
              </p>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {features.map((f, i) => (
                <motion.div
                  key={f.title}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.05 }}
                  className="group p-7 rounded-2xl bg-card border hover:shadow-warm transition-all hover:-translate-y-1"
                >
                  <div className="w-12 h-12 rounded-xl bg-gradient-warm flex items-center justify-center mb-5 shadow-soft group-hover:shadow-glow transition">
                    <f.icon className="w-6 h-6 text-accent-foreground" />
                  </div>
                  <h3 className="font-display text-xl font-semibold mb-2">{f.title}</h3>
                  <p className="text-muted-foreground text-sm leading-relaxed">{f.description}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* SHOWCASE */}
        <section className="py-20 lg:py-28 bg-muted/40">
          <div className="container mx-auto px-4 lg:px-8 grid lg:grid-cols-2 gap-12 items-center">
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
            >
              <img
                src={featureImg}
                loading="lazy"
                alt="QR ordering on phone with coffee and pastry"
                width={1200}
                height={1200}
                className="rounded-3xl shadow-warm w-full"
              />
            </motion.div>
            <motion.div
              initial={{ opacity: 0, x: 30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
            >
              <h2 className="font-display text-4xl md:text-5xl font-bold mb-6 text-balance">
                One scan. Endless possibilities.
              </h2>
              <p className="text-lg text-muted-foreground mb-8 leading-relaxed">
                Your customers scan a QR code, browse your beautifully presented menu, place their order, and track it in real-time. No app downloads. No friction. Just frictionless service.
              </p>
              <ul className="space-y-3 mb-8">
                {[
                  "Beautiful, mobile-first menu — instantly",
                  "Live order status from kitchen to counter",
                  "Token-based pickup — no name shouting",
                  "Built-in analytics for every order",
                ].map((p) => (
                  <li key={p} className="flex items-start gap-3">
                    <div className="mt-0.5 w-5 h-5 rounded-full bg-secondary/15 flex items-center justify-center shrink-0">
                      <Check className="w-3 h-3 text-secondary" />
                    </div>
                    <span className="text-foreground">{p}</span>
                  </li>
                ))}
              </ul>
              <Button size="lg" onClick={() => navigate(ctaHref)} className="bg-secondary hover:bg-secondary-hover text-secondary-foreground h-12 px-7">
                Get Started Free <ArrowRight className="ml-2 w-4 h-4" />
              </Button>
            </motion.div>
          </div>
        </section>

        {/* SECURITY */}
        <section id="security" className="py-20 lg:py-28">
          <div className="container mx-auto px-4 lg:px-8">
            <div className="text-center max-w-2xl mx-auto mb-16">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-secondary/10 text-secondary text-xs font-medium mb-4">
                <ShieldCheck className="w-3.5 h-3.5" /> TRUST &amp; SECURITY
              </div>
              <h2 className="font-display text-4xl md:text-5xl font-bold text-balance">
                Security isn't an afterthought
              </h2>
              <p className="mt-4 text-lg text-muted-foreground">
                Every order that flows through QuickWaiters is verified server-side — here's exactly what that means for you and your customers.
              </p>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
              {securityPoints.map((s, i) => (
                <motion.div
                  key={s.title}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.05 }}
                  className="p-6 rounded-2xl bg-card border border-secondary/20 hover:shadow-warm transition-all"
                >
                  <div className="w-11 h-11 rounded-xl bg-secondary/10 flex items-center justify-center mb-4">
                    <s.icon className="w-5 h-5 text-secondary" />
                  </div>
                  <h3 className="font-display text-base font-semibold mb-2">{s.title}</h3>
                  <p className="text-muted-foreground text-sm leading-relaxed">{s.description}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-24">
          <div className="container mx-auto px-4 lg:px-8">
            <div className="relative overflow-hidden rounded-3xl bg-gradient-coffee p-12 lg:p-20 text-center shadow-warm">
              <div className="absolute inset-0 pattern-warm opacity-30" />
              <div className="relative max-w-2xl mx-auto">
                <h2 className="font-display text-4xl md:text-5xl font-bold text-primary-foreground mb-5 text-balance">
                  Ready to transform your service?
                </h2>
                <p className="text-lg text-primary-foreground/80 mb-8">
                  Start your 14-day free trial. No credit card required. Cancel anytime.
                </p>
                <Button size="lg" onClick={() => navigate(ctaHref)} className="bg-accent hover:bg-accent-hover text-accent-foreground h-13 px-8 text-base shadow-glow font-semibold">
                  Start Free Trial <ArrowRight className="ml-2 w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>
        </section>

        <MarketingFooter />
      </div>
    </>
  );
}
