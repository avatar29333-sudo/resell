import { describe, expect, it } from "vitest";
import { bothConsented, dealDays, storyText } from "./stories";

describe("MKT-14 deal stories", () => {
  it("only city and duration, no names; code only if consented", () => {
    expect(storyText("ar", "الشيخ زايد", 41.6)).toBe("قطعة في الشيخ زايد اتباعت واتنقلت ملكيتها في الجهاز خلال 42 يوم — بورق متراجع مع محامي وعربون محفوظ في البنك.");
    expect(storyText("en", "New Cairo", 30, "NC-8E-1016")).toContain("(NC-8E-1016)");
  });
  it("needs both parties' consent", () => {
    expect(bothConsented({ buyerConsentAt: new Date(), sellerConsentAt: null })).toBe(false);
    expect(bothConsented({ buyerConsentAt: new Date(), sellerConsentAt: new Date() })).toBe(true);
  });
  it("duration from interest to closing", () => {
    expect(dealDays(new Date("2026-10-01"), new Date("2026-11-10"))).toBe(40);
  });
});
