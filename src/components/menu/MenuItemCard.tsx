import { Minus, Plus, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { getCategoryIcon } from "@/lib/categoryIcon";
import type { Item } from "@/hooks/useOfflineMenu";
import type { ThemePreset } from "@/lib/theme";

interface MenuItemCardProps {
  item: Item;
  categoryName: string | null;
  quantityInCart: number;
  buttonStyle: ThemePreset["button"]["style"];
  onAdd: () => void;
  onIncrement: () => void;
  onDecrement: () => void;
}

// Reads every visual value from the --theme-* custom properties set by
// Menu.tsx on an ancestor element (see src/lib/theme.ts) — this component
// itself has no idea which preset is active, so a new preset never needs
// a change here, only a new entry in THEME_PRESETS.
export function MenuItemCard({ item, categoryName, quantityInCart, buttonStyle, onAdd, onIncrement, onDecrement }: MenuItemCardProps) {
  const CategoryIcon = getCategoryIcon(item.name, categoryName);

  return (
    <div
      className={cn("flex items-start gap-3 border p-3.5 sm:p-4", !item.is_available && "opacity-50")}
      style={{
        background: "var(--theme-card-bg)",
        borderColor: "var(--theme-card-border)",
        borderRadius: "var(--theme-radius)",
        color: "var(--theme-text)",
      }}
    >
      {/* Image slot — a category line-icon on the accent-light ground
          stands in for a real photo, never a generic gradient block. */}
      <div
        className="w-14 h-14 sm:w-16 sm:h-16 shrink-0 overflow-hidden flex items-center justify-center"
        style={{ borderRadius: "calc(var(--theme-radius) * 0.65)", background: "var(--theme-accent-light)" }}
      >
        {item.image_url ? (
          <img src={item.image_url} alt="" className="w-full h-full object-cover" />
        ) : (
          <CategoryIcon className="w-6 h-6" style={{ color: "var(--theme-accent)" }} strokeWidth={1.75} />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <h3
            className="leading-snug"
            style={{ fontFamily: "var(--theme-font-heading)", fontWeight: "var(--theme-heading-weight)" }}
          >
            {item.name}
          </h3>
          {item.is_featured && (
            <Star className="w-3.5 h-3.5 shrink-0 mt-0.5" style={{ color: "var(--theme-accent)" }} fill="currentColor" />
          )}
        </div>

        {item.description && (
          <p
            className="text-xs line-clamp-2 mt-0.5"
            style={{ color: "var(--theme-text-muted)", fontFamily: "var(--theme-font-body)" }}
          >
            {item.description}
          </p>
        )}

        <div className="flex items-center justify-between mt-2.5 gap-2">
          <span
            className="font-semibold text-sm"
            style={{ color: "var(--theme-accent)", fontFamily: "var(--theme-font-body)" }}
          >
            PKR {Number(item.price).toLocaleString()}
          </span>

          {!item.is_available ? (
            <span className="text-xs font-medium" style={{ color: "var(--theme-text-muted)" }}>Out of stock</span>
          ) : quantityInCart > 0 ? (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={onDecrement}
                className="w-7 h-7 rounded-full border flex items-center justify-center"
                style={{ borderColor: "var(--theme-accent)", color: "var(--theme-accent)" }}
              >
                <Minus className="w-3 h-3" />
              </button>
              <span className="w-5 text-center text-sm" style={{ fontFamily: "var(--theme-font-body)" }}>{quantityInCart}</span>
              <button
                type="button"
                onClick={onIncrement}
                className="w-7 h-7 rounded-full border flex items-center justify-center"
                style={{ borderColor: "var(--theme-accent)", color: "var(--theme-accent)" }}
              >
                <Plus className="w-3 h-3" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={onAdd}
              className={cn("flex items-center gap-1 text-xs font-medium px-3 py-1.5", buttonStyle === "outlined" && "border")}
              style={{
                borderRadius: "var(--theme-button-radius)",
                fontFamily: "var(--theme-font-body)",
                background: buttonStyle === "outlined" ? "transparent" : "var(--theme-accent)",
                color: buttonStyle === "outlined" ? "var(--theme-accent)" : "var(--theme-on-accent)",
                borderColor: "var(--theme-accent)",
              }}
            >
              <Plus className="w-3.5 h-3.5" /> Add
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
