import { describe, expect, it } from "vitest";
import { dateTime, isValidPhone, maskPhone, normalizePhone } from "./format";

describe("UX-05 times are shown in Cairo time and say so", () => {
  it("converts to Cairo and labels the zone", () => {
    const t = dateTime("2026-11-27T10:00:00Z", "en");
    expect(t).toContain("12:00");
    expect(t).toContain("Cairo time");
    expect(dateTime("2026-11-27T10:00:00Z", "ar")).toContain("بتوقيت القاهرة");
  });
});

describe("أرقام الموبايل في التسجيل", () => {
  it("بيوحّد الصيغ المختلفة لنفس الرقم", () => {
    expect(normalizePhone("+966 50 123 4567")).toBe("+966501234567");
    expect(normalizePhone("00966501234567")).toBe("+966501234567");
    expect(normalizePhone("01001234567")).toBe("+201001234567"); // رقم مصري محلي
    expect(normalizePhone("٠١٠٠١٢٣٤٥٦٧")).toBe("+201001234567"); // أرقام عربية
  });
  it("بيرفض الأرقام الناقصة أو الغلط", () => {
    expect(isValidPhone("+96650")).toBe(false);
    expect(isValidPhone("+0123456789")).toBe(false);
    expect(isValidPhone("+201001234567")).toBe(true);
  });
  it("بيخبّي نص الرقم", () => {
    expect(maskPhone("+201001234567")).toBe("+20100 ••• 4567");
  });
});
