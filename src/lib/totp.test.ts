import { describe, expect, it } from "vitest";
import { base32Decode, base32Encode, decryptSecret, encryptSecret, newSecret, totpAt, verifyTotp } from "./totp";

// قيم الاختبار الرسمية من RFC 6238 (السر = "12345678901234567890")
const RFC_SECRET = base32Encode(Buffer.from("12345678901234567890"));

describe("TOTP", () => {
  it("بيطابق قيم RFC 6238", () => {
    expect(totpAt(RFC_SECRET, Math.floor(59 / 30))).toBe("287082");
    expect(totpAt(RFC_SECRET, Math.floor(1111111109 / 30))).toBe("081804");
    expect(totpAt(RFC_SECRET, Math.floor(1234567890 / 30))).toBe("005924");
  });

  it("base32 رايح جاي", () => {
    const s = newSecret();
    expect(base32Encode(base32Decode(s))).toBe(s);
  });

  it("بيقبل الرمز الحالي واللي قبله بـ 30 ثانية، ويرفض الغلط", () => {
    const s = newSecret();
    const now = 1_800_000_000_000;
    const step = Math.floor(now / 30_000);
    expect(verifyTotp(s, totpAt(s, step), now)).toBe(true);
    expect(verifyTotp(s, totpAt(s, step - 1), now)).toBe(true);
    expect(verifyTotp(s, totpAt(s, step - 3), now)).toBe(false);
    expect(verifyTotp(s, "12345", now)).toBe(false);
  });

  it("السر بيتشفّر ويرجع زي ما هو", () => {
    const s = newSecret();
    const enc = encryptSecret(s);
    expect(enc).not.toContain(s);
    expect(decryptSecret(enc)).toBe(s);
  });
});
