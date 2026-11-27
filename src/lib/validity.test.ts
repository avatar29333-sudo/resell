import { describe, expect, it } from "vitest";
import { statementExpiry, validityState } from "./validity";

const now = new Date("2026-11-27T08:00:00Z");

describe("DATA-03 authority statement validity", () => {
  it("expires 3 months (setting) after its date", () => {
    expect(statementExpiry(new Date("2026-08-15T00:00:00Z"), 3).toISOString().slice(0, 10)).toBe("2026-11-15");
  });
  it("is expired once the date passes", () => {
    expect(validityState(new Date("2026-11-26T00:00:00Z"), now, 30)).toBe("expired");
  });
  it("warns within 30 days of expiry", () => {
    expect(validityState(new Date("2026-12-20T00:00:00Z"), now, 30)).toBe("warn");
  });
  it("is fine beyond the warning window or with no expiry", () => {
    expect(validityState(new Date("2027-02-01T00:00:00Z"), now, 30)).toBe("ok");
    expect(validityState(null, now, 30)).toBe("ok");
  });
});
