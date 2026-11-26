import { describe, expect, it } from "vitest";
import { isValidPhone, maskPhone, normalizePhone } from "./format";

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
