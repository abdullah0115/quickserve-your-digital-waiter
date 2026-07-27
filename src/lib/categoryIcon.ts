import {
  Coffee, CupSoda, Salad, Cake, Pizza, Sandwich, IceCream2, Soup,
  Fish, Wine, Beer, Croissant, Cookie, Drumstick, UtensilsCrossed,
  type LucideIcon,
} from "lucide-react";

// Menu categories and item names are both free-text (owners type whatever
// they want), so this is a best-effort keyword match, not a real
// classification. The item's own name is checked first — a category like
// "HOT" or "STARTERS" rarely contains a matchable word by itself, but a
// coffee shop's actual drink names (flat white, cortado, macchiato...)
// almost never contain the literal word "coffee" either, so that list is
// deliberately broad rather than just the generic drink-type words.
const RULES: Array<{ icon: LucideIcon; keywords: string[] }> = [
  {
    icon: Coffee,
    keywords: [
      "coffee", "espresso", "latte", "cappuccino", "americano", "macchiato", "cortado",
      "flat white", "long black", "mocha", "frappe", "cold brew", "affogato", "ristretto",
      "drip", "brew", "tea", "chai",
    ],
  },
  { icon: Wine, keywords: ["wine"] },
  { icon: Beer, keywords: ["beer"] },
  { icon: CupSoda, keywords: ["drink", "beverage", "juice", "soda", "shake", "smoothie", "lemonade"] },
  { icon: Salad, keywords: ["salad", "healthy", "greens", "bowl"] },
  { icon: Soup, keywords: ["soup", "broth"] },
  { icon: Pizza, keywords: ["pizza"] },
  { icon: Sandwich, keywords: ["sandwich", "burger", "wrap", "sub"] },
  { icon: Drumstick, keywords: ["chicken", "meat", "grill", "bbq", "karahi", "broast", "tikka"] },
  { icon: Fish, keywords: ["fish", "seafood"] },
  { icon: Croissant, keywords: ["bakery", "pastry", "bread"] },
  { icon: Cookie, keywords: ["cookie", "biscuit"] },
  { icon: IceCream2, keywords: ["ice cream", "gelato", "kulfi", "iced"] },
  { icon: Cake, keywords: ["cake", "dessert", "sweet", "fudge", "brownie"] },
];

function matchIcon(text: string): LucideIcon | null {
  const lower = text.toLowerCase();
  return RULES.find((rule) => rule.keywords.some((k) => lower.includes(k)))?.icon ?? null;
}

export function getCategoryIcon(itemName: string, categoryName?: string | null): LucideIcon {
  return matchIcon(itemName) ?? matchIcon(categoryName ?? "") ?? UtensilsCrossed;
}
