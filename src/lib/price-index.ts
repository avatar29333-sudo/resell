/**
 * DATA-04 — مؤشر الأسعار من الصفقات المقفولة فعلاً بس (منطق نقي، متغطي باختبار).
 * لو عدد الصفقات في مدينة/شهر أقل من الحد الأدنى (إعداد) → ما فيش رقم («بيانات غير كافية»).
 * نفس الدالة بتستخدمها صفحة المؤشر وصفحة التقارير، فالأرقام دايماً متطابقة.
 */
export type ClosedDeal = { city: string; closedAt: Date; areaSqm: number; priceEgp: number };
export type IndexPoint = { city: string; month: string; deals: number; avgPerSqm: number | null };

const monthKey = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;

export function computeIndex(deals: ClosedDeal[], minDeals: number): IndexPoint[] {
  const groups = new Map<string, { city: string; month: string; perSqm: number[] }>();
  for (const d of deals) {
    if (!(d.areaSqm > 0) || !(d.priceEgp > 0)) continue;
    const month = monthKey(d.closedAt);
    const k = `${d.city}|${month}`;
    const g = groups.get(k) ?? { city: d.city, month, perSqm: [] };
    g.perSqm.push(d.priceEgp / d.areaSqm);
    groups.set(k, g);
  }
  return [...groups.values()]
    .map((g) => ({
      city: g.city,
      month: g.month,
      deals: g.perSqm.length,
      avgPerSqm: g.perSqm.length >= minDeals ? Math.round(g.perSqm.reduce((a, b) => a + b, 0) / g.perSqm.length) : null,
    }))
    .sort((a, b) => a.city.localeCompare(b.city) || a.month.localeCompare(b.month));
}

/** سعر الصفقة بالجنيه (لو متفق عليه بالدولار: بسعر الصرف المثبّت فيها) */
export function dealPriceEgp(agreed: number, currency: string | null | undefined, lockedRate: number | null | undefined) {
  if (currency === "USD") return lockedRate ? agreed * lockedRate : 0;
  return agreed;
}
