import { describe, expect, it } from "vitest";
import { isDemoMode } from "./demo";

describe("SEC-01 — DEMO_MODE", () => {
  it("مقفول افتراضياً", () => {
    expect(isDemoMode({})).toBe(false);
    expect(isDemoMode({ DEMO_MODE: "" })).toBe(false);
    expect(isDemoMode({ DEMO_MODE: "1" })).toBe(false);
    expect(isDemoMode({ DEMO_MODE: "false" })).toBe(false);
  });
  it("بيتفتح بـ true بس", () => {
    expect(isDemoMode({ DEMO_MODE: "true" })).toBe(true);
  });
});
