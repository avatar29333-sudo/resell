/** MKT-01 — حاسبة إنقاذ المهلة (منطق نقي، متغطي باختبار) */
export type Tier = "a" | "b" | "c";

/** نسبة التنفيذ → الشريحة: أكتر من 70% (a)، 35–70% (b)، أقل من 35% (c) */
export function tierFor(constructionPct: number): Tier {
  return constructionPct > 70 ? "a" : constructionPct >= 35 ? "b" : "c";
}

/** السعر المقترح من المؤشر الحقيقي (لو متاح): المساحة × متوسط سعر المتر في المدينة */
export function suggestedPrice(areaSqm: number, perSqm: number | null | undefined) {
  return perSqm && areaSqm > 0 ? Math.round(areaSqm * perSqm) : null;
}

/** المبلغ: الشريحة (b) = نسبة (إعداد، 10%) من السعر الحالي بالدولار — (a) ببلاش — (c) محتاج مراجعة */
export function rescueFee(tier: Tier, priceEgp: number, usdRate: number, feePct: number) {
  if (tier === "a") return { egp: 0, usd: 0, free: true, review: false };
  if (tier === "c" || !(priceEgp > 0) || !(usdRate > 0)) return { egp: null, usd: null, free: false, review: tier === "c" };
  const egp = Math.round((priceEgp * feePct) / 100);
  return { egp, usd: Math.round(egp / usdRate), free: false, review: false };
}
