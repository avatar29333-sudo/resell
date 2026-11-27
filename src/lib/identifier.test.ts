import { describe, expect, it } from "vitest";
import { classifyIdentifier } from "./identifier";

describe("SEC-01 — الدخول بالموبايل أو الإيميل بس", () => {
  it("كتابة اسم بترجع خطأ تحقق", () => {
    expect(classifyIdentifier("مها الشريف")).toEqual({ kind: "invalid" });
    expect(classifyIdentifier("Maha")).toEqual({ kind: "invalid" });
    expect(classifyIdentifier("ياسمين 0100")).toEqual({ kind: "invalid" });
  });
  it("الموبايل الدولي والمحلي المصري بيتقبلوا", () => {
    expect(classifyIdentifier("+966 50 123 4567")).toEqual({ kind: "phone", value: "+966501234567" });
    expect(classifyIdentifier("01001234567")).toEqual({ kind: "phone", value: "+201001234567" });
  });
  it("الإيميل بيتقبل ويتحوّل لحروف صغيرة", () => {
    expect(classifyIdentifier("Salma@Example.com")).toEqual({ kind: "email", value: "salma@example.com" });
  });
  it("رقم ناقص أو إيميل ناقص = خطأ", () => {
    expect(classifyIdentifier("+2010")).toEqual({ kind: "invalid" });
    expect(classifyIdentifier("a@b")).toEqual({ kind: "invalid" });
    expect(classifyIdentifier("   ")).toEqual({ kind: "invalid" });
  });
});
