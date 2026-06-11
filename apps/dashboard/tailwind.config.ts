import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./hooks/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        ocean: {
          50: "#E6FAFF",
          100: "#BFF3FF",
          300: "#7DD3FC",
          400: "#38BDF8",
          500: "#12B8DE",
          600: "#0067FB",
          700: "#0A29FF",
          950: "#020817",
        },
      },
      boxShadow: {
        ocean: "0 0 60px rgba(18, 184, 222, 0.22)",
        "ocean-soft": "0 0 120px rgba(59, 130, 246, 0.16)",
      },
      keyframes: {
        "fade-up": {
          "0%": {
            opacity: "0",
            transform: "translateY(12px)",
          },
          "100%": {
            opacity: "1",
            transform: "translateY(0)",
          },
        },
        "pulse-glow": {
          "0%, 100%": {
            opacity: "0.45",
          },
          "50%": {
            opacity: "0.9",
          },
        },
      },
      animation: {
        "fade-up": "fade-up 420ms ease-out both",
        "pulse-glow": "pulse-glow 4s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;