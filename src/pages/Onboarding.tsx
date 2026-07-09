import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Coffee, ArrowRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { SEO } from "@/components/SEO";

const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);

export default function Onboarding() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [tagline, setTagline] = useState("");
  const [city, setCity] = useState("");
  const [cuisine, setCuisine] = useState("Cafe");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) navigate("/auth");
  }, [authLoading, user, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setLoading(true);
    try {
      const baseSlug = slugify(name);
      // Get free plan
      const { data: plan } = await supabase
        .from("subscription_plans")
        .select("id")
        .eq("slug", "free")
        .single();

      // Try slug; on conflict append random suffix
      let slug = baseSlug;
      let attempts = 0;
      while (attempts < 5) {
        const { data: existing } = await supabase.from("businesses").select("id").eq("slug", slug).maybeSingle();
        if (!existing) break;
        slug = `${baseSlug}-${Math.random().toString(36).slice(2, 6)}`;
        attempts++;
      }

      const { data: biz, error } = await supabase
        .from("businesses")
        .insert({
          owner_id: user.id,
          name,
          slug,
          tagline,
          city,
          cuisine_type: cuisine,
          phone,
          email: user.email,
          subscription_plan_id: plan?.id ?? null,
          subscription_status: "trial",
        })
        .select("id")
        .single();
      if (error) throw error;
      // The owner role in user_roles is created automatically by a DB
      // trigger on business insert — no client-side insert needed.

      // Seed a default category
      await supabase.from("menu_categories").insert({
        business_id: biz.id,
        name: "Featured",
        display_order: 0,
      });

      toast.success(`${name} is ready! Welcome to QuickServe.`);
      navigate("/dashboard");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create business");
    } finally {
      setLoading(false);
    }
  };

  if (authLoading) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  }

  return (
    <>
      <SEO title="Set up your business — QuickServe" description="Create your QuickServe business in minutes." noIndex />
      <div className="min-h-screen bg-gradient-hero flex items-center justify-center px-4 py-12 pattern-warm">
        <div className="w-full max-w-xl">
          <div className="flex items-center gap-2 mb-8 justify-center">
            <div className="w-10 h-10 rounded-xl bg-gradient-coffee flex items-center justify-center">
              <Coffee className="w-5 h-5 text-accent" />
            </div>
            <span className="font-display text-xl font-bold">QuickServe</span>
          </div>
          <Card className="shadow-warm border-border/60">
            <CardContent className="p-8">
              <h1 className="font-display text-3xl font-bold mb-2">Tell us about your business</h1>
              <p className="text-muted-foreground text-sm mb-7">
                Just the basics. You can change everything later.
              </p>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label htmlFor="name">Business Name *</Label>
                  <Input id="name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Brew & Bite Cafe" className="mt-1.5" />
                  {name && (
                    <p className="text-xs text-muted-foreground mt-1.5">
                      Your URL: <span className="font-mono text-secondary">/{slugify(name)}</span>
                    </p>
                  )}
                </div>
                <div>
                  <Label htmlFor="tagline">Tagline</Label>
                  <Textarea id="tagline" value={tagline} onChange={(e) => setTagline(e.target.value)} placeholder="Artisanal coffee & fresh pastries" className="mt-1.5" rows={2} />
                </div>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="city">City</Label>
                    <Input id="city" value={city} onChange={(e) => setCity(e.target.value)} placeholder="Karachi" className="mt-1.5" />
                  </div>
                  <div>
                    <Label htmlFor="cuisine">Cuisine</Label>
                    <Input id="cuisine" value={cuisine} onChange={(e) => setCuisine(e.target.value)} placeholder="Cafe" className="mt-1.5" />
                  </div>
                </div>
                <div>
                  <Label htmlFor="phone">Phone</Label>
                  <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+92 300 1234567" className="mt-1.5" />
                </div>
                <Button type="submit" disabled={loading || !name} className="w-full bg-primary hover:bg-primary-hover text-primary-foreground h-11 mt-2">
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Create Business <ArrowRight className="ml-2 w-4 h-4" /></>}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
