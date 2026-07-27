import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  getOrderHistory,
  updateOrderHistoryStatus,
  removeFromOrderHistory,
  type OrderHistoryEntry,
} from "@/lib/orderHistory";
import { playNotificationSound, unlockNotificationAudio, showBrowserNotification } from "@/lib/notificationSound";

export const ORDER_STATUS_LABEL: Record<string, string> = {
  pending: "Order Received",
  preparing: "Being Prepared",
  ready: "Ready for Pickup!",
  completed: "Completed",
  cancelled: "Cancelled",
};
export const ACTIVE_ORDER_STATUSES = new Set(["pending", "preparing", "ready"]);

function notifyStatusChange(tokenNumber: number, status: string) {
  // Called once per tracked order inside refresh()'s loop — a failure
  // here must not stop the remaining orders in that same pass from
  // getting their status updated.
  try {
    const label = ORDER_STATUS_LABEL[status] ?? status;
    toast.info(`Order #${tokenNumber} — ${label}`);
    playNotificationSound();
    showBrowserNotification(`Order #${tokenNumber} — ${label}`, {
      body: status === "ready" ? "Please collect from the counter" : undefined,
      icon: "/pwa-192x192.png",
    });
  } catch {
    // Best-effort alert — the order's real status is already saved by the caller.
  }
}

// Tracks every order this browser has placed at a business (from
// orderHistory's localStorage list): refreshes each one's real status from
// the server on load, then keeps active orders (pending/preparing/ready)
// live via a realtime subscription per order, alerting with a toast, sound,
// and native OS notification whenever a tracked order's status changes —
// so a customer gets pinged even if this tab is in the background.
export function useMyOrders(slug: string | undefined) {
  const [orders, setOrders] = useState<OrderHistoryEntry[]>([]);

  const refresh = useCallback(async () => {
    if (!slug) return;
    const history = getOrderHistory(slug);
    if (history.length === 0) {
      setOrders([]);
      return;
    }
    const results = await Promise.all(
      history.map((h) =>
        supabase.rpc("get_order_status", { p_business_slug: slug, p_order_id: h.id }).maybeSingle()
      )
    );
    const fresh: OrderHistoryEntry[] = [];
    results.forEach(({ data }, i) => {
      const h = history[i];
      if (data) {
        if (data.status !== h.status) notifyStatusChange(h.tokenNumber, data.status);
        updateOrderHistoryStatus(slug, h.id, data.status);
        fresh.push({ ...h, status: data.status });
      } else {
        // Order no longer exists for this business (shouldn't normally
        // happen) — drop the dead reference instead of showing it forever.
        removeFromOrderHistory(slug, h.id);
      }
    });
    setOrders(fresh.sort((a, b) => b.placedAt - a.placedAt));
  }, [slug]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Audio and the native notification prompt both require a real user
  // gesture first — ask for both on the first tap/keypress once there's an
  // active order worth alerting about.
  useEffect(() => {
    if (!orders.some((o) => ACTIVE_ORDER_STATUSES.has(o.status))) return;
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
  }, [orders]);

  const activeIds = orders
    .filter((o) => ACTIVE_ORDER_STATUSES.has(o.status))
    .map((o) => o.id)
    .join(",");

  // Polls instead of subscribing to postgres_changes — orders has no
  // public SELECT policy (a guest browser must never be able to list
  // other customers'/tables' orders), and Realtime is RLS-gated the same
  // as a regular SELECT, so a raw table subscription isn't available
  // here. refresh() already does a point lookup per tracked order id via
  // the get_order_status RPC and now also notifies on a status change.
  useEffect(() => {
    if (!slug || !activeIds) return;
    const interval = setInterval(refresh, 5000);
    // Same reasoning as OrderStatus.tsx's polling: mobile browsers throttle
    // or suspend setInterval while this tab is backgrounded, so catch up
    // immediately the moment it's foregrounded again rather than waiting
    // on a possibly-stalled interval tick.
    const onForeground = () => { if (document.visibilityState === "visible") refresh(); };
    document.addEventListener("visibilitychange", onForeground);
    window.addEventListener("focus", onForeground);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onForeground);
      window.removeEventListener("focus", onForeground);
    };
  }, [activeIds, slug, refresh]);

  return { orders, refresh };
}
