// theme.ts — "The Living Journal" design system
// Warm editorial light theme with sage, teal, and off-white

export const colors = {
  // Backgrounds — layered vellum
  bgMain: "#f0f4f0",           // page background (slightly warm greenish off-white)
  bgSection: "#f4f7f4",        // subtle section separators
  bgCard: "#ffffff",           // card surface (pure white)

  // Brand — purple (logo-matched)
  brandPrimary: "#1e206a",     // main purple — grounding brand moments, icons, active states
  brandPurpleMid: "#5b67cd",   // accent purple — secondary emphasis, gradients
  brandPurpleLight: "#929df9", // accent purple — soft highlights, light tints
  brandTeal: "#00CED1",        // turquoise — reserved for links and buttons only
  brandOrange: "#00CED1",      // turquoise — CTAs (pivoted from orange)

  // Legacy compat aliases (used by existing components)
  brandSecondary: "#00CED1",
  brandSoftOrange: "rgba(0,206,209,0.08)",
  brandSoftBlue: "rgba(0,206,209,0.08)",
  brandSoftPurple: "rgba(30,32,106,0.08)",
  buttonPrimary: "#1e206a",

  // Text
  textPrimary: "#2d3435",      // near-black, not pure black
  textSecondary: "#3d4a3a",
  textMuted: "#5a6061",        // on-surface-variant for supporting text
  textInverse: "#ffffff",

  // Borders (almost invisible — "Ghost Border" rule)
  borderSubtle: "rgba(173,179,180,0.18)",

  // Semantic
  success: "#2E3337",
  warning: "#ad350a",
  error: "#dc2626",

  // Macro palette
  protein: "#00CED1",          // teal — matches brandTeal
  carbs: "#F5A623",            // warm amber — bridges teal and orange
  fat: "#F25A23",              // orange — matches brandOrange
  chartGreen: "#a8d5a2",

  // Hero card
  heroDark: "#1e206a",
  heroMid: "#5b67cd",

  // Tab bar
  tabBg: "#1e206a",
  tabActive: "#ffffff",
  tabInactive: "rgba(255,255,255,0.45)",
};

export const spacing = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
};

export const radii = {
  sm: 8,
  md: 14,
  lg: 18,
  xl: 24,
  xxl: 28,
  pill: 9999,
};

export const shadows = {
  card: {
    shadowColor: "#2d3435",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 2,
  },
  float: {
    shadowColor: "#2d3435",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.06,
    shadowRadius: 32,
    elevation: 8,
  },
};

export const typography = {
  display: {
    fontSize: 42,
    fontWeight: "800" as const,
    fontFamily: "Inter_800ExtraBold",
    lineHeight: 48,
    letterSpacing: -1.0,
  },
  h1: {
    fontSize: 32,
    fontWeight: "700" as const,
    fontFamily: "Inter_700Bold",
    lineHeight: 38,
    letterSpacing: -0.5,
  },
  h2: {
    fontSize: 24,
    fontWeight: "700" as const,
    fontFamily: "Inter_700Bold",
    lineHeight: 30,
    letterSpacing: -0.3,
  },
  h3: {
    fontSize: 18,
    fontWeight: "600" as const,
    fontFamily: "Inter_700Bold",
    lineHeight: 24,
    letterSpacing: -0.2,
  },
  label: {
    fontSize: 10,
    fontWeight: "600" as const,
    fontFamily: "Inter_700Bold",
    letterSpacing: 1.5,
    textTransform: "uppercase" as const,
  },
  body: {
    fontSize: 16,
    fontWeight: "400" as const,
    fontFamily: "Inter_400Regular",
    lineHeight: 24,
    letterSpacing: 0,
  },
  bodySmall: {
    fontSize: 14,
    fontWeight: "400" as const,
    fontFamily: "Inter_400Regular",
    lineHeight: 20,
    letterSpacing: 0,
  },
  caption: {
    fontSize: 12,
    fontWeight: "400" as const,
    fontFamily: "Inter_400Regular",
    lineHeight: 16,
    letterSpacing: 0,
  },
};
