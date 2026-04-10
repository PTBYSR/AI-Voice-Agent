import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        "rp-primary": "#0A2540",
        "rp-accent": "#0C8C8C",
        "rp-bg": "#F5F6F8",
        "rp-text-muted": "#4F5B66",
        "rp-text-faint": "#B0B8C1",
        "rp-error": "#C0392B",
        "rp-success": "#27AE60",
        "rp-border": "#E2E5EA",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
export default config;
