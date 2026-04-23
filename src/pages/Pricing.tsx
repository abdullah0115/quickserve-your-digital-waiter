import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Check, Crown, ArrowRight, Building2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SEO } from "@/components/SEO";
import { MarketingNav, MarketingFooter } from "@/components/marketing/MarketingShell";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

interface Plan {
  id: string;
  name: string;
  slug: string;
  price_monthly: number;
  price_yearly: number;
  features: string[];
  display_order: number;
}

export default function Pricing() {
  const [period, setPeriod] = useState<"monthly" | "yearly">("monthly");
  const [plans, setPlans] = useState<Plan[]>([]);

  useEffect(() => {
    supabase
      .from("subscription_plans")
      .select("*")
      .eq("is_active", true)
      .order("display_order")
      .then(({ data }) => {
        if (data) setPlans(data as unknown as Plan[]);
      });
  }, []);

  const getPrice = (p: Plan) => (period === "monthly" ? p.price_monthly : Math.round(p.price_yearly / 12));
  const isPopular = (slug: string) => slug === "starter";

  return (
    <>
      <SEO
        title="Pricing — QuickServe"
        description="Simple, transparent pricing for restaurants and cafes of every size. Start free for 14 days. No credit card required."
      />
      <div className="min-h-screen bg-background">
        <MarketingNav />

        <section className="container mx-auto px-4 lg:px-8 pt-16 pb-12 text-center">
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-accent/15 border border-accent/30 mb-5">
              <Sparkles className="w-3.5 h-3.5 text-accent" />
              <span className="text-xs font-medium">Simple, fair pricing</span>
            </div>
            <h1 className="font-display text-5xl md:text-6xl font-bold text-balance">
              Pricing that scales with you
            </h1>
            <p className="mt-5 text-lg text-muted-foreground max-w-xl mx-auto">
              Start free. Upgrade as you grow. No hidden fees, no surprises — ever.
            </p>

            <div className="mt-10 inline-flex items-center bg-muted rounded-full p-1.5 border">
              <button
                onClick={() => setPeriod("monthly")}
                className={cn(
                  "px-5 py-2 rounded-full text-sm font-medium transition",
                  period === "monthly" ? "bg-background shadow-soft text-foreground" : "text-muted-foreground"
                )}
              >
                Monthly
              </button>
              <button
                onClick={() => setPeriod("yearly")}
                className={cn(
                  "px-5 py-2 rounded-full text-sm font-medium transition flex items-center gap-2",
                  period === "yearly" ? "bg-background shadow-soft text-foreground" : "text-muted-foreground"
                )}
              >
                Yearly
                <span className="text-xs px-1.5 py-0.5 rounded-full bg-secondary text-secondary-foreground">Save 17%</span>
              </button>
            </div>
          </motion.div>
        </section>

        <section className="container mx-auto px-4 lg:px-8 pb-16">
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-7xl mx-auto">
            {plans.map((plan, i) => {
              const popular = isPopular(plan.slug);
              const isEnt = plan.slug === "enterprise";
              return (
                <motion.div
                  key={plan.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.07 }}
                  className={cn(
                    "relative rounded-3xl border bg-card p-7 flex flex-col",
                    popular && "border-accent shadow-warm scale-[1.02] lg:scale-105 ring-1 ring-accent/20",
                  )}
                >
                  {popular && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-gradient-warm text-accent-foreground text-xs font-semibold shadow-soft">
                      MOST POPULAR
                    </div>
                  )}
                  <div className="mb-5">
                    {isEnt && <Crown className="w-5 h-5 text-accent mb-2" />}
                    <h3 className="font-display text-xl font-bold">{plan.name}</h3>
                  </div>

                  <div className="mb-6">
                    {isEnt ? (
                      <div className="font-display text-3xl font-bold">Custom</div>
                    ) : plan.price_monthly === 0 && plan.slug === "free" ? (
                      <>
                        <div className="font-mono text-4xl font-bold">PKR 0</div>
                        <div className="text-sm text-muted-foreground mt-1">14-day trial</div>
                      </>
                    ) : (
                      <>
                        <div className="flex items-baseline gap-1">
                          <span className="font-mono text-4xl font-bold">PKR {getPrice(plan).toLocaleString()}</span>
                          <span className="text-muted-foreground text-sm">/mo</span>
                        </div>
                        {period === "yearly" && (
                          <div className="text-xs text-secondary mt-1">Billed PKR {plan.price_yearly.toLocaleString()}/year</div>
                        )}
                      </>
                    )}
                  </div>

                  <ul className="space-y-3 mb-8 flex-1">
                    {(plan.features ?? []).map((f) => (
                      <li key={f} className="flex items-start gap-2.5 text-sm">
                        <Check className="w-4 h-4 text-secondary mt-0.5 flex-shrink-0" />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>

                  <Link to={isEnt ? "#" : "/auth?mode=signup"}>
                    <Button
                      className={cn(
                        "w-full",
                        popular
                          ? "bg-primary hover:bg-primary-hover text-primary-foreground"
                          : isEnt
                          ? "bg-foreground hover:bg-foreground/90 text-background"
                          : "bg-card border border-border text-foreground hover:bg-muted"
                      )}
                    >
                      {isEnt ? "Contact Sales" : plan.slug === "free" ? "Start Free Trial" : "Get Started"}
                      <ArrowRight className="ml-2 w-4 h-4" />
                    </Button>
                  </Link>
                </motion.div>
              );
            })}
          </div>

          <div className="mt-16 max-w-4xl mx-auto rounded-3xl bg-gradient-coffee p-10 text-center text-primary-foreground">
            <Building2 className="w-10 h-10 mx-auto mb-4 text-accent" />
            <h3 className="font-display text-2xl font-bold mb-3">Need something more?</h3>
            <p className="text-primary-foreground/80 mb-6 max-w-xl mx-auto">
              Multi-location chains, custom integrations, and white-label options. Let's talk.
            </p>
            <Button className="bg-accent hover:bg-accent-hover text-accent-foreground">Contact Sales</Button>
          </div>
        </section>

        <MarketingFooter />
      </div>
    </>
  );
}
