import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Coffee, LayoutDashboard, UtensilsCrossed, ClipboardList, QrCode as QrIcon,
  BarChart3, Settings, LogOut, Plus, Loader2, ChefHat, Bell, CheckCircle, Clock,
  Trash2, ExternalLink, Eye, Monitor, TrendingUp,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { SEO } from "@/components/SEO";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

interface Business { id: string; name: string; slug: string; }
interface Category { id: string; name: string; display_order: number; }
interface MenuItem {
  id: string; name: string; description: string | null; price: number;
  category_id: string | null; is_available: boolean; is_featured: boolean; image_url: string | null;
}
interface Order {
  id: string; token_number: number; customer_name: string; items: Array<{ name: string; quantity: number; price: number }>;
  total_amount: number; status: "pending" | "preparing" | "ready" | "completed" | "cancelled";
  table_number: string | null; order_type: string; created_at: string;
}
interface QrCode { id: string; table_number: string; label: string; is_active: boolean; }

const NAV = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "orders", label: "Live Orders", icon: ClipboardList },
  { id: "menu", label: "Menu", icon: UtensilsCrossed },
  { id: "qr", label: "QR Codes", icon: QrIcon },
  { id: "analytics", label: "Analytics", icon: BarChart3 },
  { id: "settings", label: "Settings", icon: Settings },
];

export default function Dashboard() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [business, setBusiness] = useState<Business | null>(null);
  const [tab, setTab] = useState("overview");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { navigate("/auth"); return; }
    supabase.from("businesses").select("id,name,slug").eq("owner_id", user.id).limit(1).maybeSingle()
      .then(({ data }) => {
        if (!data) navigate("/onboarding");
        else setBusiness(data as Business);
        setLoading(false);
      });
  }, [user, authLoading, navigate]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/");
  };

  if (loading || !business) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  }

  return (
    <>
      <SEO title={`Dashboard — ${business.name}`} description="Manage your business" noIndex />
      <div className="min-h-screen bg-muted/30 flex">
        {/* Sidebar */}
        <aside className="hidden lg:flex w-64 bg-card border-r flex-col">
          <div className="p-6 border-b">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-8 h-8 rounded-lg bg-gradient-coffee flex items-center justify-center">
                <Coffee className="w-4 h-4 text-accent" />
              </div>
              <span className="font-display font-bold">QuickServe</span>
            </div>
            <div className="text-xs text-muted-foreground mt-2 truncate">{business.name}</div>
          </div>
          <nav className="flex-1 p-3 space-y-1">
            {NAV.map((n) => (
              <button
                key={n.id}
                onClick={() => setTab(n.id)}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition",
                  tab === n.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <n.icon className="w-4 h-4" /> {n.label}
              </button>
            ))}
          </nav>
          <div className="p-3 border-t space-y-1">
            <a href={`/${business.slug}`} target="_blank" rel="noreferrer" className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:bg-muted">
              <ExternalLink className="w-4 h-4" /> View public page
            </a>
            <button onClick={handleLogout} className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:bg-muted">
              <LogOut className="w-4 h-4" /> Sign out
            </button>
          </div>
        </aside>

        {/* Main */}
        <main className="flex-1 overflow-auto">
          {/* Mobile tabs */}
          <div className="lg:hidden bg-card border-b p-3 sticky top-0 z-10">
            <Select value={tab} onValueChange={setTab}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {NAV.map((n) => <SelectItem key={n.id} value={n.id}>{n.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="p-6 lg:p-10 max-w-7xl mx-auto">
            {tab === "overview" && <Overview business={business} />}
            {tab === "orders" && <OrdersKDS business={business} />}
            {tab === "menu" && <MenuManager business={business} />}
            {tab === "qr" && <QrManager business={business} />}
            {tab === "analytics" && <Analytics business={business} />}
            {tab === "settings" && <SettingsPanel business={business} onUpdate={setBusiness} />}
          </div>
        </main>
      </div>
    </>
  );
}

function Overview({ business }: { business: Business }) {
  const [stats, setStats] = useState({ todayOrders: 0, todayRevenue: 0, pending: 0, items: 0 });
  useEffect(() => {
    (async () => {
      const today = new Date(); today.setHours(0,0,0,0);
      const { data: orders } = await supabase.from("orders").select("total_amount,status")
        .eq("business_id", business.id).gte("created_at", today.toISOString());
      const { count: itemCount } = await supabase.from("menu_items").select("*", { count: "exact", head: true })
        .eq("business_id", business.id);
      setStats({
        todayOrders: orders?.length ?? 0,
        todayRevenue: orders?.reduce((s, o) => s + Number(o.total_amount), 0) ?? 0,
        pending: orders?.filter((o) => o.status === "pending" || o.status === "preparing").length ?? 0,
        items: itemCount ?? 0,
      });
    })();
  }, [business.id]);

  const cards = [
    { label: "Today's Orders", value: stats.todayOrders, icon: ClipboardList, color: "bg-secondary/10 text-secondary" },
    { label: "Today's Revenue", value: `PKR ${stats.todayRevenue.toLocaleString()}`, icon: TrendingUp, color: "bg-accent/15 text-accent" },
    { label: "Active Orders", value: stats.pending, icon: ChefHat, color: "bg-status-preparing/15 text-status-preparing" },
    { label: "Menu Items", value: stats.items, icon: UtensilsCrossed, color: "bg-primary/10 text-primary" },
  ];
  return (
    <div>
      <div className="mb-8">
        <h1 className="font-display text-3xl font-bold">Welcome back 👋</h1>
        <p className="text-muted-foreground mt-1">Here's how {business.name} is doing today.</p>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {cards.map((c) => (
          <Card key={c.label} className="border-border/60">
            <CardContent className="p-5">
              <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center mb-3", c.color)}>
                <c.icon className="w-5 h-5" />
              </div>
              <div className="font-mono text-2xl font-bold">{c.value}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{c.label}</div>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardContent className="p-6">
          <h3 className="font-display text-lg font-semibold mb-4">Quick links</h3>
          <div className="grid sm:grid-cols-3 gap-3">
            <a href={`/${business.slug}`} target="_blank" rel="noreferrer" className="p-4 rounded-xl border hover:border-accent hover:shadow-soft transition">
              <Eye className="w-5 h-5 text-accent mb-2" />
              <div className="font-semibold text-sm">View landing page</div>
              <div className="text-xs text-muted-foreground">/{business.slug}</div>
            </a>
            <a href={`/${business.slug}/menu`} target="_blank" rel="noreferrer" className="p-4 rounded-xl border hover:border-accent hover:shadow-soft transition">
              <UtensilsCrossed className="w-5 h-5 text-secondary mb-2" />
              <div className="font-semibold text-sm">Open menu</div>
              <div className="text-xs text-muted-foreground">Customer view</div>
            </a>
            <a href={`/${business.slug}/display`} target="_blank" rel="noreferrer" className="p-4 rounded-xl border hover:border-accent hover:shadow-soft transition">
              <Monitor className="w-5 h-5 text-primary mb-2" />
              <div className="font-semibold text-sm">Display screen</div>
              <div className="text-xs text-muted-foreground">For wall monitors</div>
            </a>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function OrdersKDS({ business }: { business: Business }) {
  const [orders, setOrders] = useState<Order[]>([]);

  const load = useCallback(async () => {
    const { data } = await supabase.from("orders").select("*")
      .eq("business_id", business.id)
      .in("status", ["pending", "preparing", "ready"])
      .order("created_at", { ascending: true });
    if (data) setOrders(data as unknown as Order[]);
  }, [business.id]);

  useEffect(() => {
    load();
    const ch = supabase.channel(`kds-${business.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `business_id=eq.${business.id}` }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [business.id, load]);

  const updateStatus = async (id: string, status: Order["status"]) => {
    const { error } = await supabase.from("orders").update({ status, ...(status === "completed" ? { completed_at: new Date().toISOString() } : {}) }).eq("id", id);
    if (error) toast.error(error.message); else toast.success(`Order marked as ${status}`);
  };

  const cols = [
    { status: "pending" as const, title: "New", icon: Clock, color: "border-status-pending bg-status-pending/5" },
    { status: "preparing" as const, title: "Preparing", icon: ChefHat, color: "border-status-preparing bg-status-preparing/5" },
    { status: "ready" as const, title: "Ready", icon: Bell, color: "border-status-ready bg-status-ready/5" },
  ];

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-display text-3xl font-bold">Live Orders</h1>
        <p className="text-muted-foreground mt-1">Real-time kitchen display. Updates instantly.</p>
      </div>
      <div className="grid md:grid-cols-3 gap-4">
        {cols.map((col) => {
          const list = orders.filter((o) => o.status === col.status);
          return (
            <div key={col.status} className={cn("rounded-2xl border-2 p-4", col.color)}>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <col.icon className="w-5 h-5" />
                  <h2 className="font-display font-bold text-lg">{col.title}</h2>
                </div>
                <Badge variant="secondary">{list.length}</Badge>
              </div>
              <div className="space-y-3">
                <AnimatePresence>
                  {list.map((o) => (
                    <motion.div key={o.id} layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9 }}>
                      <Card className="border bg-card">
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between mb-2">
                            <span className="font-mono text-2xl font-bold">#{o.token_number}</span>
                            <span className="text-xs text-muted-foreground">{format(new Date(o.created_at), "h:mm a")}</span>
                          </div>
                          <div className="text-sm font-medium mb-1">{o.customer_name}</div>
                          {o.table_number && <div className="text-xs text-muted-foreground mb-2">Table {o.table_number}</div>}
                          <div className="text-xs text-muted-foreground space-y-0.5 mb-3 border-t pt-2">
                            {o.items.map((it, i) => <div key={i}>{it.quantity}× {it.name}</div>)}
                          </div>
                          <div className="text-sm font-semibold mb-3">PKR {Number(o.total_amount).toLocaleString()}</div>
                          {col.status === "pending" && (
                            <Button size="sm" className="w-full bg-status-preparing hover:opacity-90 text-white" onClick={() => updateStatus(o.id, "preparing")}>
                              Start Preparing
                            </Button>
                          )}
                          {col.status === "preparing" && (
                            <Button size="sm" className="w-full bg-status-ready hover:opacity-90 text-white" onClick={() => updateStatus(o.id, "ready")}>
                              <CheckCircle className="w-4 h-4 mr-1" /> Mark Ready
                            </Button>
                          )}
                          {col.status === "ready" && (
                            <Button size="sm" className="w-full bg-primary text-primary-foreground" onClick={() => updateStatus(o.id, "completed")}>
                              Complete
                            </Button>
                          )}
                        </CardContent>
                      </Card>
                    </motion.div>
                  ))}
                </AnimatePresence>
                {list.length === 0 && <div className="text-center text-sm text-muted-foreground py-8">No orders</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MenuManager({ business }: { business: Business }) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [showItem, setShowItem] = useState(false);
  const [editing, setEditing] = useState<MenuItem | null>(null);
  const [form, setForm] = useState({ name: "", description: "", price: "", category_id: "", is_featured: false, image_url: "" });
  const [newCat, setNewCat] = useState("");

  const load = useCallback(async () => {
    const [c, i] = await Promise.all([
      supabase.from("menu_categories").select("*").eq("business_id", business.id).order("display_order"),
      supabase.from("menu_items").select("*").eq("business_id", business.id).order("created_at", { ascending: false }),
    ]);
    if (c.data) setCategories(c.data as Category[]);
    if (i.data) setItems(i.data as unknown as MenuItem[]);
  }, [business.id]);
  useEffect(() => { load(); }, [load]);

  const openNew = () => {
    setEditing(null);
    setForm({ name: "", description: "", price: "", category_id: categories[0]?.id ?? "", is_featured: false, image_url: "" });
    setShowItem(true);
  };
  const openEdit = (it: MenuItem) => {
    setEditing(it);
    setForm({
      name: it.name, description: it.description ?? "", price: String(it.price),
      category_id: it.category_id ?? "", is_featured: it.is_featured, image_url: it.image_url ?? "",
    });
    setShowItem(true);
  };

  const saveItem = async () => {
    if (!form.name || !form.price) return toast.error("Name and price are required");
    const payload = {
      business_id: business.id, name: form.name, description: form.description || null,
      price: Number(form.price), category_id: form.category_id || null,
      is_featured: form.is_featured, image_url: form.image_url || null,
    };
    const { error } = editing
      ? await supabase.from("menu_items").update(payload).eq("id", editing.id)
      : await supabase.from("menu_items").insert(payload);
    if (error) toast.error(error.message);
    else { toast.success(editing ? "Updated" : "Added"); setShowItem(false); load(); }
  };

  const deleteItem = async (id: string) => {
    if (!confirm("Delete this item?")) return;
    const { error } = await supabase.from("menu_items").delete().eq("id", id);
    if (error) toast.error(error.message); else { toast.success("Deleted"); load(); }
  };

  const toggleAvail = async (it: MenuItem) => {
    await supabase.from("menu_items").update({ is_available: !it.is_available }).eq("id", it.id);
    load();
  };

  const addCategory = async () => {
    if (!newCat) return;
    const { error } = await supabase.from("menu_categories").insert({
      business_id: business.id, name: newCat, display_order: categories.length,
    });
    if (error) toast.error(error.message); else { setNewCat(""); load(); toast.success("Category added"); }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold">Menu</h1>
          <p className="text-muted-foreground mt-1">{items.length} items in {categories.length} categories</p>
        </div>
        <Button onClick={openNew} className="bg-primary text-primary-foreground"><Plus className="w-4 h-4 mr-1" /> Add Item</Button>
      </div>

      <Tabs defaultValue="items">
        <TabsList>
          <TabsTrigger value="items">Items</TabsTrigger>
          <TabsTrigger value="cats">Categories</TabsTrigger>
        </TabsList>
        <TabsContent value="items" className="mt-6">
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {items.map((it) => (
              <Card key={it.id} className={cn(!it.is_available && "opacity-60")}>
                <CardContent className="p-5">
                  <div className="flex items-start justify-between mb-2">
                    <h3 className="font-semibold">{it.name}</h3>
                    {it.is_featured && <Badge className="bg-accent text-accent-foreground text-xs">★</Badge>}
                  </div>
                  {it.description && <p className="text-xs text-muted-foreground mb-3 line-clamp-2">{it.description}</p>}
                  <div className="font-mono font-bold text-lg mb-3">PKR {Number(it.price).toLocaleString()}</div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Switch checked={it.is_available} onCheckedChange={() => toggleAvail(it)} />
                      <span className="text-xs text-muted-foreground">{it.is_available ? "Available" : "Hidden"}</span>
                    </div>
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => openEdit(it)}>Edit</Button>
                      <Button size="sm" variant="ghost" onClick={() => deleteItem(it.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
            {items.length === 0 && (
              <Card className="md:col-span-2 lg:col-span-3 border-dashed"><CardContent className="p-12 text-center">
                <UtensilsCrossed className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
                <p className="text-muted-foreground mb-4">No menu items yet</p>
                <Button onClick={openNew} className="bg-primary text-primary-foreground"><Plus className="w-4 h-4 mr-1" /> Add your first item</Button>
              </CardContent></Card>
            )}
          </div>
        </TabsContent>
        <TabsContent value="cats" className="mt-6">
          <Card>
            <CardContent className="p-6">
              <div className="flex gap-2 mb-4">
                <Input placeholder="Category name" value={newCat} onChange={(e) => setNewCat(e.target.value)} />
                <Button onClick={addCategory} className="bg-secondary text-secondary-foreground"><Plus className="w-4 h-4" /></Button>
              </div>
              <div className="space-y-2">
                {categories.map((c) => (
                  <div key={c.id} className="flex items-center justify-between p-3 rounded-lg border">
                    <span className="font-medium">{c.name}</span>
                    <Button size="sm" variant="ghost" onClick={async () => {
                      if (confirm(`Delete category "${c.name}"? Items will become uncategorized.`)) {
                        await supabase.from("menu_categories").delete().eq("id", c.id);
                        load();
                      }
                    }}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={showItem} onOpenChange={setShowItem}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? "Edit item" : "Add menu item"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Name *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div><Label>Description</Label><Textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Price (PKR) *</Label><Input type="number" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} /></div>
              <div><Label>Category</Label>
                <Select value={form.category_id} onValueChange={(v) => setForm({ ...form, category_id: v })}>
                  <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                  <SelectContent>{categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div><Label>Image URL</Label><Input value={form.image_url} onChange={(e) => setForm({ ...form, image_url: e.target.value })} placeholder="https://..." /></div>
            <div className="flex items-center gap-3"><Switch checked={form.is_featured} onCheckedChange={(c) => setForm({ ...form, is_featured: c })} /> <span className="text-sm">Mark as featured</span></div>
            <Button onClick={saveItem} className="w-full bg-primary text-primary-foreground">{editing ? "Save changes" : "Add item"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function QrManager({ business }: { business: Business }) {
  const [codes, setCodes] = useState<QrCode[]>([]);
  const [tableNum, setTableNum] = useState("");
  const [label, setLabel] = useState("");

  const load = useCallback(async () => {
    const { data } = await supabase.from("qr_codes").select("*").eq("business_id", business.id);
    if (data) setCodes(data as QrCode[]);
  }, [business.id]);
  useEffect(() => { load(); }, [load]);

  const add = async () => {
    if (!tableNum) return toast.error("Enter table number");
    const { error } = await supabase.from("qr_codes").insert({
      business_id: business.id, table_number: tableNum, label: label || `Table ${tableNum}`,
    });
    if (error) toast.error(error.message); else { setTableNum(""); setLabel(""); load(); toast.success("QR code created"); }
  };
  const remove = async (id: string) => {
    if (!confirm("Delete this QR code?")) return;
    await supabase.from("qr_codes").delete().eq("id", id); load();
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-display text-3xl font-bold">QR Codes</h1>
        <p className="text-muted-foreground mt-1">Print & place on tables. Customers scan to order.</p>
      </div>
      <Card className="mb-6"><CardContent className="p-5">
        <div className="grid sm:grid-cols-3 gap-3">
          <Input placeholder="Table number (e.g. 1)" value={tableNum} onChange={(e) => setTableNum(e.target.value)} />
          <Input placeholder="Label (optional)" value={label} onChange={(e) => setLabel(e.target.value)} />
          <Button onClick={add} className="bg-primary text-primary-foreground"><Plus className="w-4 h-4 mr-1" /> Create</Button>
        </div>
      </CardContent></Card>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {codes.map((q) => {
          const url = `${window.location.origin}/${business.slug}/menu?table=${encodeURIComponent(q.table_number)}`;
          return (
            <Card key={q.id}><CardContent className="p-5 text-center">
              <div className="bg-white p-4 rounded-xl inline-block mb-3 shadow-soft">
                <QRCodeSVG value={url} size={150} />
              </div>
              <div className="font-semibold">{q.label}</div>
              <div className="text-xs text-muted-foreground mb-3 truncate">{url}</div>
              <Button size="sm" variant="ghost" onClick={() => remove(q.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
            </CardContent></Card>
          );
        })}
        {codes.length === 0 && (
          <Card className="sm:col-span-2 lg:col-span-3 border-dashed"><CardContent className="p-12 text-center">
            <QrIcon className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
            <p className="text-muted-foreground">No QR codes yet. Create one above to get started.</p>
          </CardContent></Card>
        )}
      </div>
    </div>
  );
}

function Analytics({ business }: { business: Business }) {
  const [data, setData] = useState<Array<{ date: string; orders: number; revenue: number }>>([]);
  useEffect(() => {
    (async () => {
      const since = new Date(); since.setDate(since.getDate() - 7);
      const { data: orders } = await supabase.from("orders").select("created_at,total_amount")
        .eq("business_id", business.id).gte("created_at", since.toISOString());
      const map = new Map<string, { orders: number; revenue: number }>();
      for (let i = 6; i >= 0; i--) {
        const d = new Date(); d.setDate(d.getDate() - i);
        map.set(format(d, "MMM dd"), { orders: 0, revenue: 0 });
      }
      orders?.forEach((o) => {
        const k = format(new Date(o.created_at), "MMM dd");
        const cur = map.get(k);
        if (cur) { cur.orders++; cur.revenue += Number(o.total_amount); }
      });
      setData(Array.from(map.entries()).map(([date, v]) => ({ date, ...v })));
    })();
  }, [business.id]);

  const total = data.reduce((s, d) => s + d.revenue, 0);
  const orderTotal = data.reduce((s, d) => s + d.orders, 0);

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-display text-3xl font-bold">Analytics</h1>
        <p className="text-muted-foreground mt-1">Last 7 days</p>
      </div>
      <div className="grid sm:grid-cols-3 gap-4 mb-6">
        <Card><CardContent className="p-5"><div className="text-xs text-muted-foreground">Total Orders</div><div className="font-mono text-3xl font-bold mt-1">{orderTotal}</div></CardContent></Card>
        <Card><CardContent className="p-5"><div className="text-xs text-muted-foreground">Total Revenue</div><div className="font-mono text-3xl font-bold mt-1">PKR {total.toLocaleString()}</div></CardContent></Card>
        <Card><CardContent className="p-5"><div className="text-xs text-muted-foreground">Avg Order</div><div className="font-mono text-3xl font-bold mt-1">PKR {orderTotal ? Math.round(total / orderTotal).toLocaleString() : 0}</div></CardContent></Card>
      </div>
      <Card><CardContent className="p-6">
        <h3 className="font-semibold mb-4">Daily Orders</h3>
        <div className="space-y-2">
          {data.map((d) => {
            const max = Math.max(...data.map((x) => x.orders), 1);
            return (
              <div key={d.date} className="flex items-center gap-3">
                <div className="w-16 text-xs text-muted-foreground">{d.date}</div>
                <div className="flex-1 h-8 bg-muted rounded-md overflow-hidden">
                  <div className="h-full bg-gradient-warm rounded-md transition-all" style={{ width: `${(d.orders / max) * 100}%` }} />
                </div>
                <div className="w-24 text-right text-sm font-mono">{d.orders} · PKR {d.revenue.toLocaleString()}</div>
              </div>
            );
          })}
        </div>
      </CardContent></Card>
    </div>
  );
}

function SettingsPanel({ business, onUpdate }: { business: Business; onUpdate: (b: Business) => void }) {
  const [form, setForm] = useState<{ name: string; tagline: string; description: string; phone: string; address: string; cover_image_url: string }>({
    name: business.name, tagline: "", description: "", phone: "", address: "", cover_image_url: "",
  });
  useEffect(() => {
    supabase.from("businesses").select("*").eq("id", business.id).single().then(({ data }) => {
      if (data) setForm({
        name: data.name, tagline: data.tagline ?? "", description: data.description ?? "",
        phone: data.phone ?? "", address: data.address ?? "", cover_image_url: data.cover_image_url ?? "",
      });
    });
  }, [business.id]);

  const save = async () => {
    const { error } = await supabase.from("businesses").update(form).eq("id", business.id);
    if (error) toast.error(error.message);
    else { toast.success("Saved"); onUpdate({ ...business, name: form.name }); }
  };

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="font-display text-3xl font-bold">Settings</h1>
        <p className="text-muted-foreground mt-1">Manage your business profile</p>
      </div>
      <Card><CardContent className="p-6 space-y-4">
        <div><Label>Business Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
        <div><Label>Tagline</Label><Input value={form.tagline} onChange={(e) => setForm({ ...form, tagline: e.target.value })} /></div>
        <div><Label>Description</Label><Textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
        <div><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
        <div><Label>Address</Label><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
        <div><Label>Cover Image URL</Label><Input value={form.cover_image_url} onChange={(e) => setForm({ ...form, cover_image_url: e.target.value })} placeholder="https://..." /></div>
        <Button onClick={save} className="bg-primary text-primary-foreground">Save Changes</Button>
      </CardContent></Card>
    </div>
  );
}
