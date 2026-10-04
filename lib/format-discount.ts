/**
 * The member discount badge on private lessons: "28.57" -> "29% off".
 * A partial discount never rounds up to 100%, which would read as free.
 */
export function formatDiscountBadge(
  percent: number | string | null | undefined
): string | null {
  const n = typeof percent === "string" ? parseFloat(percent) : percent ?? NaN;
  if (!Number.isFinite(n) || n <= 0) return null;
  const rounded = n < 100 ? Math.min(Math.round(n), 99) : 100;
  return `${rounded}% off`;
}
