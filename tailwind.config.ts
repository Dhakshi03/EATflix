import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        brand: {
          50: "#fff1f2",
          100: "#ffe4e6",
          300: "#ff6b72",
          400: "#ff2a35",
          500: "#E50914",
          600: "#b20710",
          700: "#831010",
          900: "#4c0519",
        },
        accent: {
          cyan: "#46d369",
          violet: "#8b5cf6",
          amber: "#f59e0b",
          rose: "#E50914",
        },
        dark: {
          bg: "#101012",
          card: "#18181b",
          border: "#27272a",
          hover: "#3f3f46",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "sans-serif"],
      },
      animation: {
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        float: "float 4s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
