import { describe, expect, it } from "vitest";
import { validityMessage } from "@/components/LocalizedValidity";

// عنصر وهمي بنفس شكل حالة التحقق في المتصفح
const el = (validity: Partial<ValidityState>, extra: Record<string, unknown> = {}) =>
  ({ tagName: "INPUT", type: "number", min: "0", max: "100", minLength: 10, maxLength: 50, value: "abc", title: "", validity: { ...validity }, ...extra }) as unknown as HTMLInputElement;

describe("UX-04 localized validation messages", () => {
  it("required fields in Arabic and English", () => {
    expect(validityMessage(el({ valueMissing: true }), "ar")).toBe("الخانة دي مطلوبة");
    expect(validityMessage(el({ valueMissing: true }), "en")).toBe("This field is required");
    expect(validityMessage(el({ valueMissing: true }, { type: "file" }), "ar")).toBe("اختار ملف");
  });
  it("ranges say the limit instead of the browser's 'Value must be…'", () => {
    expect(validityMessage(el({ rangeOverflow: true }), "ar")).toBe("أكبر قيمة مسموحة 100");
    expect(validityMessage(el({ rangeUnderflow: true }), "en")).toBe("The minimum is 0");
  });
  it("too short shows how many characters are needed", () => {
    expect(validityMessage(el({ tooShort: true }), "ar")).toContain("على الأقل 10 حروف");
  });
});
