import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface CartItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  image_url?: string | null;
  notes?: string;
}

interface CartState {
  businessId: string | null;
  items: CartItem[];
  addItem: (businessId: string, item: Omit<CartItem, "quantity">) => void;
  removeItem: (id: string) => void;
  updateQuantity: (id: string, delta: number) => void;
  clear: () => void;
  total: () => number;
  count: () => number;
}

export const useCart = create<CartState>()(
  persist(
    (set, get) => ({
      businessId: null,
      items: [],
      addItem: (businessId, item) =>
        set((state) => {
          // If switching business, reset cart
          const items =
            state.businessId && state.businessId !== businessId ? [] : state.items;
          const existing = items.find((i) => i.id === item.id);
          if (existing) {
            return {
              businessId,
              items: items.map((i) =>
                i.id === item.id ? { ...i, quantity: i.quantity + 1 } : i,
              ),
            };
          }
          return { businessId, items: [...items, { ...item, quantity: 1 }] };
        }),
      removeItem: (id) =>
        set((state) => ({ items: state.items.filter((i) => i.id !== id) })),
      updateQuantity: (id, delta) =>
        set((state) => ({
          items: state.items
            .map((i) => (i.id === id ? { ...i, quantity: i.quantity + delta } : i))
            .filter((i) => i.quantity > 0),
        })),
      clear: () => set({ items: [], businessId: null }),
      total: () => get().items.reduce((sum, i) => sum + i.price * i.quantity, 0),
      count: () => get().items.reduce((sum, i) => sum + i.quantity, 0),
    }),
    { name: "quickserve-cart" },
  ),
);
