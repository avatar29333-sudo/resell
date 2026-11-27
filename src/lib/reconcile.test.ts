import { describe, expect, it } from "vitest";
import { heldTotalAt, monthEnd, reconcileDiff } from "./reconcile";

const d = (s: string) => new Date(s);

describe("OPS-01 monthly reconciliation", () => {
  it("month end is the last moment of the month", () => {
    expect(monthEnd("2026-02").toISOString()).toBe("2026-02-28T23:59:59.999Z");
  });
  it("counts deposits held at month end only", () => {
    const deposits = [
      { amount: 100_000, heldAt: d("2026-10-05"), settledAt: null }, // محفوظ
      { amount: 50_000, heldAt: d("2026-10-10"), settledAt: d("2026-11-03") }, // اتصرف بعد آخر الشهر → محسوب
      { amount: 70_000, heldAt: d("2026-10-12"), settledAt: d("2026-10-20") }, // اتصرف جوه الشهر → مش محسوب
      { amount: 30_000, heldAt: d("2026-11-02"), settledAt: null }, // اتحفظ بعد الشهر
      { amount: 20_000, heldAt: null, settledAt: null }, // لسه ما وصلش
    ];
    expect(heldTotalAt(deposits, monthEnd("2026-10"))).toBe(150_000);
  });
  it("shows the difference against the bank statement", () => {
    expect(reconcileDiff(150_000, 150_000)).toEqual({ diff: 0, matched: true });
    expect(reconcileDiff(150_000, 149_500)).toEqual({ diff: -500, matched: false });
  });
});
