import { Check, Coffee } from "lucide-react";
import { THEME_PRESETS, type ThemePresetKey } from "@/lib/theme";
import { cn } from "@/lib/utils";

interface ThemePresetPickerProps {
  value: ThemePresetKey;
  onChange: (key: ThemePresetKey) => void;
}

// A miniature, static replica of a MenuItemCard rendered in each preset's
// own colors/fonts — cheap to build (no iframe of the live menu needed)
// and gives the owner an honest at-a-glance preview before they commit.
export function ThemePresetPicker({ value, onChange }: ThemePresetPickerProps) {
  return (
    <div className="grid sm:grid-cols-3 gap-3">
      {Object.values(THEME_PRESETS).map((preset) => {
        const selected = preset.key === value;
        return (
          <button
            key={preset.key}
            type="button"
            onClick={() => onChange(preset.key)}
            className={cn(
              "text-left rounded-xl border-2 overflow-hidden transition-shadow",
              selected ? "border-primary shadow-warm" : "border-transparent hover:border-border"
            )}
          >
            {/* Mini mockup */}
            <div className="p-3" style={{ background: preset.background }}>
              <div
                className="flex items-center gap-2 p-2"
                style={{ background: preset.cardBackground, borderRadius: preset.radius, border: `1px solid ${preset.cardBorder}` }}
              >
                <div
                  className="w-8 h-8 shrink-0 flex items-center justify-center"
                  style={{ background: preset.accentLight, borderRadius: `calc(${preset.radius} * 0.65)` }}
                >
                  <Coffee className="w-4 h-4" style={{ color: preset.accent }} strokeWidth={1.75} />
                </div>
                <div className="flex-1 min-w-0">
                  <div
                    className="text-[11px] leading-tight truncate"
                    style={{ fontFamily: preset.headingFont, fontWeight: preset.headingWeight, color: preset.text }}
                  >
                    Cappuccino
                  </div>
                  <div className="text-[10px] mt-0.5" style={{ color: preset.accent, fontFamily: preset.bodyFont }}>
                    PKR 500
                  </div>
                </div>
                <div
                  className="text-[9px] font-medium px-2 py-1 shrink-0"
                  style={{
                    borderRadius: preset.button.radius,
                    background: preset.button.style === "outlined" ? "transparent" : preset.accent,
                    color: preset.button.style === "outlined" ? preset.accent : preset.onAccent,
                    border: preset.button.style === "outlined" ? `1px solid ${preset.accent}` : "none",
                  }}
                >
                  Add
                </div>
              </div>
            </div>

            {/* Label */}
            <div className="p-3 bg-card flex items-start gap-2">
              <div
                className={cn(
                  "w-4 h-4 rounded-full border shrink-0 mt-0.5 flex items-center justify-center",
                  selected ? "bg-primary border-primary" : "border-border"
                )}
              >
                {selected && <Check className="w-3 h-3 text-primary-foreground" />}
              </div>
              <div>
                <div className="text-sm font-medium">{preset.label}</div>
                <p className="text-xs text-muted-foreground mt-0.5">{preset.description}</p>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
