/**
 * BANK-01 / FEE-01 — قواعد الحسابات البنكية ومصاريف التحويل (منطق نقي، متغطي باختبار).
 */

/** أطوال IBAN حسب الدولة (ISO 13616) */
export const IBAN_LENGTHS: Record<string, number> = {
  EG: 29, SA: 24, AE: 23, KW: 30, QA: 29, BH: 22, OM: 23, JO: 30, LB: 28, TR: 26, IQ: 23, PS: 29, LY: 25, TN: 24, MA: 28,
  GB: 22, IE: 22, DE: 22, FR: 27, IT: 27, ES: 24, NL: 18, BE: 16, AT: 20, CH: 21, SE: 24, NO: 15, DK: 18, FI: 18, PT: 25, GR: 27, PL: 28, CY: 28, MT: 31, LU: 20,
};

export const normIban = (s: string) => s.replace(/\s+/g, "").toUpperCase();

/** IBAN صحيح: طول الدولة + رقم المراجعة mod-97 */
export function ibanValid(raw: string) {
  const iban = normIban(raw);
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(iban)) return false;
  const len = IBAN_LENGTHS[iban.slice(0, 2)];
  if (len ? iban.length !== len : iban.length < 15 || iban.length > 34) return false;
  const moved = iban.slice(4) + iban.slice(0, 4);
  const digits = moved.replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  let rem = 0;
  for (const ch of digits) rem = (rem * 10 + Number(ch)) % 97;
  return rem === 1;
}

/** SWIFT/BIC: 8 أو 11 حرف (بنك 4 حروف + دولة 2 + مكان 2 + فرع 3 اختياري) */
export const swiftValid = (raw: string) => /^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(raw.replace(/\s+/g, "").toUpperCase());

/** العرض المخفي: EG•• •••• •••• 4417 */
export function maskIban(raw: string) {
  const iban = normIban(raw);
  return `${iban.slice(0, 2)}•• •••• •••• ${iban.slice(-4)}`;
}

/** الاسم على الحساب لازم يطابق الاسم الموثّق (من غير مسافات/تشكيل/همزات، وترتيب الكلمات مش مهم) */
export function namesMatch(a: string, b: string) {
  const n = (s: string) =>
    s
      .toLowerCase()
      .replace(/[ً-ْـ]/g, "")
      .replace(/[أإآ]/g, "ا")
      .replace(/ى/g, "ي")
      .replace(/ة/g, "ه")
      .replace(/[^a-zء-ي\s]/g, " ")
      .split(/\s+/)
      .filter(Boolean)
      .sort()
      .join(" ");
  return !!n(a) && n(a) === n(b);
}

export const COOLING_MS = 48 * 3600_000;

export type PayoutAccount = { status: string; usableAfter: Date; userId: string } | null | undefined;
export type PayoutBlock = "no_account" | "not_verified" | "cooling" | "disabled" | "wrong_owner";

/** الصرف (إفراج عربون / رد / عمولة شريك) على حساب VERIFIED بس، وبعد فترة الانتظار، وبتاع المستلم نفسه */
export function payoutBlock(acc: PayoutAccount, recipientId: string, now: Date): PayoutBlock | null {
  if (!acc) return "no_account";
  if (acc.userId !== recipientId) return "wrong_owner";
  if (acc.status === "DISABLED") return "disabled";
  if (acc.status !== "VERIFIED") return "not_verified";
  if (acc.usableAfter > now) return "cooling";
  return null;
}

/** FEE-01: مصاريف التحويل على المستلم — الصافي = المبلغ − المصاريف */
export function netAfterFees(amount: number, fee: number) {
  const f = Math.max(0, Math.round(fee * 100) / 100);
  return { amount, fee: f, net: Math.max(0, Math.round((amount - f) * 100) / 100) };
}

export const FEE_NOTICE: [string, string] = [
  "أي عمولات أو مصاريف تحويل بنكي يتحملها المحوَّل له، ولا تتحملها المنصة.",
  "Any bank transfer fees or charges are borne by the recipient, never by the platform.",
];
