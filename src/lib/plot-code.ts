/**
 * DATA-07 — كود القطعة: تنسيق موحّد «بادئة المدينة-البلوك-الرقم»، مثلاً NC-8E-1016.
 * التوحيد قبل الحفظ وقبل كشف التكرار: حروف كبيرة، أرقام عربي → إنجليزي، شيل المسافات،
 * وأي فاصل (مسافة / _ / . / شرطة زيادة) يبقى شرطة واحدة.
 */
export const CITY_PREFIX: Record<string, string> = {
  NEW_CAIRO: "NC",
  SHEIKH_ZAYED: "SZ",
  OCTOBER: "OC",
  NEW_OCTOBER: "NO",
  NEW_DAMIETTA: "ND",
};

export const CODE_RE = /^(NC|SZ|OC|NO|ND)-[A-Z0-9]{1,4}-\d{1,5}$/;

export function normalizeCode(raw: string) {
  return raw
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .toUpperCase()
    .trim()
    .replace(/[\s_./\\–—]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/** null = سليم، غير كده كود الخطأ */
export function checkCode(city: string, raw: string): { code: string; error: null | "format" | "prefix" } {
  const code = normalizeCode(raw);
  if (!CODE_RE.test(code)) return { code, error: "format" };
  if (code.split("-")[0] !== CITY_PREFIX[city]) return { code, error: "prefix" };
  return { code, error: null };
}
