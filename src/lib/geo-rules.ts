/** GEO-01..04 — قواعد بيانات المدن والأحياء والطروحات (منطق نقي، متغطي باختبار) */

/** GEO-03: الاسم الإنجليزي حروف لاتيني بس (وأرقام ومسافات وعلامات بسيطة) */
export const isLatinName = (s: string) => /^[A-Za-z0-9][A-Za-z0-9 .,'()&\-]{1,79}$/.test(s.trim());

/** GEO-04: الصيغة لازم فيها {prefix} و{number}، والرموز المسموحة بس، والفاصل شرطة */
export function validPattern(p: string) {
  const s = p.trim();
  if (!s.includes("{prefix}") || !s.includes("{number}")) return false;
  const rest = s.replace(/\{(prefix|block|number)\}/g, "");
  return /^[-A-Z0-9]*$/.test(rest) && !/\{|\}/.test(rest);
}

export const validPrefix = (p: string) => /^[A-Z]{2,4}$/.test(p.trim());

export function slugFromName(nameEn: string) {
  return nameEn
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** مفتاح المدينة الجديدة (نفس شكل المفاتيح القديمة: NEW_CAIRO) */
export const cityIdFromSlug = (slug: string) => slug.toUpperCase().replace(/-/g, "_");
