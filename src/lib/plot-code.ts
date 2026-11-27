/**
 * DATA-07 / GEO-04 — كود القطعة: صيغة لكل مدينة (City.codePrefix + City.plotCodePattern)، مثلاً {prefix}-{block}-{number} → NC-8E-1016.
 * التوحيد قبل الحفظ وقبل كشف التكرار: حروف كبيرة، أرقام عربي → إنجليزي، شيل المسافات،
 * وأي فاصل (مسافة / _ / . / شرطة زيادة) يبقى شرطة واحدة.
 * الخرايط دي بتتحدث من جدول المدن (lib/cities.ts)؛ القيم هنا افتراضية للمدن الخمسة الأولى.
 */
export const DEFAULT_PATTERN = "{prefix}-{block}-{number}";

export const CITY_PREFIX: Record<string, string> = {
  NEW_CAIRO: "NC",
  SHEIKH_ZAYED: "SZ",
  OCTOBER: "OC",
  NEW_OCTOBER: "NO",
  NEW_DAMIETTA: "ND",
};
export const CITY_PATTERN: Record<string, string> = {};

export type CodeSpec = { codePrefix: string; plotCodePattern?: string | null };

const TOKENS: Record<string, string> = { block: "[A-Z0-9]{1,4}", number: "\\d{1,5}" };
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** الصيغة → regex (البادئة لازم تطابق) */
export function patternRegex(spec: CodeSpec) {
  const pattern = spec.plotCodePattern || DEFAULT_PATTERN;
  const body = pattern
    .split(/(\{[a-z]+\})/)
    .map((part) => {
      const t = part.match(/^\{([a-z]+)\}$/)?.[1];
      if (!t) return esc(part);
      if (t === "prefix") return esc(spec.codePrefix);
      return TOKENS[t] ?? "[A-Z0-9]{1,6}";
    })
    .join("");
  return new RegExp(`^${body}$`);
}

/** الصيغة العامة (أي بادئة) — بتفرّق بين «شكل غلط» و«بادئة مدينة تانية» */
function genericRegex(spec: CodeSpec) {
  return patternRegex({ codePrefix: "\u0000", plotCodePattern: spec.plotCodePattern }).source.replace("\u0000", "[A-Z]{2,4}");
}

/** تلميح للمستخدم: مثال + وصف */
export function codeHint(spec: CodeSpec, ar: boolean) {
  const p = spec.plotCodePattern || DEFAULT_PATTERN;
  const example = p.replace("{prefix}", spec.codePrefix).replace("{block}", "8E").replace("{number}", "1016");
  const words = p
    .replace("{prefix}", spec.codePrefix)
    .replace("{block}", ar ? "البلوك" : "block")
    .replace("{number}", ar ? "الرقم" : "number");
  return { example, words };
}

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

export function specFor(city: string): CodeSpec | null {
  const prefix = CITY_PREFIX[city];
  return prefix ? { codePrefix: prefix, plotCodePattern: CITY_PATTERN[city] ?? DEFAULT_PATTERN } : null;
}

/** null = سليم، غير كده كود الخطأ. spec بيتبعت من المتصفح (المدن الجديدة)، وإلا بيتاخد من الخرايط */
export function checkCode(city: string, raw: string, spec?: CodeSpec | null): { code: string; error: null | "format" | "prefix" } {
  const code = normalizeCode(raw);
  const s = spec ?? specFor(city);
  if (!s) return { code, error: "format" };
  if (patternRegex(s).test(code)) return { code, error: null };
  return { code, error: new RegExp(genericRegex(s)).test(code) ? "prefix" : "format" };
}
