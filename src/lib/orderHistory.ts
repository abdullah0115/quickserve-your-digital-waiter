// Remembers every order this browser has placed at a business — capability
// references only (order id + token, no PII) — so the menu page can show
// "your orders" across visits, even after the tab was closed and reopened,
// instead of a blank fresh menu every time. Replaces the old lastOrder.ts,
// which only ever remembered a single order and overwrote it on each new one.
const KEY_PREFIX = "qs_order_history_";
const MAX_ENTRIES = 15;

export interface OrderHistoryEntry {
  id: string;
  tokenNumber: number;
  placedAt: number;
  status: string;
}

function read(slug: string): OrderHistoryEntry[] {
  try {
    const raw = localStorage.getItem(KEY_PREFIX + slug);
    return raw ? (JSON.parse(raw) as OrderHistoryEntry[]) : [];
  } catch {
    return [];
  }
}

function write(slug: string, entries: OrderHistoryEntry[]) {
  try {
    localStorage.setItem(KEY_PREFIX + slug, JSON.stringify(entries));
  } catch {
    // localStorage unavailable (private browsing etc.) — safe to ignore
  }
}

export function getOrderHistory(slug: string): OrderHistoryEntry[] {
  return read(slug).sort((a, b) => b.placedAt - a.placedAt);
}

export function addOrderToHistory(slug: string, order: { id: string; tokenNumber: number }) {
  const existing = read(slug).filter((o) => o.id !== order.id);
  const next = [
    { id: order.id, tokenNumber: order.tokenNumber, placedAt: Date.now(), status: "pending" },
    ...existing,
  ].slice(0, MAX_ENTRIES);
  write(slug, next);
}

export function updateOrderHistoryStatus(slug: string, id: string, status: string) {
  write(slug, read(slug).map((o) => (o.id === id ? { ...o, status } : o)));
}

export function removeFromOrderHistory(slug: string, id: string) {
  write(slug, read(slug).filter((o) => o.id !== id));
}
