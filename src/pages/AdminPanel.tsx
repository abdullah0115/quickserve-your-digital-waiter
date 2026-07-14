import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, ShieldAlert, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { format } from "date-fns";
import { SEO } from "@/components/SEO";

type SubStatus = "trialing" | "active" | "past_due" | "canceled" | "expired";
type PlanType = "trial" | "self_serve_pkr" | "managed_pkr" | "international_usd";

interface AdminBusiness {
  id: string;
  name: string;
  slug: string;
  owner_email: string;
  plan_type: PlanType;
  subscription_status: SubStatus;
  trial_ends_at: string | null;
  current_period_end: string | null;
  is_active: boolean;
  created_at: string;
}

const STATUS_OPTIONS: SubStatus[] = ["trialing", "active", "past_due", "canceled", "expired"];
const STATUS_COLOR: Record<SubStatus, string> = {
  trialing: "bg-muted text-muted-foreground",
  active: "bg-status-ready text-white",
  past_due: "bg-status-preparing text-white",
  canceled: "bg-destructive text-destructive-foreground",
  expired: "bg-destructive text-destructive-foreground",
};
const PLAN_OPTIONS: PlanType[] = ["trial", "self_serve_pkr", "managed_pkr", "international_usd"];
const PLAN_LABEL: Record<PlanType, string> = {
  trial: "Free Trial",
  self_serve_pkr: "Self-Serve (PKR)",
  managed_pkr: "Managed Setup (PKR)",
  international_usd: "International (USD)",
};

export default function AdminPanel() {
  const { user, isAdmin, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [businesses, setBusinesses] = useState<AdminBusiness[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, { planType: PlanType; status: SubStatus; trialEndsAt: string }>>({});

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc("admin_list_businesses");
    if (error) { toast.error(error.message); setLoading(false); return; }
    setBusinesses((data ?? []) as AdminBusiness[]);
    setDraft(
      Object.fromEntries(
        (data ?? []).map((b) => [
          b.id,
          {
            planType: b.plan_type as PlanType,
            status: b.subscription_status as SubStatus,
            trialEndsAt: b.trial_ends_at ? b.trial_ends_at.slice(0, 10) : "",
          },
        ])
      )
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { navigate("/auth"); return; }
    if (!isAdmin) { setLoading(false); return; }
    load();
  }, [authLoading, user, isAdmin, navigate, load]);

  const saveSubscription = async (biz: AdminBusiness) => {
    const d = draft[biz.id];
    if (!d) return;
    setSavingId(biz.id);
    const { error } = await supabase.rpc("admin_set_subscription", {
      p_business_id: biz.id,
      p_plan_type: d.planType,
      p_status: d.status,
      p_trial_ends_at: d.trialEndsAt ? new Date(d.trialEndsAt).toISOString() : undefined,
    });
    setSavingId(null);
    if (error) return toast.error(error.message);
    toast.success(`${biz.name}'s subscription updated`);
    load();
  };

  const toggleActive = async (biz: AdminBusiness) => {
    const { error } = await supabase.rpc("admin_set_business_active", {
      p_business_id: biz.id,
      p_is_active: !biz.is_active,
    });
    if (error) return toast.error(error.message);
    toast.success(`${biz.name} ${biz.is_active ? "suspended" : "reactivated"}`);
    load();
  };

  if (authLoading || loading) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center text-center px-4">
        <div>
          <ShieldAlert className="w-10 h-10 mx-auto mb-3 text-destructive" />
          <h1 className="font-display text-2xl font-bold mb-2">Not authorized</h1>
          <p className="text-muted-foreground mb-6">This account doesn't have admin access.</p>
          <Button onClick={() => navigate("/dashboard")}>Back to Dashboard</Button>
        </div>
      </div>
    );
  }

  return (
    <>
      <SEO title="Admin — QuickWaiterz" description="Platform administration" noIndex />
      <div className="min-h-screen bg-muted/30 py-10 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h1 className="font-display text-3xl font-bold">Admin</h1>
              <p className="text-muted-foreground mt-1">
                Manual subscription management — no payment gateway is wired up yet, this is the stand-in until one is.
              </p>
            </div>
            <Button variant="outline" onClick={() => navigate("/dashboard")}>Back to Dashboard</Button>
          </div>

          <div className="space-y-3">
            {businesses.map((b) => {
              const d = draft[b.id] ?? { planType: b.plan_type, status: b.subscription_status, trialEndsAt: "" };
              const dirty = d.planType !== b.plan_type || d.status !== b.subscription_status
                || (d.trialEndsAt && d.trialEndsAt !== (b.trial_ends_at?.slice(0, 10) ?? ""));
              return (
                <Card key={b.id} className={cnActive(b.is_active)}>
                  <CardContent className="p-5">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-display text-lg font-semibold">{b.name}</h3>
                          <Badge className={STATUS_COLOR[b.subscription_status]}>{b.subscription_status}</Badge>
                          {!b.is_active && <Badge variant="outline" className="border-destructive text-destructive">suspended</Badge>}
                        </div>
                        <p className="text-sm text-muted-foreground mt-0.5">
                          {b.owner_email} · /{b.slug} · {PLAN_LABEL[b.plan_type] ?? b.plan_type} · joined {format(new Date(b.created_at), "MMM d, yyyy")}
                        </p>
                        <a
                          href={`/${b.slug}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-secondary hover:underline mt-1"
                        >
                          View public page <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">Suspended</span>
                        <Switch checked={!b.is_active} onCheckedChange={() => toggleActive(b)} />
                      </div>
                    </div>

                    <div className="flex flex-wrap items-end gap-3 mt-4 pt-4 border-t">
                      <div>
                        <label className="text-xs text-muted-foreground block mb-1">Plan</label>
                        <Select value={d.planType} onValueChange={(v) => setDraft((prev) => ({ ...prev, [b.id]: { ...prev[b.id], planType: v as PlanType } }))}>
                          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {PLAN_OPTIONS.map((p) => <SelectItem key={p} value={p}>{PLAN_LABEL[p]}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground block mb-1">Subscription status</label>
                        <Select value={d.status} onValueChange={(v) => setDraft((prev) => ({ ...prev, [b.id]: { ...prev[b.id], status: v as SubStatus } }))}>
                          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {STATUS_OPTIONS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground block mb-1">Trial ends</label>
                        <Input
                          type="date"
                          className="w-40"
                          value={d.trialEndsAt}
                          onChange={(e) => setDraft((prev) => ({ ...prev, [b.id]: { ...prev[b.id], trialEndsAt: e.target.value } }))}
                        />
                      </div>
                      <Button size="sm" disabled={!dirty || savingId === b.id} onClick={() => saveSubscription(b)} className="bg-primary text-primary-foreground">
                        {savingId === b.id ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
            {businesses.length === 0 && (
              <Card className="border-dashed"><CardContent className="p-12 text-center text-muted-foreground">No businesses yet</CardContent></Card>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function cnActive(isActive: boolean) {
  return isActive ? "" : "opacity-60 border-destructive/40";
}
