import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  type PendingOrder,
  queueOfflineOrder,
  getPendingOrder,
  incrementSyncAttempts,
  deletePendingOrder,
} from "@/lib/db";

const RETRY_INTERVAL_MS = 8000;
// After this long without a successful sync, stop retrying automatically —
// an order that finally reaches the kitchen 45 minutes after the customer
// tried to place it (and may have already left) is worse than no order at
// all. The customer gets a clear "couldn't send, try again" instead.
const EXPIRY_MS = 20 * 60 * 1000;

export interface QueueOrderInput {
  businessId: string;
  businessSlug: string;
  qrCodeId: string | null;
  customerName: string;
  customerPhone?: string;
  items: Array<{ menuItemId: string; name: string; price: number; quantity: number; notes?: string }>;
  orderType: "dine_in" | "takeaway";
  notes?: string;
}

interface Callbacks {
  onSynced: (order: { id: string; token_number: number }) => void;
  // Another device at the same table created an order while this one was
  // queued — same race Menu.tsx already recovers from when it happens live,
  // just surfaced here after the fact instead of immediately.
  onConflict: () => void;
  onExpired: () => void;
}

// Queues an order locally (IndexedDB, via src/lib/db.ts) when a real submit
// attempt fails for network reasons, then keeps retrying it against the
// same create-order edge function a normal online order uses — on the
// browser's `online` event, and on a periodic fallback in case that event
// doesn't fire for every network recovery (flaky signal fluctuating
// between 0 and 1 bars often doesn't cross the browser's online/offline
// threshold cleanly). Deliberately does not attempt true offline order
// placement with zero connectivity ever reaching a device — the customer
// still needs *some* network eventually for the kitchen to ever see it.
export function useOfflineOrderQueue(businessSlug: string | undefined, callbacks: Callbacks) {
  const [pendingOrder, setPendingOrder] = useState<PendingOrder | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;

  // Recover an already-queued order after a page reload, so the customer
  // doesn't lose track of it or accidentally start a second one.
  useEffect(() => {
    if (!businessSlug) return;
    getPendingOrder(businessSlug).then((o) => setPendingOrder(o));
  }, [businessSlug]);

  const attemptSync = useCallback(async (order: PendingOrder) => {
    if (Date.now() - order.createdAt > EXPIRY_MS) {
      await deletePendingOrder(order.localId);
      setPendingOrder(null);
      callbacksRef.current.onExpired();
      return;
    }

    setIsSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-order", {
        body: {
          business_slug: order.businessSlug,
          customer_name: order.customerName,
          customer_phone: order.customerPhone || undefined,
          items: order.items.map((i) => ({ menu_item_id: i.menuItemId, quantity: i.quantity, notes: i.notes })),
          qr_code_id: order.qrCodeId || undefined,
          order_type: order.orderType,
          notes: order.notes || undefined,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const created = data.data as { id: string; token_number: number };
      await deletePendingOrder(order.localId);
      setPendingOrder(null);
      callbacksRef.current.onSynced(created);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (msg.toLowerCase().includes("already has an active order")) {
        await deletePendingOrder(order.localId);
        setPendingOrder(null);
        callbacksRef.current.onConflict();
        return;
      }
      // Still unreachable (offline, server hiccup, etc.) — leave it queued
      // for the next retry trigger.
      await incrementSyncAttempts(order.localId);
    } finally {
      setIsSyncing(false);
    }
  }, []);

  useEffect(() => {
    if (!pendingOrder) return;
    const tryNow = () => attemptSync(pendingOrder);
    window.addEventListener("online", tryNow);
    const interval = setInterval(() => {
      if (navigator.onLine) tryNow();
    }, RETRY_INTERVAL_MS);
    return () => {
      window.removeEventListener("online", tryNow);
      clearInterval(interval);
    };
  }, [pendingOrder, attemptSync]);

  const queueOrder = useCallback(async (input: QueueOrderInput) => {
    const localId = crypto.randomUUID();
    const estimatedTotal = input.items.reduce((sum, i) => sum + i.price * i.quantity, 0);
    await queueOfflineOrder({
      localId,
      businessId: input.businessId,
      businessSlug: input.businessSlug,
      qrCodeId: input.qrCodeId,
      customerName: input.customerName,
      customerPhone: input.customerPhone,
      items: input.items,
      estimatedTotal,
      orderType: input.orderType,
      notes: input.notes,
    });
    setPendingOrder(await getPendingOrder(input.businessSlug));
  }, []);

  const cancelPendingOrder = useCallback(async () => {
    if (!pendingOrder) return;
    await deletePendingOrder(pendingOrder.localId);
    setPendingOrder(null);
  }, [pendingOrder]);

  return { pendingOrder, isSyncing, queueOrder, cancelPendingOrder };
}
