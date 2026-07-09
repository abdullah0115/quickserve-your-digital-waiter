import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, MapPin, Phone, Mail, UtensilsCrossed, Star, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { SEO } from "@/components/SEO";

interface Business {
  id: string; name: string; slug: string; tagline: string | null; description: string | null;
  cover_image_url: string | null; logo_url: string | null;
  phone: string | null; email: string | null; address: string | null; city: string | null;
  cuisine_type: string | null; theme_color: string;
}
interface Item { id: string; name: string; description: string | null; price: number; image_url: string | null; }

export default function BusinessLanding() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [business, setBusiness] = useState<Business | null>(null);
  const [featured, setFeatured] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [tableNumber, setTableNumber] = useState("");

  useEffect(() => {
    (async () => {
      const { data: biz } = await supabase.from("businesses")
        .select("id,name,slug,tagline,description,cover_image_url,logo_url,phone,email,address,city,cuisine_type,theme_color")
        .eq("slug", slug!).maybeSingle();
      if (!biz) { setLoading(false); return; }
      setBusiness(biz as unknown as Business);
      const { data: items } = await supabase.from("menu_items").select("id,name,description,price,image_url")
        .eq("business_id", biz.id).eq("is_featured", true).eq("is_available", true).limit(6);
      setFeatured((items ?? []) as Item[]);
      setLoading(false);
    })();
  }, [slug]);

  if (loading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  if (!business) {
    return (
      <div className="min-h-screen flex items-center justify-center text-center px-4">
        <div>
          <h1 className="font-display text-4xl font-bold mb-2">Business not found</h1>
          <p className="text-muted-foreground mb-6">We couldn't find a business at /{slug}</p>
          <Link to="/"><Button>Back home</Button></Link>
        </div>
      </div>
    );
  }

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Restaurant",
    name: business.name,
    description: business.description ?? business.tagline,
    address: business.address ? { "@type": "PostalAddress", streetAddress: business.address, addressLocality: business.city } : undefined,
    telephone: business.phone, servesCuisine: business.cuisine_type, priceRange: "$$",
  };

  return (
    <>
      <SEO
        title={`${business.name} — Order Online | QuickServe`}
        description={business.description ?? business.tagline ?? `Order online from ${business.name}`}
        image={business.cover_image_url ?? undefined}
        type="restaurant"
        jsonLd={jsonLd}
      />
      <div className="min-h-screen bg-background">
        {/* HERO */}
        <section className="relative h-[60vh] min-h-105 overflow-hidden">
          {business.cover_image_url ? (
            <img src={business.cover_image_url} alt={business.name} className="absolute inset-0 w-full h-full object-cover" />
          ) : (
            <div className="absolute inset-0 bg-gradient-coffee" />
          )}
          <div className="absolute inset-0 bg-linear-to-b from-black/30 via-black/40 to-black/70" />
          <div className="relative z-10 container mx-auto px-4 h-full flex flex-col justify-end pb-12 text-white">
            <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }}>
              <h1 className="font-display text-5xl md:text-7xl font-bold mb-3 text-balance">{business.name}</h1>
              {business.tagline && <p className="text-lg md:text-xl text-white/90 mb-4 max-w-2xl">{business.tagline}</p>}
              <div className="flex flex-wrap items-center gap-4 text-sm">
                {business.city && <span className="inline-flex items-center gap-1.5"><MapPin className="w-4 h-4" />{business.city}</span>}
                {business.cuisine_type && <span className="inline-flex items-center gap-1.5"><UtensilsCrossed className="w-4 h-4" />{business.cuisine_type}</span>}
                <span className="inline-flex items-center gap-1.5 text-status-ready"><span className="w-2 h-2 rounded-full bg-status-ready animate-pulse" />Open Now</span>
              </div>
            </motion.div>
          </div>
        </section>

        {/* ORDER ENTRY */}
        <section className="container mx-auto px-4 -mt-16 relative z-20 max-w-2xl">
          <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
            <Card className="shadow-warm border-border/60">
              <CardContent className="p-6 md:p-8">
                <h2 className="font-display text-2xl font-bold mb-5 text-center">Start your order</h2>
                <Tabs defaultValue="dine">
                  <TabsList className="grid grid-cols-2 mb-5">
                    <TabsTrigger value="dine">Dine In</TabsTrigger>
                    <TabsTrigger value="take">Takeaway</TabsTrigger>
                  </TabsList>
                  <TabsContent value="dine" className="space-y-3">
                    <Input placeholder="Enter your table number" value={tableNumber} onChange={(e) => setTableNumber(e.target.value)} className="text-center text-lg h-12" />
                    <Button
                      onClick={() => navigate(`/${slug}/menu?table=${encodeURIComponent(tableNumber || "1")}`)}
                      className="w-full bg-primary hover:bg-primary-hover text-primary-foreground h-12"
                      size="lg"
                    >
                      View Menu <ArrowRight className="ml-2 w-4 h-4" />
                    </Button>
                  </TabsContent>
                  <TabsContent value="take">
                    <Button onClick={() => navigate(`/${slug}/menu?type=takeaway`)} className="w-full bg-secondary hover:bg-secondary-hover text-secondary-foreground h-12" size="lg">
                      Browse Takeaway Menu <ArrowRight className="ml-2 w-4 h-4" />
                    </Button>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          </motion.div>
        </section>

        {/* FEATURED */}
        {featured.length > 0 && (
          <section className="container mx-auto px-4 py-20">
            <h2 className="font-display text-3xl md:text-4xl font-bold text-center mb-10">Customer Favourites</h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {featured.map((it) => (
                <Card key={it.id} className="overflow-hidden hover:shadow-warm transition">
                  {it.image_url ? (
                    <img src={it.image_url} alt={it.name} className="w-full h-48 object-cover" />
                  ) : (
                    <div className="w-full h-48 bg-gradient-warm flex items-center justify-center"><UtensilsCrossed className="w-12 h-12 text-accent-foreground" /></div>
                  )}
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <h3 className="font-display text-lg font-semibold">{it.name}</h3>
                      <span className="inline-flex items-center gap-1 text-xs text-accent"><Star className="w-3 h-3 fill-accent" /> Popular</span>
                    </div>
                    {it.description && <p className="text-sm text-muted-foreground line-clamp-2 mb-3">{it.description}</p>}
                    <div className="font-mono text-lg font-bold text-secondary">PKR {Number(it.price).toLocaleString()}</div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        )}

        {/* CONTACT */}
        <section className="container mx-auto px-4 py-20 max-w-3xl">
          <h2 className="font-display text-3xl font-bold text-center mb-10">Get in touch</h2>
          <div className="grid sm:grid-cols-3 gap-6 text-center">
            {business.phone && <div><Phone className="w-6 h-6 mx-auto mb-2 text-secondary" /><div className="font-medium">{business.phone}</div></div>}
            {business.email && <div><Mail className="w-6 h-6 mx-auto mb-2 text-secondary" /><div className="font-medium text-sm">{business.email}</div></div>}
            {business.address && <div><MapPin className="w-6 h-6 mx-auto mb-2 text-secondary" /><div className="font-medium text-sm">{business.address}</div></div>}
          </div>
        </section>

        <footer className="border-t py-6 text-center text-xs text-muted-foreground">
          Powered by <Link to="/" className="font-semibold text-foreground hover:text-accent">QuickServe</Link>
        </footer>
      </div>
    </>
  );
}
