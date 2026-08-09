import { useEffect, useState } from "react";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Clock, ChefHat, CheckCircle, Bell, RefreshCw, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";
import { SEO } from "@/components/SEO";
import { cn } from "@/lib/utils";
import { addOrderToHistory, updateOrderHistoryStatus } from "@/lib/orderHistory";
import { playNotificationSound, unlockNotificationAudio, showBrowserNotification } from "@/lib/notificationSound";
import { ORDER_STATUS_LABEL, ACTIVE_ORDER_STATUSES } from "@/hooks/useMyOrders";

interface Order {
  id: string; token_number: number; status: "pending" | "preparing" | "ready" | "completed" | "cancelled";
  customer_name: string; items: Array<{ name: string; quantity: number; price: number; added_by_name?: string }>;
  total_amount: number; created_at: string; business_id: string;
  table_number: string | null; qr_code_id: string | null; order_type: "dine_in" | "takeaway";
}
interface Business { name: string; slug: string; id: string; }

const STEPS = [
  { status: "pending" as const, icon: Clock, label: "Order Received" },
  { status: "preparing" as const, icon: ChefHat, label: "Being Prepared" },
  { status: "ready" as const, icon: CheckCircle, label: "Ready for Pickup" },
];
const idx = (s: string) => STEPS.findIndex((x) => x.status === s);

// The status poll is this app's single largest source of Supabase egress —
// one request every few seconds for every customer waiting on an order. The
// first couple of minutes after opening the page are when someone is
// actually watching the screen, so those stay snappy; a tab left open
// through a twenty-minute wait doesn't need the same rate. Returning to the
// tab resets the clock (see onForeground), so it always feels live to
// anyone actually looking at it.
function pollDelayFor(msSinceActive: number): number {
  if (msSinceActive < 2 * 60_000) return 5_000;
  if (msSinceActive < 10 * 60_000) return 10_000;
  return 20_000;
}

export default function OrderStatus() {
  const { slug, token } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const orderId = params.get("id");
  const [order, setOrder] = useState<Order | null>(null);
  const [business, setBusiness] = useState<Business | null>(null);
  const [loading, setLoading] = useState(true);
  const [needsPhone, setNeedsPhone] = useState(false);
  const [phone, setPhone] = useState("");
  const [checkingPhone, setCheckingPhone] = useState(false);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: biz } = await supabase.from("businesses").select("name,slug,id").eq("slug", slug!).maybeSingle();
      if (!biz) { setLoading(false); setNotFound(true); return; }
      setBusiness(biz as Business);

      if (orderId) {
        const { data } = await supabase
          .rpc("get_order_status", { p_business_slug: slug!, p_order_id: orderId })
          .maybeSingle();
        if (data) {
          setOrder(data as unknown as Order);
          addOrderToHistory(slug!, { id: data.id, tokenNumber: data.token_number });
          updateOrderHistoryStatus(slug!, data.id, data.status);
        } else {
          setNotFound(true);
        }
        setLoading(false);
      } else {
        // No capability id in the URL (e.g. a manually-typed /slug/order/:token link) —
        // require the phone number the order was placed with before revealing anything.
        setNeedsPhone(true);
        setLoading(false);
      }
    })();
  }, [slug, orderId]);

  // Polls get_order_status instead of subscribing to postgres_changes —
  // orders has no public SELECT policy (a guest customer must never be
  // able to list other tables'/businesses' orders), and Realtime honors
  // the same RLS as a regular SELECT, so a table-level subscription isn't
  // available here. The RPC is a point lookup by this order's own id,
  // which the customer already had to know to be on this page at all.
  useEffect(() => {
    if (!order?.id || !slug) return;
    if (!ACTIVE_ORDER_STATUSES.has(order.status)) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Reset whenever the customer comes back to the tab — see pollDelayFor.
    let activeSince = Date.now();

    const fetchStatus = async () => {
      const { data } = await supabase
        .rpc("get_order_status", { p_business_slug: slug, p_order_id: order.id })
        .maybeSingle();
      if (cancelled) return true;
      if (!data) return false;
      const next = data as unknown as Partial<Order>;
      setOrder((prev) => {
        if (!prev) return prev;
        if (next.status && next.status !== prev.status) {
          // Alerting the customer is a nicety layered on top of the status
          // update itself — a failure in any of these must never stop the
          // status change (below) from actually being applied.
          try {
            updateOrderHistoryStatus(slug, prev.id, next.status);
            const label = ORDER_STATUS_LABEL[next.status] ?? next.status;
            toast.info(`Order #${prev.token_number} — ${label}`);
            playNotificationSound();
            showBrowserNotification(`Order #${prev.token_number} — ${label}`, {
              body: next.status === "ready" ? "Please collect from the counter" : undefined,
              icon: "/pwa-192x192.png",
            });
          } catch {
            // Already logged nowhere useful to the customer — the status
            // update itself below still goes through regardless.
          }
        }
        return { ...prev, ...next };
      });
      // Terminal status — nothing left to poll for.
      return Boolean(next.status && !ACTIVE_ORDER_STATUSES.has(next.status));
    };

    const schedule = () => {
      if (cancelled) return;
      timer = setTimeout(tick, pollDelayFor(Date.now() - activeSince));
    };

    const tick = async () => {
      const done = await fetchStatus();
      if (!done) schedule();
    };

    schedule();

    // Mobile browsers throttle or fully suspend timers while a tab is
    // backgrounded (screen locked, customer switched to another app while
    // waiting for food) — exactly the moment a status change matters most.
    // Timers don't reliably catch up on their own once foregrounded again,
    // so poll immediately on return instead of waiting on the next
    // scheduled tick — this is what used to require a manual reload.
    // Coming back also restarts the fast-polling window, since a customer
    // who just opened the tab is the one actually watching it.
    const onForeground = () => {
      if (document.visibilityState !== "visible") return;
      activeSince = Date.now();
      if (timer) clearTimeout(timer);
      void tick();
    };
    document.addEventListener("visibilitychange", onForeground);
    window.addEventListener("focus", onForeground);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onForeground);
      window.removeEventListener("focus", onForeground);
    };
    // Only re-run on id/slug change (not every status tick) — the loop
    // stops itself once a terminal status is reached.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order?.id, slug]);

  // Audio and the native notification prompt both need a real user gesture
  // first — ask for both on the first tap/keypress so status changes can
  // alert even while this tab is in the background/minimized.
  useEffect(() => {
    if (!order || !ACTIVE_ORDER_STATUSES.has(order.status)) return;
    const unlock = () => {
      unlockNotificationAudio();
      if ("Notification" in window && Notification.permission === "default") {
        Notification.requestPermission();
      }
    };
    document.addEventListener("pointerdown", unlock, { once: true });
    document.addEventListener("keydown", unlock, { once: true });
    return () => {
      document.removeEventListener("pointerdown", unlock);
      document.removeEventListener("keydown", unlock);
    };
  }, [order?.id, order?.status]);

  const lookupByPhone = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone.trim()) return toast.error("Enter the phone number used for this order");
    setCheckingPhone(true);
    const { data } = await supabase
      .rpc("get_order_status", { p_business_slug: slug!, p_token_number: Number(token), p_customer_phone: phone.trim() })
      .maybeSingle();
    if (data) {
      setOrder(data as unknown as Order);
      addOrderToHistory(slug!, { id: data.id, tokenNumber: data.token_number });
      updateOrderHistoryStatus(slug!, data.id, data.status);
      setNeedsPhone(false);
    } else {
      toast.error("No matching order found for that phone number");
    }
    setCheckingPhone(false);
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin" /></div>;

  if (business && needsPhone && !order) {
    return (
      <>
        <SEO title={`Order #${token} — ${business.name}`} description={`Track your order at ${business.name}`} noIndex />
        <div className="min-h-screen bg-gradient-hero pattern-warm flex items-center justify-center px-4">
          <Card className="w-full max-w-sm shadow-warm border-border/60">
            <CardContent className="p-8">
              <h1 className="font-display text-2xl font-bold mb-1 text-center">Track order #{token}</h1>
              <p className="text-sm text-muted-foreground mb-6 text-center">Enter the phone number you used to place this order.</p>
              <form onSubmit={lookupByPhone} className="space-y-4">
                <div>
                  <Label htmlFor="phone">Phone number</Label>
                  <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+92 300 1234567" className="mt-1.5" />
                </div>
                <Button type="submit" disabled={checkingPhone} className="w-full bg-primary hover:bg-primary-hover text-primary-foreground h-11">
                  {checkingPhone ? <Loader2 className="w-4 h-4 animate-spin" /> : "View order status"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </>
    );
  }

  if (notFound || !order || !business) return (
    <div className="min-h-screen flex items-center justify-center text-center px-4">
      <div><p className="text-muted-foreground mb-4">Order not found</p><Button onClick={() => navigate(`/${slug}`)}>Back</Button></div>
    </div>
  );

  const currentIdx = idx(order.status);
  const statusText = order.status === "ready" ? "Ready!" : order.status === "preparing" ? "Being Prepared" : order.status === "completed" ? "Complete" : "Confirmed";

  return (
    <>
      <SEO title={`Order #${order.token_number} — ${business.name}`} description={`Track your order at ${business.name}`} noIndex />
      <div className="min-h-screen bg-gradient-hero pattern-warm py-12 px-4">
        <div className="max-w-xl mx-auto">
          <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
            <Card className="shadow-warm border-border/60">
              <CardContent className="p-8">
                {/* Token */}
                <div className="text-center mb-8">
                  <motion.div
                    initial={{ scale: 0 }} animate={{ scale: 1 }}
                    transition={{ type: "spring", stiffness: 200, damping: 15 }}
                    className="inline-flex items-center justify-center w-32 h-32 rounded-full bg-gradient-warm mb-4 shadow-warm"
                  >
                    <span className="font-mono text-5xl font-bold text-accent-foreground">#{order.token_number}</span>
                  </motion.div>
                  <h1 className="font-display text-3xl font-bold mb-1">Your order is {statusText}</h1>
                  <p className="text-sm text-muted-foreground">{business.name} · {format(new Date(order.created_at), "h:mm a")}</p>
                </div>

                {/* Steps */}
                <div className="space-y-5 mb-8">
                  {STEPS.map((step, i) => {
                    const active = currentIdx >= i;
                    const current = currentIdx === i;
                    return (
                      <motion.div key={step.status} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.15 }} className="flex items-center gap-4">
                        <div className={cn(
                          "w-12 h-12 rounded-full flex items-center justify-center transition-all",
                          active ? "bg-gradient-sage shadow-soft" : "bg-muted",
                          current && "ring-4 ring-secondary/30"
                        )}>
                          <step.icon className={cn("w-5 h-5", active ? "text-secondary-foreground" : "text-muted-foreground")} />
                        </div>
                        <div className="flex-1">
                          <p className={cn("font-semibold", active ? "text-foreground" : "text-muted-foreground")}>{step.label}</p>
                        </div>
                        {active && <CheckCircle className="w-5 h-5 text-secondary" />}
                      </motion.div>
                    );
                  })}
                </div>

                {/* Items */}
                <div className="border-t pt-5 mb-5">
                  <h3 className="font-semibold mb-3">Order Details</h3>
                  <div className="space-y-1.5">
                    {order.items.map((it, i) => (
                      <div key={i} className="flex justify-between text-sm">
                        <span className="text-muted-foreground">
                          {it.quantity}× {it.name}
                          {it.added_by_name && it.added_by_name !== order.customer_name && (
                            <span className="text-xs text-muted-foreground/70"> — added by {it.added_by_name}</span>
                          )}
                        </span>
                        <span className="font-mono">PKR {(it.price * it.quantity).toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-between pt-3 mt-3 border-t font-semibold">
                    <span>Total</span><span className="font-mono">PKR {Number(order.total_amount).toLocaleString()}</span>
                  </div>
                </div>

                <AnimatePresence>
                  {order.status === "ready" && (
                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-gradient-sage text-secondary-foreground p-6 rounded-2xl text-center mb-5">
                      <motion.div animate={{ scale: [1, 1.1, 1] }} transition={{ repeat: Infinity, duration: 1.5 }}>
                        <Bell className="w-12 h-12 mx-auto mb-2" />
                      </motion.div>
                      <h3 className="font-display text-2xl font-bold mb-1">Your order is ready!</h3>
                      <p className="text-secondary-foreground/90 text-sm">Please collect from the counter</p>
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="flex gap-3">
                  <Button variant="outline" className="flex-1" onClick={() => window.location.reload()}><RefreshCw className="w-4 h-4 mr-2" /> Refresh</Button>
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => {
                      // Carry the table/order-type forward so ordering again
                      // from the same visit doesn't lose track of which
                      // table this is for. Uses the verified qr_code_id
                      // (never a raw table number) so the new order still
                      // has to resolve its table server-side.
                      const qs = new URLSearchParams();
                      if (order.qr_code_id) qs.set("qr", order.qr_code_id);
                      if (order.order_type === "takeaway") qs.set("type", "takeaway");
                      const query = qs.toString();
                      navigate(`/${slug}/menu${query ? `?${query}` : ""}`);
                    }}
                  >
                    Order Again
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </div>
    </>
  );
}
