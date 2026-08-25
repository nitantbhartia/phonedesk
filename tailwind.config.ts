import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)", "IBM Plex Sans", "sans-serif"],
        display: ["var(--font-display)", "Instrument Serif", "serif"],
        mono: ["var(--font-mono)", "IBM Plex Mono", "monospace"],
      },
      colors: {
        paper: "#F3EEE4",
        ink: "#1C1916",
        line: "#D8D0C4",
        surface: "#FAF7F1",
        "accent-hover": "#571F1F",
        border: "#D8D0C4",
        input: "#D8D0C4",
        ring: "#D46C49",
        background: "#F3EEE4",
        foreground: "#1C1916",
        primary: {
          DEFAULT: "#D46C49",
          foreground: "#FAF7F1",
        },
        secondary: {
          DEFAULT: "#FAF7F1",
          foreground: "#1C1916",
        },
        destructive: {
          DEFAULT: "#D46C49",
          foreground: "#FAF7F1",
        },
        muted: {
          DEFAULT: "#6F675E",
          foreground: "#6F675E",
        },
        accent: {
          DEFAULT: "#D46C49",
          hover: "#571F1F",
          foreground: "#FAF7F1",
        },
        popover: {
          DEFAULT: "#FAF7F1",
          foreground: "#1C1916",
        },
        card: {
          DEFAULT: "#FAF7F1",
          foreground: "#1C1916",
        },
      },
      borderRadius: {
        lg: "4px",
        md: "3px",
        sm: "2px",
      },
      boxShadow: {
        none: "none",
      },
    },
  },
  plugins: [tailwindcssAnimate],
};

export default config;
