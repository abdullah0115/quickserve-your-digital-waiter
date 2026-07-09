import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  getOrderHistory,
  updateOrderHistoryStatus,
  removeFromOrderHistory,
  type OrderHistoryEntry,
} from "@/lib/orderHistory";
import { playNotificationSound, unlockNotificationAudio } from "@/lib/notificationSound";

export const ORDER_STATUS_LABEL: Record<string, string> = {
  pending: "Order Received",
  preparing: "Being Prepared",
  ready: "Ready for Pickup!",
  completed: "Completed",
  cancelled: "Cancelled",
};
export const ACTIVE_ORDER_STATUSES = new Set(["pending", "preparing", "ready"]);

function notifyStatusChange(tokenNumber: number, status: string) {
  const label = ORDER_STATUS_LABEL[status] ?? status;
  toast.info(`Order #${tokenNumber} — ${label}`);
  playNotificationSound();
  if ("Notification" in window && Notification.permission === "granted") {
    new Notification(`Order #${tokenNumber} — ${label}`, {
      body: status === "ready" ? "Please collect from the counter" : undefined,
      icon: "/pwa-192x192.png",
    });
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

  useEffect(() => {
    if (!slug || !activeIds) return;
    const ids = activeIds.split(",");
    const channels = ids.map((id) => {
      const entry = orders.find((o) => o.id === id);
      return supabase
        .channel(`my-order-${id}`)
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "orders", filter: `id=eq.${id}` },
          (payload) => {
            const row = payload.new as { status: string; token_number: number };
            updateOrderHistoryStatus(slug, id, row.status);
            setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, status: row.status } : o)));
            if (entry && row.status !== entry.status) {
              notifyStatusChange(row.token_number, row.status);
            }
          }
        )
        .subscribe();
    });
    return () => {
      channels.forEach((c) => supabase.removeChannel(c));
    };
    // orders is intentionally excluded — activeIds already captures the set
    // of ids that matters, and re-subscribing on every status tick would
    // just churn the same channels.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIds, slug]);

  return { orders, refresh };
}
