import { formatDiscountBadge } from "@/lib/format-discount";

describe("formatDiscountBadge", () => {
  it("rounds to a whole percent", () => {
    expect(formatDiscountBadge(28.57)).toBe("29% off");
    expect(formatDiscountBadge("25.00")).toBe("25% off");
    expect(formatDiscountBadge(12.4)).toBe("12% off");
  });

  it("never rounds a partial discount up to 100%", () => {
    expect(formatDiscountBadge(99.6)).toBe("99% off");
    expect(formatDiscountBadge(100)).toBe("100% off");
  });

  it("returns null when there is no discount", () => {
    expect(formatDiscountBadge(0)).toBeNull();
    expect(formatDiscountBadge(-5)).toBeNull();
    expect(formatDiscountBadge(null)).toBeNull();
    expect(formatDiscountBadge(undefined)).toBeNull();
    expect(formatDiscountBadge("not a number")).toBeNull();
  });
});
