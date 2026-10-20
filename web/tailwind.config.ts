import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx,mdx}", "./components/**/*.{ts,tsx,mdx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    // All palette entries resolve to globals.css; components never need hex literals.
    colors: {
      transparent: "transparent",
      current: "currentColor",
      bg: "var(--bg)",
      "bg-grid": "var(--bg-grid)",
      surface: "var(--surface)",
      "surface-2": "var(--surface-2)",
      "surface-glass": "var(--surface-glass)",
      border: "var(--border)",
      "border-strong": "var(--border-strong)",
      text: "var(--text)",
      "text-muted": "var(--text-muted)",
      "text-faint": "var(--text-faint)",
      accent: "var(--accent)",
      "accent-2": "var(--accent-2)",
      up: "var(--up)",
      down: "var(--down)",
      b1: "var(--b1)",
      b2: "var(--b2)",
      p: "var(--p)",
      "cat-chat": "var(--cat-chat)",
      "cat-email": "var(--cat-email)",
      "cat-transf": "var(--cat-transf)",
      "cat-stream": "var(--cat-stream)",
      "cat-voip": "var(--cat-voip)",
      ok: "var(--ok)",
      warn: "var(--warn)",
      bad: "var(--bad)",
    },
    fontFamily: {
      sans: ["var(--font-archivo)", "system-ui", "sans-serif"],
      mono: ["var(--font-plex-mono)", "ui-monospace", "monospace"],
    },
    fontSize: {
      micro: "11px",
      xs: "12px",
      sm: "14px",
      base: "16px",
      lg: "20px",
      xl: "28px",
      stat: "32px",
      "2xl": "40px",
    },
    spacing: {
      0: "0px", 1: "4px", 2: "8px", 3: "12px", 4: "16px",
      5: "20px", 6: "24px", 8: "32px", 10: "40px", 12: "48px",
      16: "64px", 20: "80px", 24: "96px",
      "card-gap": "var(--card-gap)",
      "card-pad": "var(--card-padding)",
    },
    borderRadius: {
      none: "0", field: "var(--radius-control)",
      card: "var(--radius-card)", chip: "var(--radius-chip)",
    },
    letterSpacing: { label: "var(--label-tracking)" },
    boxShadow: { active: "var(--active-glow)" },
    maxWidth: { content: "1440px" },
    extend: {},
  },
  plugins: [],
};

export default config;
