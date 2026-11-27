import { db } from "./db";
import { CITY, CITY_KEYS } from "./labels";
import { CITY_SLUG } from "./slugs";
import { CITY_PATTERN, CITY_PREFIX } from "./plot-code";

/**
 * GEO-01 — المدن من الجدول. أي إضافة/تعديل من الأدمن بتظهر من غير deploy.
 * الخرايط القديمة (الأسماء، الروابط، بادئة الكود) بتتحدث من الجدول هنا، فكل الشاشات بتقرا نفس المصدر.
 */
export type CityRow = { id: string; nameAr: string; nameEn: string; slug: string; codePrefix: string; plotCodePattern: string; isActive: boolean; sortOrder: number };

const TTL_MS = 30_000;
let cache: { at: number; rows: CityRow[] } | null = null;

function apply(rows: CityRow[]) {
  for (const r of rows) {
    (CITY as Record<string, readonly [string, string]>)[r.id] = [r.nameAr, r.nameEn];
    CITY_SLUG[r.id] = r.slug;
    CITY_PREFIX[r.id] = r.codePrefix;
    CITY_PATTERN[r.id] = r.plotCodePattern;
  }
  // CITY_KEYS = المدن الشغالة بس (للقوايم والإضافة الجديدة)؛ الموقوفة بتفضل ليها اسم على القديم
  const active = rows.filter((r) => r.isActive).map((r) => r.id);
  (CITY_KEYS as string[]).splice(0, CITY_KEYS.length, ...active);
}

/** كل المدن (الموقوفة كمان) مرتبة — مع كاش قصير */
export async function allCities(force = false): Promise<CityRow[]> {
  if (!force && cache && Date.now() - cache.at < TTL_MS) return cache.rows;
  try {
    const rows = await db.city.findMany({ orderBy: [{ sortOrder: "asc" }, { nameAr: "asc" }] });
    cache = { at: Date.now(), rows };
    apply(rows);
    return rows;
  } catch {
    return cache?.rows ?? [];
  }
}

/** المدن الشغالة بس — للقوايم والفلاتر والمعالج */
export async function activeCities() {
  return (await allCities()).filter((c) => c.isActive);
}

/** مدينة موجودة (حتى لو موقوفة) — للتحقق من فلتر أو رابط قديم */
export async function isCity(id: string | null | undefined) {
  return !!id && (await allCities()).some((c) => c.id === id);
}

/** مدينة شغالة — للإضافة الجديدة */
export async function isActiveCity(id: string | null | undefined) {
  return !!id && (await activeCities()).some((c) => c.id === id);
}

export function invalidateCities() {
  cache = null;
}

/** اسم المدينة للعرض */
export function cityName(rows: CityRow[], id: string, locale: "ar" | "en") {
  const c = rows.find((r) => r.id === id);
  return c ? (locale === "ar" ? c.nameAr : c.nameEn) : id;
}

/** بيانات تتبعت للمكونات اللي بتشتغل في المتصفح */
export const cityOptions = (rows: CityRow[]) => rows.map(({ id, nameAr, nameEn, codePrefix, plotCodePattern }) => ({ id, nameAr, nameEn, codePrefix, plotCodePattern }));
export type CityOption = ReturnType<typeof cityOptions>[number];
