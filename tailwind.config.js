/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: [
    './pages/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './app/**/*.{ts,tsx}',
    './src/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
    './hooks/**/*.{ts,tsx}',
	],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      fontFamily: {
        display: ['var(--font-outfit)', 'system-ui', 'sans-serif'],
        sans: ['var(--font-figtree)', 'system-ui', 'sans-serif'],
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        chart: {
          "1": "hsl(var(--chart-1))",
          "2": "hsl(var(--chart-2))",
          "3": "hsl(var(--chart-3))",
          "4": "hsl(var(--chart-4))",
          "5": "hsl(var(--chart-5))",
        },
        // Redesign tokens (see docs/superpowers/specs/2026-10-04-community-redesign-program-design.md)
        canvas: "rgb(var(--ds-canvas) / <alpha-value>)",
        surface: {
          DEFAULT: "rgb(var(--ds-surface) / <alpha-value>)",
          2: "rgb(var(--ds-surface-2) / <alpha-value>)",
          3: "rgb(var(--ds-surface-3) / <alpha-value>)",
        },
        ink: {
          DEFAULT: "rgb(var(--ds-ink) / <alpha-value>)",
          2: "rgb(var(--ds-ink-2) / <alpha-value>)",
          3: "rgb(var(--ds-ink-3) / <alpha-value>)",
        },
        line: {
          DEFAULT: "rgb(var(--ds-line) / <alpha-value>)",
          strong: "rgb(var(--ds-line-strong) / <alpha-value>)",
        },
        brand: {
          DEFAULT: "rgb(var(--ds-brand) / <alpha-value>)",
          hover: "rgb(var(--ds-brand-hover) / <alpha-value>)",
          ink: "rgb(var(--ds-brand-ink) / <alpha-value>)",
          soft: "rgb(var(--ds-brand-soft) / <alpha-value>)",
          line: "rgb(var(--ds-brand-line) / <alpha-value>)",
        },
        ok: {
          DEFAULT: "rgb(var(--ds-ok) / <alpha-value>)",
          soft: "rgb(var(--ds-ok-soft) / <alpha-value>)",
        },
        warn: {
          DEFAULT: "rgb(var(--ds-warn) / <alpha-value>)",
          soft: "rgb(var(--ds-warn-soft) / <alpha-value>)",
        },
        live: {
          DEFAULT: "rgb(var(--ds-live) / <alpha-value>)",
          soft: "rgb(var(--ds-live-soft) / <alpha-value>)",
        },
        heart: "rgb(var(--ds-heart) / <alpha-value>)",
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      boxShadow: {
        card: "0 1px 2px rgba(30, 23, 48, .06), 0 1px 1px rgba(30, 23, 48, .03)",
        raised: "0 10px 28px -12px rgba(30, 23, 48, .22), 0 2px 6px rgba(30, 23, 48, .05)",
        overlay: "0 24px 60px -20px rgba(30, 23, 48, .35), 0 4px 12px rgba(30, 23, 48, .08)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: 0 },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: 0 },
        },
        "gradient-shift": {
          "0%, 100%": { backgroundPosition: "0% 50%" },
          "50%": { backgroundPosition: "100% 50%" },
        },
        "float": {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-5px)" },
        },
        "glow-pulse": {
          "0%, 100%": { boxShadow: "0 0 20px hsl(265 65% 60% / 0.3)" },
          "50%": { boxShadow: "0 0 30px hsl(265 65% 60% / 0.5)" },
        },
        "bounce-subtle": {
          "0%": { transform: "scale(0.95)" },
          "50%": { transform: "scale(1.02)" },
          "100%": { transform: "scale(1)" },
        },
        "slide-in-left": {
          "0%": { transform: "translateX(-10px)", opacity: "0" },
          "100%": { transform: "translateX(0)", opacity: "1" },
        },
        "heart-pop": {
          "0%": { transform: "scale(1)" },
          "35%": { transform: "scale(1.38)" },
          "70%": { transform: "scale(.92)" },
          "100%": { transform: "scale(1)" },
        },
        "just-posted": {
          "0%, 30%": { backgroundColor: "rgb(var(--ds-brand-soft))", borderColor: "rgb(var(--ds-brand-line))" },
          "100%": { backgroundColor: "rgb(var(--ds-surface))" },
        },
        "pop-in": {
          from: { opacity: "0", transform: "translateY(-4px) scale(.98)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "gradient-shift": "gradient-shift 8s ease infinite",
        "float": "float 3s ease-in-out infinite",
        "glow-pulse": "glow-pulse 2s ease-in-out infinite",
        "bounce-subtle": "bounce-subtle 0.3s ease-out",
        "slide-in-left": "slide-in-left 0.2s ease-out",
        "heart-pop": "heart-pop .4s cubic-bezier(.2,.7,.2,1)",
        "just-posted": "just-posted 2.2s cubic-bezier(.2,.7,.2,1)",
        "pop-in": "pop-in .16s cubic-bezier(.2,.7,.2,1)",
      },
    },
  },
  plugins: [
    require("tailwindcss-animate"),
    require('@tailwindcss/typography')
  ],
} 