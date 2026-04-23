import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams, useNavigate, Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, ShoppingCart, Search, Plus, Minus, Trash2, Star, UtensilsCrossed, Loader2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";
import { useCart } from "@/store/cart";
import { toast } from "sonner";
import { SEO } from "@/components/SEO";
import { cn } from "@/lib/utils";

interface Business { id: string; name: string; slug: string; }
interface Cat { id: string; name: string; display_order: number; }
interface Item {
  id: string; name: string; description: string | null; price: number;
  category_id: string | null; image_url: string | null; is_available: boolean; is_featured: boolean;
}

export default function Menu() {
  const { slug } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const tableNumber = params.get("table");
  const orderType = params.get("type") === "takeaway" ? "takeaway" : "dine_in";

  const [business, setBusiness] = useState<Business | null>(null);
  const [cats, setCats] = useState<Cat[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [search, setSearch] = useState("");
  const [selectedCat, setSelectedCat] = useState("all");
  const [loading, setLoading] = useState(true);
  const [cartOpen, setCartOpen] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [checkout, setCheckout] = useState({ name: "", phone: "", notes: "" });

  const cart = useCart();

  useEffect(() => {
    (async () => {
      const { data: biz } = await supabase.from("businesses").select("id,name,slug").eq("slug", slug!).maybeSingle();
      if (!biz) { setLoading(false); return; }
      setBusiness(biz as Business);
      const [c, i] = await Promise.all([
        supabase.from("menu_categories").select("*").eq("business_id", biz.id).eq("is_active", true).order("display_order"),
        supabase.from("menu_items").select("*").eq("business_id", biz.id).order("display_order"),
      ]);
      setCats((c.data ?? []) as Cat[]);
      setItems((i.data ?? []) as unknown as Item[]);
      setLoading(false);
    })();
  }, [slug]);

  const filtered = useMemo(() => items.filter((it) => {
    if (selectedCat !== "all" && it.category_id !== selectedCat) return false;
    if (search && !it.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }), [items, selectedCat, search]);

  const placeOrder = async () => {
    if (!business || cart.items.length === 0) return;
    if (!checkout.name) return toast.error("Please enter your name");
    setPlacing(true);
    try {
      const { data, error } = await supabase.from("orders").insert({
        business_id: business.id,
        token_number: 0, // overridden by trigger
        customer_name: checkout.name,
        customer_phone: checkout.phone || null,
        items: cart.items.map((i) => ({ menu_item_id: i.id, name: i.name, quantity: i.quantity, price: i.price })),
        total_amount: cart.total(),
        table_number: tableNumber,
        order_type: orderType,
        notes: checkout.notes || null,
      }).select().single();
      if (error) throw error;
      cart.clear();
      toast.success(`Order #${data.token_number} placed!`);
      navigate(`/${slug}/order/${data.token_number}?id=${data.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to place order");
    } finally { setPlacing(false); }
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  if (!business) return <div className="min-h-screen flex items-center justify-center"><p>Business not found</p></div>;

  const cartCount = cart.count();
  const cartTotal = cart.total();

  return (
    <>
      <SEO title={`Menu — ${business.name}`} description={`Order from ${business.name}`} />
      <div className="min-h-screen bg-background pb-32">
        {/* Header */}
        <div className="sticky top-0 z-30 bg-background/95 backdrop-blur-xl border-b">
          <div className="container mx-auto px-4 h-16 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button size="icon" variant="ghost" onClick={() => navigate(`/${slug}`)}><ArrowLeft className="w-5 h-5" /></Button>
              <div>
                <h1 className="font-display text-lg font-bold leading-tight">{business.name}</h1>
                <p className="text-xs text-muted-foreground">{orderType === "dine_in" ? `Table ${tableNumber ?? "—"}` : "Takeaway"}</p>
              </div>
            </div>
            <Sheet open={cartOpen} onOpenChange={setCartOpen}>
              <SheetTrigger asChild>
                <Button size="icon" variant="outline" className="relative">
                  <ShoppingCart className="w-5 h-5" />
                  {cartCount > 0 && <Badge className="absolute -top-2 -right-2 bg-accent text-accent-foreground h-5 w-5 p-0 flex items-center justify-center text-xs">{cartCount}</Badge>}
                </Button>
              </SheetTrigger>
              <SheetContent className="w-full sm:max-w-md flex flex-col">
                <SheetHeader><SheetTitle className="font-display">Your Order</SheetTitle></SheetHeader>
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
                    <Button onClick={placeOrder} disabled={placing} size="lg" className="w-full bg-secondary hover:bg-secondary-hover text-secondary-foreground">
                      {placing ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Place Order <Check className="ml-2 w-4 h-4" /></>}
                    </Button>
                  </div>
                )}
              </SheetContent>
            </Sheet>
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
                      <img src={it.image_url} alt={it.name} className="w-full aspect-[4/3] object-cover" />
                    ) : (
                      <div className="w-full aspect-[4/3] bg-gradient-warm flex items-center justify-center"><UtensilsCrossed className="w-10 h-10 text-accent-foreground" /></div>
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
