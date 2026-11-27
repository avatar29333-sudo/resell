import { describe, expect, it } from "vitest";
import { isPrivatePath, pageMeta } from "./meta";

describe("UX-08 SEO basics", () => {
  it("private pages are noindex, public ones aren't", () => {
    for (const p of ["/ar/account", "/en/deals/abc", "/ar/broker?tab=x", "/ar/settings", "/ar/listings/abc/report", "/api/files/x"]) expect(isPrivatePath(p.split("?")[0]), p).toBe(true);
    for (const p of ["/ar", "/ar/listings", "/en/listings/abc", "/ar/price-index", "/ar/rescue"]) expect(isPrivatePath(p), p).toBe(false);
  });
  it("page titles follow the language", async () => {
    expect(await pageMeta(Promise.resolve({ locale: "ar" }), "سجل العروض", "Listings register")).toEqual({ title: "سجل العروض" });
    expect(await pageMeta(Promise.resolve({ locale: "en" }), "حسابي", "My account", { noindex: true })).toEqual({ title: "My account", robots: { index: false, follow: false } });
  });
});
