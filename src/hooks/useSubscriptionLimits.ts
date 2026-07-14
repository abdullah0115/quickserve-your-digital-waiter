import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface PlanLimits {
  planType: string;
  planName: string;
  status: string;
  trialEndsAt: string | null;
  maxTables: number | null;
  maxOrdersPerDay: number | null;
  scanMenuLimit: number | null;
  analyticsLevel: "today_only" | "full";
  hasWatermark: boolean;
  // Mirrors the server's is_locked logic (see get_plan_limits) — used only
  // to decide what to show in the UI. The real enforcement happens
  // server-side in create_order_with_items / check_table_limit; this
  // never gates anything by itself.
  isLocked: boolean;
}

export interface SubscriptionUsage {
  tablesUsed: number;
  ordersToday: number;
}

interface State {
  loading: boolean;
  limits: PlanLimits | null;
  usage: SubscriptionUsage | null;
}

// Read-only view of a business's plan limits + current usage, for showing
// upgrade prompts ahead of time (banners, disabled-with-a-reason buttons).
// Every limit here is also enforced server-side independently — this hook
// exists so the UI doesn't have to wait for a failed request to tell the
// owner they're at their cap.
export function useSubscriptionLimits(businessId: string | undefined) {
  const [state, setState] = useState<State>({ loading: true, limits: null, usage: null });

  const refresh = useCallback(async () => {
    if (!businessId) return;
    setState((s) => ({ ...s, loading: true }));

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [subRes, tablesRes, ordersRes] = await Promise.all([
      supabase
        .from("subscriptions")
        .select("plan_type, status, trial_ends_at, plan_configs(name, max_tables, max_orders_per_day, scan_menu_limit, analytics_level, has_watermark)")
        .eq("business_id", businessId)
        .maybeSingle(),
      supabase.from("qr_codes").select("id", { count: "exact", head: true }).eq("business_id", businessId),
      supabase.from("orders").select("id", { count: "exact", head: true })
        .eq("business_id", businessId).gte("created_at", todayStart.toISOString()).neq("status", "cancelled"),
    ]);

    const sub = subRes.data;
    const plan = sub?.plan_configs as {
      name: string; max_tables: number | null; max_orders_per_day: number | null;
      scan_menu_limit: number | null; analytics_level: string; has_watermark: boolean;
    } | null;

    const limits: PlanLimits | null = sub && plan ? {
      planType: sub.plan_type,
      planName: plan.name,
      status: sub.status,
      trialEndsAt: sub.trial_ends_at,
      maxTables: plan.max_tables,
      maxOrdersPerDay: plan.max_orders_per_day,
      scanMenuLimit: plan.scan_menu_limit,
      analyticsLevel: plan.analytics_level === "full" ? "full" : "today_only",
      hasWatermark: plan.has_watermark,
      isLocked:
        ["expired", "canceled", "past_due"].includes(sub.status) ||
        (sub.plan_type === "trial" && !!sub.trial_ends_at && new Date(sub.trial_ends_at) < new Date()),
    } : null;

    setState({
      loading: false,
      limits,
      usage: { tablesUsed: tablesRes.count ?? 0, ordersToday: ordersRes.count ?? 0 },
    });
  }, [businessId]);

  useEffect(() => { refresh(); }, [refresh]);

  return { ...state, refresh };
}
