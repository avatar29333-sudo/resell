// مطابقة طلبات الشراء مع العروض — من غير قاعدة بيانات عشان تتختبر لوحدها
export type BuyCriteria = { cities: string[]; minAreaSqm: number | null; maxAreaSqm: number | null; budgetMax: number | null };
export type ListingFacts = { city: string; areaSqm: number; totalEgp: number };

export function matches(req: BuyCriteria, l: ListingFacts) {
  if (req.cities.length && !req.cities.includes(l.city)) return false;
  if (req.minAreaSqm && l.areaSqm < req.minAreaSqm) return false;
  if (req.maxAreaSqm && l.areaSqm > req.maxAreaSqm) return false;
  if (req.budgetMax && l.totalEgp > req.budgetMax) return false;
  return true;
}
