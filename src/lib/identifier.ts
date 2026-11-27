// تصنيف اللي العميل كتبه في خانة الدخول: موبايل دولي أو إيميل بس (SEC-01).
// البحث بالاسم اتشال نهائياً لأنه كان بيسمح لأي حد يطلب رمز لحساب غيره بمجرد كتابة اسمه.
import { isValidPhone, normalizePhone } from "./format";

export type Identifier = { kind: "phone"; value: string } | { kind: "email"; value: string } | { kind: "invalid" };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function classifyIdentifier(raw: string): Identifier {
  const s = raw.trim();
  if (!s) return { kind: "invalid" };
  if (s.includes("@")) return EMAIL.test(s) ? { kind: "email", value: s.toLowerCase() } : { kind: "invalid" };
  // لازم يبقى أرقام بس (مع + ومسافات وشرط) — أي حروف = مش رقم
  if (/[^\d٠-٩+\s\-()]/.test(s)) return { kind: "invalid" };
  const phone = normalizePhone(s);
  return isValidPhone(phone) ? { kind: "phone", value: phone } : { kind: "invalid" };
}
