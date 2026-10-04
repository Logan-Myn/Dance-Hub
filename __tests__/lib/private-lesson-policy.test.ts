import { canCancel, describeCancellationPolicy, euro, refundOnCancel } from "@/lib/private-lessons/policy";

const now = new Date("2026-10-10T12:00:00Z");
const base = { pricePaid: 45, cutoffHours: 24, latePolicy: "no_refund" as const, role: "student" as const, now };

describe("private lesson policy", () => {
  it("describes the policy without promising what the route won't do", () => {
    expect(describeCancellationPolicy(24, "no_refund")).toBe("Free cancellation up to 24 hours before. No refund within 24 hours.");
    expect(describeCancellationPolicy(1, "no_refund")).toContain("1 hour before");
    // A 0-hour cutoff refunds right up to the start (the route allows it).
    expect(describeCancellationPolicy(0, "no_refund")).toBe("Free cancellation until the lesson starts.");
    expect(describeCancellationPolicy(24, "refund")).toBe("Free cancellation until the lesson starts.");
  });

  it("refunds students before the cutoff only, teachers always", () => {
    expect(refundOnCancel({ ...base, scheduledAt: "2026-10-12T12:00:00Z" })).toBe(45);
    expect(refundOnCancel({ ...base, scheduledAt: "2026-10-11T06:00:00Z" })).toBe(0);
    expect(refundOnCancel({ ...base, scheduledAt: "2026-10-11T06:00:00Z", latePolicy: "refund" })).toBe(45);
    expect(refundOnCancel({ ...base, scheduledAt: "2026-10-11T06:00:00Z", role: "teacher" })).toBe(45);
  });

  it("stops cancels once the lesson started", () => {
    expect(canCancel("2026-10-10T11:59:00Z", now)).toBe(false);
    expect(canCancel("2026-10-10T12:01:00Z", now)).toBe(true);
  });

  it("formats euros", () => {
    expect(euro(45)).toBe("€45");
    expect(euro(45.5)).toBe("€45.50");
  });
});
