// Remembers the customer's most recent order per business (in this browser)
// so the menu page can show "you have an order in progress" without any
// login/session. Just a capability reference (order id + token) — no PII.
const KEY_PREFIX = "qs_last_order_";

export interface LastOrderRef {
  id: string;
  tokenNumber: number;
  placedAt: number;
}

export function saveLastOrder(slug: string, order: { id: string; tokenNumber: number }) {
  try {
    localStorage.setItem(KEY_PREFIX + slug, JSON.stringify({ ...order, placedAt: Date.now() }));
  } catch {
    // localStorage unavailable (private browsing etc.) — safe to ignore
  }
}

export function getLastOrder(slug: string): LastOrderRef | null {
  try {
    const raw = localStorage.getItem(KEY_PREFIX + slug);
    return raw ? (JSON.parse(raw) as LastOrderRef) : null;
  } catch {
    return null;
  }
}

export function clearLastOrder(slug: string) {
  try {
    localStorage.removeItem(KEY_PREFIX + slug);
  } catch {
    // ignore
  }
}
