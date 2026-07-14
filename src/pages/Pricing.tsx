import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Check, MapPin, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SEO } from "@/components/SEO";
import { MarketingNav, MarketingFooter } from "@/components/marketing/MarketingShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

type Region = "Pakistan" | "International";

interface PlanConfig {
  plan_type: string;
  name: string;
  currency: string | null;
  monthly_price: number;
  setup_fee: number;
  features: string[];
  requires_city_match: boolean;
  display_order: number;
}

// Which plan_type shows under each region toggle. Trial is region-independent
// (it's the same everywhere) so it's shown in both.
const REGION_PLANS: Record<Region, string[]> = {
  Pakistan: ["trial", "self_serve_pkr", "managed_pkr"],
  International: ["trial", "international_usd"],
};

export default function Pricing() {
  const { user } = useAuth();
  const [plans, setPlans] = useState<PlanConfig[]>([]);
  const [region, setRegion] = useState<Region>("Pakistan");
  const [managedEligible, setManagedEligible] = useState(true); // true = show without a caveat until we know otherwise

  useEffect(() => {
    supabase
      .from("plan_configs")
      .select("*")
      .eq("is_active", true)
      .order("display_order")
      .then(({ data }) => {
        if (data) setPlans(data as unknown as PlanConfig[]);
      });
  }, []);

  // If a logged-in business owner is viewing this to upgrade, default the
  // region toggle to where their business actually is, and check their real
  // city against the Managed Setup coverage list — otherwise (anonymous
  // visitor, no business yet) the toggle defaults to Pakistan and Managed
  // Setup is shown with a "Karachi only" note rather than a hard guess.
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: biz } = await supabase
        .from("businesses")
        .select("country, city")
        .eq("owner_id", user.id)
        .limit(1)
        .maybeSingle();
      if (!biz) return;
      if (biz.country && biz.country !== "Pakistan") setRegion("International");
      if (biz.city) {
        const { data: eligible } = await supabase.rpc("is_managed_setup_eligible", { p_city: biz.city });
        setManagedEligible(!!eligible);
      }
    })();
  }, [user]);

  const visiblePlans = REGION_PLANS[region]
    .map((type) => plans.find((p) => p.plan_type === type))
    .filter((p): p is PlanConfig => !!p);

  const formatPrice = (p: PlanConfig) => {
    if (p.plan_type === "trial") return "Free";
    const symbol = p.currency === "USD" ? "$" : "PKR ";
    return `${symbol}${p.monthly_price.toLocaleString()}`;
  };

  const trialFollowUpPrice = () => {
    const followUp = region === "Pakistan"
      ? plans.find((p) => p.plan_type === "self_serve_pkr")
      : plans.find((p) => p.plan_type === "international_usd");
    if (!followUp) return null;
    const symbol = followUp.currency === "USD" ? "$" : "PKR ";
    return `${symbol}${followUp.monthly_price.toLocaleString()}/mo`;
  };

  return (
    <>
      <SEO
        title="Pricing — QuickWaiterz"
        description="Simple, transparent pricing for restaurants and cafes. 14-day free trial, then Self-Serve, Managed Setup, or International plans."
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
              14-day free trial, then {trialFollowUpPrice() ?? "a plan that fits"}. No hidden fees.
            </p>

            <div className="mt-10 inline-flex items-center bg-muted rounded-full p-1.5 border">
              <button
                onClick={() => setRegion("Pakistan")}
                className={cn(
                  "px-5 py-2 rounded-full text-sm font-medium transition",
                  region === "Pakistan" ? "bg-background shadow-soft text-foreground" : "text-muted-foreground"
                )}
              >
                Pakistan (PKR)
              </button>
              <button
                onClick={() => setRegion("International")}
                className={cn(
                  "px-5 py-2 rounded-full text-sm font-medium transition",
                  region === "International" ? "bg-background shadow-soft text-foreground" : "text-muted-foreground"
                )}
              >
                International (USD)
              </button>
            </div>
          </motion.div>
        </section>

        <section className="container mx-auto px-4 lg:px-8 pb-16">
          <div className={cn("grid gap-6 max-w-5xl mx-auto", region === "Pakistan" ? "md:grid-cols-3" : "md:grid-cols-2 max-w-3xl")}>
            {visiblePlans.map((plan, i) => {
              const isTrial = plan.plan_type === "trial";
              const isManaged = plan.plan_type === "managed_pkr";
              const popular = plan.plan_type === "self_serve_pkr";
              return (
                <motion.div
                  key={plan.plan_type}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.07 }}
                  className={cn(
                    "relative rounded-3xl border bg-card p-7 flex flex-col",
                    popular && "border-accent shadow-warm scale-[1.02] ring-1 ring-accent/20",
                  )}
                >
                  {popular && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-gradient-warm text-accent-foreground text-xs font-semibold shadow-soft">
                      MOST POPULAR
                    </div>
                  )}
                  <div className="mb-5">
                    <h3 className="font-display text-xl font-bold">{plan.name}</h3>
                    {isManaged && (
                      <div className="inline-flex items-center gap-1 text-xs text-secondary mt-1.5">
                        <MapPin className="w-3 h-3" /> Karachi & select cities only
                      </div>
                    )}
                  </div>

                  <div className="mb-2">
                    <div className="flex items-baseline gap-1">
                      <span className="font-mono text-4xl font-bold">{formatPrice(plan)}</span>
                      {!isTrial && <span className="text-muted-foreground text-sm">/mo</span>}
                    </div>
                    {isTrial && <div className="text-sm text-muted-foreground mt-1">14 days, no credit card</div>}
                    {isManaged && plan.setup_fee > 0 && (
                      <div className="text-xs text-secondary mt-1">
                        + PKR {plan.setup_fee.toLocaleString()} one-time setup fee
                      </div>
                    )}
                  </div>
                  {!isTrial && (
                    <p className="text-xs text-muted-foreground mb-4">
                      Taxes may apply and will be calculated at checkout.
                    </p>
                  )}
                  {isTrial && <div className="mb-4" />}

                  <ul className="space-y-3 mb-8 flex-1">
                    {(plan.features ?? []).map((f) => (
                      <li key={f} className="flex items-start gap-2.5 text-sm">
                        <Check className="w-4 h-4 text-secondary mt-0.5 shrink-0" />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>

                  <Link to="/auth?mode=signup">
                    <Button
                      className={cn(
                        "w-full",
                        popular
                          ? "bg-primary hover:bg-primary-hover text-primary-foreground"
                          : "bg-card border border-border text-foreground hover:bg-muted"
                      )}
                    >
                      {isTrial ? "Start Free Trial" : "Get Started"}
                    </Button>
                  </Link>
                  {isManaged && !managedEligible && (
                    <p className="text-xs text-destructive mt-2 text-center">
                      Managed Setup isn't available in your city yet — you can still use Self-Serve.
                    </p>
                  )}
                </motion.div>
              );
            })}
          </div>

          {region === "Pakistan" && (
            <p className="text-center text-sm text-muted-foreground mt-8">
              Not in Karachi? You can still use the Self-Serve plan anywhere in Pakistan — just print your own QR codes.
            </p>
          )}
        </section>

        <MarketingFooter />
      </div>
    </>
  );
}
