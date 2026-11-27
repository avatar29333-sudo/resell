import { describe, expect, it } from "vitest";
import { EVENTS, isEvent } from "./analytics";
import { buildCsp } from "./csp";

describe("MKT-11 analytics with consent", () => {
  it("has exactly the agreed event names", () => {
    expect([...EVENTS]).toEqual(["lead_rescue_submitted", "valuation_requested", "listing_submitted", "interest_registered", "commission_signed", "deal_closed", "referral_signup"]);
    expect(isEvent("deal_closed")).toBe(true);
    expect(isEvent("anything_else")).toBe(false);
  });
  it("CSP only opens analytics domains when IDs are configured", () => {
    expect(buildCsp("n")).not.toContain("google-analytics");
    expect(buildCsp("n", { analytics: { connect: "https://*.google-analytics.com", img: "https://www.facebook.com" } })).toContain("https://*.google-analytics.com");
  });
});
