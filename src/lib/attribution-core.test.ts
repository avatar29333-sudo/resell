import { describe, expect, it } from "vitest";
import { channelOf, decodeTouch, encodeTouch, sourceOf, touchFrom } from "./attribution-core";

const now = new Date("2026-11-27T10:00:00Z");

describe("MKT-10 source tracking", () => {
  it("captures utm, external referrer and referral code", () => {
    const t = touchFrom(new URL("https://resell.test/ar/listings?utm_source=whatsapp&utm_medium=share&ref=ab12cd"), "https://l.facebook.com/x", "resell.test", now);
    expect(t).toMatchObject({ utm_source: "whatsapp", utm_medium: "share", referrer: "l.facebook.com", ref: "AB12CD", landing: "/ar/listings" });
  });
  it("ignores internal navigation without campaign data", () => {
    expect(touchFrom(new URL("https://resell.test/ar/listings"), "https://resell.test/ar", "resell.test", now)).toBeNull();
  });
  it("round-trips through the cookie and keeps first/last", () => {
    const a = touchFrom(new URL("https://resell.test/ar?utm_source=google&utm_campaign=rescue"), null, "resell.test", now)!;
    expect(decodeTouch(encodeTouch(a))).toEqual(a);
    expect(decodeTouch("garbage")).toBeNull();
    const b = { ...a, utm_source: "meta" };
    expect(sourceOf(a, b)).toEqual({ first: a, last: b });
    expect(channelOf(sourceOf(a, b))).toBe("google / rescue");
    expect(channelOf(null)).toBe("direct");
  });
});
