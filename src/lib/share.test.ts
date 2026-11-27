import { describe, expect, it } from "vitest";
import { shareUrl, whatsappHref } from "./share";

describe("MKT-05 share links", () => {
  it("adds the UTM tags and the referral code", () => {
    expect(shareUrl("https://resell.test", "/ar/listings/abc", "AB12CD")).toBe("https://resell.test/ar/listings/abc?utm_source=whatsapp&utm_medium=share&ref=AB12CD");
  });
  it("no ref for visitors without a code; copy-link uses its own source", () => {
    expect(shareUrl("https://resell.test", "/ar/listings/abc", null, "copy")).toBe("https://resell.test/ar/listings/abc?utm_source=copy&utm_medium=share");
  });
  it("builds a WhatsApp share link with the text and URL", () => {
    expect(whatsappHref("أرض 405م²", "https://x/y")).toBe(`https://wa.me/?text=${encodeURIComponent("أرض 405م²\nhttps://x/y")}`);
  });
});
