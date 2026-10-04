import fs from "fs";
import path from "path";

// tailwind.config.js is CommonJS.
const config = require("../../tailwind.config.js");
const css = fs.readFileSync(path.join(__dirname, "../../app/globals.css"), "utf8");

const TOKENS = [
  "canvas", "surface", "surface-2", "surface-3",
  "ink", "ink-2", "ink-3", "line", "line-strong",
  "brand", "brand-hover", "brand-ink", "brand-soft", "brand-line",
  "ok", "ok-soft", "warn", "warn-soft", "live", "live-soft",
];

describe("design tokens", () => {
  it.each(TOKENS)("defines --ds-%s as RGB channels", (token) => {
    expect(css).toMatch(new RegExp(`--ds-${token}:\\s*\\d{1,3} \\d{1,3} \\d{1,3};`));
  });

  it("maps tokens to Tailwind with opacity support", () => {
    const c = config.theme.extend.colors;
    expect(c.canvas).toBe("rgb(var(--ds-canvas) / <alpha-value>)");
    expect(c.surface.DEFAULT).toBe("rgb(var(--ds-surface) / <alpha-value>)");
    expect(c.surface["2"]).toBe("rgb(var(--ds-surface-2) / <alpha-value>)");
    expect(c.ink["3"]).toBe("rgb(var(--ds-ink-3) / <alpha-value>)");
    expect(c.line.strong).toBe("rgb(var(--ds-line-strong) / <alpha-value>)");
    expect(c.brand.soft).toBe("rgb(var(--ds-brand-soft) / <alpha-value>)");
    expect(c.live.soft).toBe("rgb(var(--ds-live-soft) / <alpha-value>)");
  });

  it("keeps the old color names unchanged", () => {
    const c = config.theme.extend.colors;
    expect(c.primary.DEFAULT).toBe("hsl(var(--primary))");
    expect(c.background).toBe("hsl(var(--background))");
  });

  it("defines the three shadows", () => {
    expect(Object.keys(config.theme.extend.boxShadow)).toEqual(
      expect.arrayContaining(["card", "raised", "overlay"])
    );
  });
});
