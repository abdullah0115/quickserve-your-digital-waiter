import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams, useNavigate, Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, ShoppingCart, ClipboardList, Search, Plus, Minus, Trash2, Star, UtensilsCrossed, Loader2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { useCart } from "@/store/cart";
import { toast } from "sonner";
import { format } from "date-fns";
import { SEO } from "@/components/SEO";
import { cn } from "@/lib/utils";
import { checkoutFormSchema, firstZodError } from "@/lib/validation";
import { addOrderToHistory } from "@/lib/orderHistory";
import { useMyOrders, ORDER_STATUS_LABEL, ACTIVE_ORDER_STATUSES } from "@/hooks/useMyOrders";

interface Business {
  id: string; name: string; slug: string;
  cover_image_url: string | null; cuisine_type: string | null; city: string | null;
}
interface Cat { id: string; name: string; display_order: number; }
interface Item {
  id: string; name: string; description: string | null; price: number;
  category_id: string | null; image_url: string | null; is_available: boolean; is_featured: boolean;
}

export default function Menu() {
  const { slug } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const qrParam = params.get("qr");
  const orderType = params.get("type") === "takeaway" ? "takeaway" : "dine_in";

  const [business, setBusiness] = useState<Business | null>(null);
  const [showWatermark, setShowWatermark] = useState(false);
  const [qrCodeId, setQrCodeId] = useState<string | null>(null);
  const [tableNumber, setTableNumber] = useState<string | null>(null);
  // Set when this table already has a pending/preparing order — switches
  // the cart into "add to order" mode instead of "place order" so 2-3
  // people scanning the same QR can each contribute to one shared order.
  const [existingOrder, setExistingOrder] = useState<{ id: string; token_number: number } | null>(null);
  const [cats, setCats] = useState<Cat[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [search, setSearch] = useState("");
  const [selectedCat, setSelectedCat] = useState("all");
  const [loading, setLoading] = useState(true);
  const [cartOpen, setCartOpen] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [checkout, setCheckout] = useState({ name: "", phone: "", notes: "" });

  const cart = useCart();
  const { orders: myOrders } = useMyOrders(slug);
  const activeOrders = myOrders.filter((o) => ACTIVE_ORDER_STATUSES.has(o.status));
  const latestActive = activeOrders[0];

  useEffect(() => {
    (async () => {
      const { data: biz } = await supabase.from("businesses").select("id,name,slug,cover_image_url,cuisine_type,city").eq("slug", slug!).maybeSingle();
      if (!biz) { setLoading(false); return; }
      setBusiness(biz as Business);
      const [c, i, w] = await Promise.all([
        supabase.from("menu_categories").select("*").eq("business_id", biz.id).eq("is_active", true).order("display_order"),
        supabase.from("menu_items").select("*").eq("business_id", biz.id).order("display_order"),
        supabase.rpc("get_business_watermark", { p_business_id: biz.id }),
      ]);
      setCats((c.data ?? []) as Cat[]);
      setItems((i.data ?? []) as unknown as Item[]);
      setShowWatermark(!!w.data);
      setLoading(false);
    })();
  }, [slug]);

  // Resolve the table number server-side from the scanned QR code's id —
  // never trust a table number typed straight into the URL. An invalid,
  // inactive, or wrong-business qr id just means "no table" (browse/order
  // still works, e.g. for takeaway), it doesn't block the page.
  useEffect(() => {
    if (!business || !qrParam) { setQrCodeId(null); setTableNumber(null); return; }
    // Point lookup via RPC, not a raw table query — qr_codes has no public
    // SELECT policy, so this is the only way to resolve a single scanned
    // id without it also being possible to list every table's QR id.
    supabase
      .rpc("resolve_qr_code", { p_qr_id: qrParam })
      .maybeSingle()
      .then(({ data }) => {
        if (data && data.is_active && data.business_id === business.id) {
          setQrCodeId(data.id);
          setTableNumber(data.table_number);
        } else {
          setQrCodeId(null);
          setTableNumber(null);
          toast.error("That QR code isn't valid — please scan the code at your table.");
        }
      });
  }, [business, qrParam]);

  // A second (or third) phone scanning the same QR should join the table's
  // existing order instead of being blocked by the one-order-per-table
  // rule — auto-detected, no extra tap needed. Only pending/preparing
  // orders are addable; once ready, the table shows as occupied via the
  // normal one-order-per-table check if someone tries to place a new one.
  const checkExistingOrder = useCallback(async () => {
    if (!qrCodeId) { setExistingOrder(null); return; }
    const { data } = await supabase
      .rpc("get_active_order_for_table", { p_qr_code_id: qrCodeId })
      .maybeSingle();
    if (data && (data.status === "pending" || data.status === "preparing")) {
      setExistingOrder({ id: data.id, token_number: data.token_number });
    } else {
      setExistingOrder(null);
    }
  }, [qrCodeId]);

  useEffect(() => { checkExistingOrder(); }, [checkExistingOrder]);

  const filtered = useMemo(() => items.filter((it) => {
    if (selectedCat !== "all" && it.category_id !== selectedCat) return false;
    if (search && !it.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }), [items, selectedCat, search]);

  const placeOrder = async () => {
    if (!business || cart.items.length === 0) return;
    const parsed = checkoutFormSchema.safeParse(checkout);
    if (!parsed.success) return toast.error(firstZodError(parsed));
    setPlacing(true);
    try {
      // Prices/total are never sent from here — the create-order function
      // (and the compute_order_total DB trigger behind it) look up real
      // menu_items prices server-side and ignore anything else we'd claim.
      const { data, error } = await supabase.functions.invoke("create-order", {
        body: {
          business_slug: slug,
          customer_name: checkout.name,
          customer_phone: checkout.phone || undefined,
          items: cart.items.map((i) => ({ menu_item_id: i.id, quantity: i.quantity })),
          qr_code_id: qrCodeId || undefined,
          order_type: orderType,
          notes: checkout.notes || undefined,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const order = data.data as { id: string; token_number: number };
      cart.clear();
      addOrderToHistory(slug!, { id: order.id, tokenNumber: order.token_number });
      toast.success(`Order #${order.token_number} placed!`);
      navigate(`/${slug}/order/${order.token_number}?id=${order.id}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to place order";
      // Race: another phone at this table created the order between us
      // loading the page and submitting ours. Recover into add-mode
      // instead of leaving the customer at a dead end.
      if (msg.toLowerCase().includes("already has an active order")) {
        await checkExistingOrder();
        toast.info("Someone else just started an order for this table — add your items to it below.");
      } else {
        toast.error(msg);
      }
    } finally { setPlacing(false); }
  };

  const addToOrder = async () => {
    if (!business || !existingOrder || cart.items.length === 0) return;
    const parsed = checkoutFormSchema.safeParse(checkout);
    if (!parsed.success) return toast.error(firstZodError(parsed));
    setPlacing(true);
    try {
      const results = await Promise.allSettled(
        cart.items.map(async (it) => {
          const { data, error } = await supabase.functions.invoke("add-order-item", {
            body: {
              order_id: existingOrder.id,
              business_slug: slug,
              menu_item_id: it.id,
              quantity: it.quantity,
              added_by_name: checkout.name,
              notes: checkout.notes || undefined,
            },
          });
          if (error) throw error;
          if (data?.error) throw new Error(data.error);
          return data.data as { item_name: string; item_quantity: number };
        }),
      );

      let anySuccess = false;
      results.forEach((r, i) => {
        if (r.status === "fulfilled") {
          anySuccess = true;
          // Immediate per-item confirmation — independent of the next
          // order-status poll picking up the change.
          toast.success(`${r.value.item_quantity}× ${r.value.item_name} added to Order #${existingOrder.token_number}`);
        } else {
          toast.error(`Couldn't add ${cart.items[i].name}: ${r.reason instanceof Error ? r.reason.message : "failed"}`);
        }
      });

      if (anySuccess) {
        cart.clear();
        setCartOpen(false);
        navigate(`/${slug}/order/${existingOrder.token_number}?id=${existingOrder.id}`);
      }
    } finally { setPlacing(false); }
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  if (!business) return <div className="min-h-screen flex items-center justify-center"><p>Business not found</p></div>;

  const cartCount = cart.count();
  const cartTotal = cart.total();

  return (
    <>
      <SEO
        title={`${business.name} Menu — Order Online | QuickWaiterz`}
        description={`Order from ${business.name}${business.cuisine_type ? ` — ${business.cuisine_type} cuisine` : ""}${business.city ? ` in ${business.city}` : ""}. Browse the digital menu and place a contactless QR code order online.`}
        image={business.cover_image_url ?? undefined}
        type="restaurant"
      />
      <div className="min-h-screen bg-background pb-32">
        {/* Header */}
        <div className="sticky top-0 z-30 bg-background/95 backdrop-blur-xl border-b">
          {latestActive && (
            <div className="bg-accent text-accent-foreground">
              <div className="container mx-auto px-4 py-2 flex items-center justify-between gap-3 text-sm">
                <span className="font-medium">
                  Order #{latestActive.tokenNumber} · {ORDER_STATUS_LABEL[latestActive.status] ?? latestActive.status}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-accent-foreground hover:bg-accent-foreground/10"
                  onClick={() => navigate(`/${slug}/order/${latestActive.tokenNumber}?id=${latestActive.id}`)}
                >
                  View status
                </Button>
              </div>
            </div>
          )}
          <div className="container mx-auto px-4 h-16 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button size="icon" variant="ghost" onClick={() => navigate(`/${slug}`)}><ArrowLeft className="w-5 h-5" /></Button>
              <div>
                <h1 className="font-display text-lg font-bold leading-tight">{business.name}</h1>
                <p className="text-xs text-muted-foreground">{orderType === "dine_in" ? `Table ${tableNumber ?? "—"}` : "Takeaway"}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {myOrders.length > 0 && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="icon" variant="outline" className="relative">
                      <ClipboardList className="w-5 h-5" />
                      {activeOrders.length > 0 && (
                        <Badge className="absolute -top-2 -right-2 bg-accent text-accent-foreground h-5 w-5 p-0 flex items-center justify-center text-xs">
                          {activeOrders.length}
                        </Badge>
                      )}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-72">
                    <div className="px-3 py-2 border-b"><h3 className="font-semibold text-sm">Your Orders</h3></div>
                    <div className="max-h-80 overflow-y-auto">
                      {myOrders.map((o) => (
                        <DropdownMenuItem
                          key={o.id}
                          className="px-3 py-2.5 cursor-pointer flex-col items-start gap-0.5"
                          onClick={() => navigate(`/${slug}/order/${o.tokenNumber}?id=${o.id}`)}
                        >
                          <div className="flex items-center justify-between w-full">
                            <span className="font-medium text-sm">Order #{o.tokenNumber}</span>
                            <span className="text-xs text-muted-foreground">{format(new Date(o.placedAt), "MMM d, h:mm a")}</span>
                          </div>
                          <span className={cn("text-xs", ACTIVE_ORDER_STATUSES.has(o.status) ? "text-accent font-medium" : "text-muted-foreground")}>
                            {ORDER_STATUS_LABEL[o.status] ?? o.status}
                          </span>
                        </DropdownMenuItem>
                      ))}
                    </div>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            <Sheet open={cartOpen} onOpenChange={setCartOpen}>
              <SheetTrigger asChild>
                <Button size="icon" variant="outline" className="relative">
                  <ShoppingCart className="w-5 h-5" />
                  {cartCount > 0 && <Badge className="absolute -top-2 -right-2 bg-accent text-accent-foreground h-5 w-5 p-0 flex items-center justify-center text-xs">{cartCount}</Badge>}
                </Button>
              </SheetTrigger>
              <SheetContent className="w-full sm:max-w-md flex flex-col">
                <SheetHeader><SheetTitle className="font-display">Your Order</SheetTitle></SheetHeader>
                {existingOrder && (
                  <div className="bg-accent/10 border border-accent/30 rounded-lg px-3 py-2 text-xs text-foreground">
                    This table already has an active order <strong>#{existingOrder.token_number}</strong> — your items will be added to it.
                  </div>
                )}
                <div className="flex-1 overflow-auto py-4 space-y-3">
                  {cart.items.length === 0 && <p className="text-center text-muted-foreground py-12">Cart is empty</p>}
                  {cart.items.map((it) => (
                    <div key={it.id} className="flex gap-3 p-3 rounded-xl border">
                      <div className="flex-1">
                        <div className="font-medium text-sm">{it.name}</div>
                        <div className="text-xs text-muted-foreground mb-2">PKR {it.price}</div>
                        <div className="flex items-center gap-1">
                          <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => cart.updateQuantity(it.id, -1)}><Minus className="w-3 h-3" /></Button>
                          <span className="w-8 text-center text-sm font-mono">{it.quantity}</span>
                          <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => cart.updateQuantity(it.id, 1)}><Plus className="w-3 h-3" /></Button>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-mono font-semibold">PKR {it.price * it.quantity}</div>
                        <Button size="icon" variant="ghost" className="h-7 w-7 mt-1" onClick={() => cart.removeItem(it.id)}><Trash2 className="w-3 h-3 text-destructive" /></Button>
                      </div>
                    </div>
                  ))}
                </div>
                {cart.items.length > 0 && (
                  <div className="border-t pt-4 space-y-3">
                    <Input placeholder="Your name *" value={checkout.name} onChange={(e) => setCheckout({ ...checkout, name: e.target.value })} />
                    <Input placeholder="Phone (optional)" value={checkout.phone} onChange={(e) => setCheckout({ ...checkout, phone: e.target.value })} />
                    <Textarea rows={2} placeholder="Special requests" value={checkout.notes} onChange={(e) => setCheckout({ ...checkout, notes: e.target.value })} />
                    <div className="flex justify-between text-lg font-semibold py-2">
                      <span>Total</span><span className="font-mono">PKR {cartTotal.toLocaleString()}</span>
                    </div>
                    <Button onClick={existingOrder ? addToOrder : placeOrder} disabled={placing} size="lg" className="w-full bg-secondary hover:bg-secondary-hover text-secondary-foreground">
                      {placing ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : existingOrder ? (
                        <>Add to Order #{existingOrder.token_number} <Check className="ml-2 w-4 h-4" /></>
                      ) : (
                        <>Place Order <Check className="ml-2 w-4 h-4" /></>
                      )}
                    </Button>
                  </div>
                )}
              </SheetContent>
            </Sheet>
            </div>
          </div>
          {/* Search */}
          <div className="container mx-auto px-4 pb-3">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-9" placeholder="Search menu..." value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </div>
          {/* Categories */}
          <div className="container mx-auto px-4 pb-3 overflow-x-auto">
            <div className="flex gap-2 min-w-max">
              <Button size="sm" variant={selectedCat === "all" ? "default" : "outline"} className={selectedCat === "all" ? "bg-primary text-primary-foreground" : ""} onClick={() => setSelectedCat("all")}>All</Button>
              {cats.map((c) => (
                <Button key={c.id} size="sm" variant={selectedCat === c.id ? "default" : "outline"} className={selectedCat === c.id ? "bg-primary text-primary-foreground" : ""} onClick={() => setSelectedCat(c.id)}>
                  {c.name}
                </Button>
              ))}
            </div>
          </div>
        </div>

        {/* Items */}
        <div className="container mx-auto px-4 py-6">
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((it) => {
              const inCart = cart.items.find((c) => c.id === it.id);
              return (
                <motion.div key={it.id} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} className={cn("rounded-2xl border bg-card overflow-hidden", !it.is_available && "opacity-50")}>
                  <div className="relative">
                    {it.image_url ? (
                      <img src={it.image_url} alt={it.name} className="w-full aspect-4/3 object-cover" />
                    ) : (
                      <div className="w-full aspect-4/3 bg-gradient-warm flex items-center justify-center"><UtensilsCrossed className="w-10 h-10 text-accent-foreground" /></div>
                    )}
                    {it.is_featured && <Badge className="absolute top-2 right-2 bg-accent text-accent-foreground"><Star className="w-3 h-3 mr-0.5 fill-current" />Popular</Badge>}
                    {!it.is_available && <div className="absolute inset-0 bg-black/40 flex items-center justify-center"><span className="bg-card px-3 py-1 rounded-full text-sm font-medium">Out of stock</span></div>}
                  </div>
                  <div className="p-4">
                    <h3 className="font-display font-semibold mb-1">{it.name}</h3>
                    {it.description && <p className="text-xs text-muted-foreground line-clamp-2 mb-3">{it.description}</p>}
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-lg font-bold text-secondary">PKR {Number(it.price).toLocaleString()}</span>
                      {inCart ? (
                        <div className="flex items-center gap-1">
                          <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => cart.updateQuantity(it.id, -1)}><Minus className="w-3 h-3" /></Button>
                          <span className="w-7 text-center font-mono">{inCart.quantity}</span>
                          <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => cart.updateQuantity(it.id, 1)}><Plus className="w-3 h-3" /></Button>
                        </div>
                      ) : (
                        <Button size="sm" disabled={!it.is_available} onClick={() => cart.addItem(business.id, { id: it.id, name: it.name, price: Number(it.price), image_url: it.image_url })} className="bg-primary text-primary-foreground">
                          <Plus className="w-3 h-3 mr-1" /> Add
                        </Button>
                      )}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
          {filtered.length === 0 && (
            <div className="text-center py-20 text-muted-foreground">
              <UtensilsCrossed className="w-12 h-12 mx-auto mb-3 opacity-40" />
              <p>No items found</p>
            </div>
          )}
          {showWatermark && (
            <div className="text-center py-6">
              <span className="inline-block text-xs text-muted-foreground bg-muted px-3 py-1.5 rounded-full">
                Powered by QuickWaiterz
              </span>
            </div>
          )}
        </div>

        {/* Floating cart button */}
        <AnimatePresence>
          {cartCount > 0 && !cartOpen && (
            <motion.div initial={{ y: 100 }} animate={{ y: 0 }} exit={{ y: 100 }} className="fixed bottom-4 left-4 right-4 z-40">
              <Button onClick={() => setCartOpen(true)} size="lg" className="w-full max-w-md mx-auto flex bg-secondary hover:bg-secondary-hover text-secondary-foreground h-14 shadow-warm">
                <ShoppingCart className="w-5 h-5 mr-2" />
                View Cart ({cartCount}) · PKR {cartTotal.toLocaleString()}
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  );
}
