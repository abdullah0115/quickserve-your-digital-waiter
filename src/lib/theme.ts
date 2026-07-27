// Per-business visual presets for the customer-facing /:slug/menu page only
// — deliberately separate from the app's own site-wide brand tokens in
// styles.css (Playfair Display / coffee palette), which stay untouched.
// Menu.tsx applies a preset's values as CSS custom properties on a wrapper
// element; every themed element reads var(--theme-*) rather than a preset
// name directly, so MenuItemCard works unchanged for all three.

export type ThemePresetKey = "warm_classic" | "modern_minimal" | "bold_dark";

export interface ThemePreset {
  key: ThemePresetKey;
  label: string;
  description: string;
  background: string;
  cardBackground: string;
  cardBorder: string;
  text: string;
  textMuted: string;
  accent: string;
  accentLight: string;
  // Contrasting color for text/icons placed directly on the accent (e.g.
  // a filled button's label) — not always the same as `background`.
  onAccent: string;
  headingFont: string;
  headingWeight: number;
  bodyFont: string;
  radius: string;
  button: {
    style: "filled-pill" | "filled-rect" | "outlined";
    radius: string;
  };
}

export const THEME_PRESETS: Record<ThemePresetKey, ThemePreset> = {
  warm_classic: {
    key: "warm_classic",
    label: "Warm Classic",
    description: "Cozy, inviting — cream tones with a terracotta accent. Good fit for cafes and bakeries.",
    background: "#F7EFE4",
    cardBackground: "#FFFFFF",
    cardBorder: "transparent",
    text: "#2B2118",
    textMuted: "#7A6A58",
    accent: "#8A5A3B",
    accentLight: "#F0DFC9",
    onAccent: "#FFFFFF",
    headingFont: "'Fraunces', ui-serif, Georgia, serif",
    headingWeight: 600,
    bodyFont: "'Inter', ui-sans-serif, system-ui, sans-serif",
    radius: "10px",
    button: { style: "filled-pill", radius: "20px" },
  },
  modern_minimal: {
    key: "modern_minimal",
    label: "Modern Minimal",
    description: "Clean and contemporary — sage green accent on a light neutral ground. Good fit for health-food and fast-casual spots.",
    background: "#F4F4F2",
    cardBackground: "#FFFFFF",
    cardBorder: "#E5E5E2",
    text: "#1C1C1A",
    textMuted: "#6B6B66",
    accent: "#1F4A3E",
    accentLight: "#EAF1EE",
    onAccent: "#FFFFFF",
    headingFont: "'Inter', ui-sans-serif, system-ui, sans-serif",
    headingWeight: 500,
    bodyFont: "'Inter', ui-sans-serif, system-ui, sans-serif",
    radius: "8px",
    button: { style: "filled-rect", radius: "6px" },
  },
  bold_dark: {
    key: "bold_dark",
    label: "Bold Dark",
    description: "Upscale and moody — near-black ground with a muted gold accent. Good fit for fine dining.",
    background: "#1C1B19",
    cardBackground: "#262422",
    cardBorder: "#39362F",
    text: "#F5F0E8",
    textMuted: "#B4A995",
    accent: "#D4A857",
    accentLight: "#3A331F",
    onAccent: "#1C1B19",
    headingFont: "'Fraunces', ui-serif, Georgia, serif",
    headingWeight: 600,
    bodyFont: "'Inter', ui-sans-serif, system-ui, sans-serif",
    radius: "10px",
    button: { style: "outlined", radius: "10px" },
  },
};

export function themeCssVars(preset: ThemePreset): React.CSSProperties {
  return {
    "--theme-bg": preset.background,
    "--theme-card-bg": preset.cardBackground,
    "--theme-card-border": preset.cardBorder,
    "--theme-text": preset.text,
    "--theme-text-muted": preset.textMuted,
    "--theme-accent": preset.accent,
    "--theme-accent-light": preset.accentLight,
    "--theme-on-accent": preset.onAccent,
    "--theme-font-heading": preset.headingFont,
    "--theme-heading-weight": preset.headingWeight,
    "--theme-font-body": preset.bodyFont,
    "--theme-radius": preset.radius,
    "--theme-button-radius": preset.button.radius,
  } as React.CSSProperties;
}
