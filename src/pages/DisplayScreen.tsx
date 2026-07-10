import { useEffect, useState, useCallback } from "react";
import { useParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ChefHat, CheckCircle, Bell, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { format, formatDistanceToNowStrict } from "date-fns";
import { SEO } from "@/components/SEO";
import { Badge } from "@/components/ui/badge";

interface Order {
  id: string; token_number: number; status: string;
  items: Array<{ name: string; quantity: number }>; created_at: string;
}
interface Business { id: string; name: string; }

export default function DisplayScreen() {
  const { slug } = useParams();
  const [business, setBusiness] = useState<Business | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [now, setNow] = useState(new Date());
  const [loading, setLoading] = useState(true);

  // customer_name isn't selected here — it's revoked from the anon role
  // (this screen runs unauthenticated on a public display) since it's
  // real PII with no reason to be visible outside the business's own
  // staff. The token number is what customers actually watch for.
  //
  // Goes through a SECURITY DEFINER RPC scoped by business slug rather
  // than a raw table query — orders has no public SELECT policy (that
  // would otherwise let anyone list every active order across every
  // business on the platform, not just this one's).
  const load = useCallback(async (bizSlug: string) => {
    const { data } = await supabase.rpc("get_active_orders_for_display", { p_business_slug: bizSlug });
    if (data) setOrders(data as unknown as Order[]);
  }, []);

  useEffect(() => {
    (async () => {
      const { data: biz } = await supabase.from("businesses").select("id,name").eq("slug", slug!).maybeSingle();
      if (!biz) { setLoading(false); return; }
      setBusiness(biz as Business);
      await load(slug!);
      setLoading(false);
    })();
  }, [slug, load]);

  // Polls instead of a postgres_changes subscription, for the same RLS
  // reason as above — realtime is gated by the same policy a regular
  // SELECT would need, which this table intentionally no longer grants
  // to anon at large.
  useEffect(() => {
    if (!business || !slug) return;
    const poll = setInterval(() => load(slug), 5000);
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => { clearInterval(poll); clearInterval(t); };
  }, [business, slug, load]);

  if (loading) return <div className="min-h-screen bg-primary flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-accent" /></div>;
  if (!business) return <div className="min-h-screen bg-primary flex items-center justify-center text-primary-foreground">Business not found</div>;

  const preparing = orders.filter((o) => o.status === "preparing");
  const ready = orders.filter((o) => o.status === "ready");

  return (
    <>
      <SEO title={`Display — ${business.name}`} description="Order display screen" noIndex />
      <div className="min-h-screen bg-gradient-coffee text-primary-foreground p-6 lg:p-10">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-10">
            <h1 className="font-display text-5xl lg:text-7xl font-bold mb-2">{business.name}</h1>
            <p className="text-2xl text-primary-foreground/70">Order Status</p>
            <div className="text-lg text-accent mt-2 font-mono">{format(now, "EEEE, MMM d · h:mm a")}</div>
          </div>

          <div className="grid lg:grid-cols-2 gap-8">
            {/* Preparing */}
            <div className="bg-white/5 backdrop-blur rounded-3xl p-6 lg:p-8 border border-white/10">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-14 h-14 rounded-full bg-status-preparing flex items-center justify-center"><ChefHat className="w-7 h-7" /></div>
                <div>
                  <h2 className="font-display text-2xl lg:text-3xl font-bold">Now Preparing</h2>
                  <p className="text-primary-foreground/60 text-sm">Your order is being made</p>
                </div>
              </div>
              <div className="space-y-3">
                <AnimatePresence>
                  {preparing.map((o) => (
                    <motion.div key={o.id} layout initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}
                      className="bg-white/10 backdrop-blur rounded-2xl p-5 border-2 border-status-preparing/50">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-mono text-5xl font-bold text-status-preparing">#{o.token_number}</span>
                        <Badge className="bg-status-preparing text-white text-base px-3 py-1">{formatDistanceToNowStrict(new Date(o.created_at))}</Badge>
                      </div>
                      <p className="text-primary-foreground/80 text-sm truncate">{o.items.map((i) => `${i.quantity}× ${i.name}`).join(", ")}</p>
                    </motion.div>
                  ))}
                </AnimatePresence>
                {preparing.length === 0 && <p className="text-center text-primary-foreground/40 py-12 text-lg">No orders in preparation</p>}
              </div>
            </div>

            {/* Ready */}
            <div className="bg-white/5 backdrop-blur rounded-3xl p-6 lg:p-8 border border-white/10">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-14 h-14 rounded-full bg-status-ready flex items-center justify-center"><CheckCircle className="w-7 h-7" /></div>
                <div>
                  <h2 className="font-display text-2xl lg:text-3xl font-bold">Ready for Pickup</h2>
                  <p className="text-primary-foreground/60 text-sm">Please collect your order</p>
                </div>
              </div>
              <div className="space-y-3">
                <AnimatePresence>
                  {ready.map((o) => (
                    <motion.div key={o.id} layout initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}
                      className="bg-gradient-sage rounded-2xl p-5 shadow-warm">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-6xl font-bold text-secondary-foreground">#{o.token_number}</span>
                        <motion.div animate={{ scale: [1, 1.15, 1] }} transition={{ repeat: Infinity, duration: 1.5 }}>
                          <Bell className="w-10 h-10 text-secondary-foreground" />
                        </motion.div>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
                {ready.length === 0 && <p className="text-center text-primary-foreground/40 py-12 text-lg">No orders ready</p>}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
