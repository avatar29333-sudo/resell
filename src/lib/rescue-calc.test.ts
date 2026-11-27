import { describe, expect, it } from "vitest";
import { rescueFee, suggestedPrice, tierFor } from "./rescue-calc";

describe("MKT-01 deadline rescue calculator", () => {
  it("picks the tier from construction progress", () => {
    expect(tierFor(80)).toBe("a");
    expect(tierFor(50)).toBe("b");
    expect(tierFor(35)).toBe("b");
    expect(tierFor(10)).toBe("c");
  });
  it("10% of the current price in EGP and USD for the middle tier", () => {
    expect(rescueFee("b", 4_000_000, 50, 10)).toEqual({ egp: 400_000, usd: 8_000, free: false, review: false });
  });
  it("free for over 70%, review for under 35%", () => {
    expect(rescueFee("a", 4_000_000, 50, 10).free).toBe(true);
    expect(rescueFee("c", 4_000_000, 50, 10)).toMatchObject({ egp: null, review: true });
  });
  it("suggests a price from the real index only when available", () => {
    expect(suggestedPrice(400, 10_000)).toBe(4_000_000);
    expect(suggestedPrice(400, null)).toBeNull();
  });
});
