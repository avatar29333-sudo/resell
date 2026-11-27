import { describe, expect, it } from "vitest";
import { checkManualRate } from "./fx-rules";

const base = { lastAutoSell: 50, maxDeviationPct: 5, confirmed: false };

describe("OPS-04 manual exchange rate", () => {
  it("requires sell ≥ buy and positive numbers", () => {
    expect(checkManualRate({ ...base, buy: 50, sell: 49 })).toBe("rate_invalid");
    expect(checkManualRate({ ...base, buy: 0, sell: 49 })).toBe("rate_invalid");
  });
  it("blocks a rate more than the limit away from the last automatic rate", () => {
    expect(checkManualRate({ ...base, buy: 53, sell: 53 })).toBe("rate_deviation");
  });
  it("allows it with explicit confirmation", () => {
    expect(checkManualRate({ ...base, buy: 53, sell: 53, confirmed: true })).toBeNull();
  });
  it("allows a rate within the limit", () => {
    expect(checkManualRate({ ...base, buy: 50.1, sell: 51 })).toBeNull();
  });
});
