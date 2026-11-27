import { checkCode } from "./plot-code";

/**
 * تحقق بيانات القطعة في السيرفر (DATA-07 + DATA-09) — منطق نقي، متغطي باختبار.
 * بيرجع الأخطاء لكل حقل لوحده عشان الرسالة تظهر جنب الحقل (UX-01).
 */
export type PlotErrors = Partial<Record<"city" | "district" | "code" | "area" | "construction" | "deadline" | "price" | "paidUsd", string>>;

export function validatePlotInput<D extends { id: string; city: string; active: boolean }>(
  f: { city: string; districtId: string; code: string; area: string; construction: string; deadline: string; price: string; priceType: string; paidUsd: string },
  ctx: { cities: string[]; districts: D[]; today: Date },
) {
  const errors: PlotErrors = {};
  if (!ctx.cities.includes(f.city)) errors.city = "required";
  const district = ctx.districts.find((d) => d.id === f.districtId && d.active);
  if (!district || district.city !== f.city) errors.district = "required";
  const code = checkCode(f.city, f.code);
  if (!f.code.trim()) errors.code = "required";
  else if (code.error) errors.code = code.error;
  const area = Number(f.area);
  if (!(area >= 50 && area <= 5000)) errors.area = "range";
  // DATA-09: نسبة التنفيذ 0–100 (رقم صحيح)
  const construction = f.construction.trim() === "" ? 0 : Number(f.construction);
  if (!Number.isInteger(construction) || construction < 0 || construction > 100) errors.construction = "range";
  // DATA-09: المهلة في الماضي مقبولة، بس بتتعلّم «خلصت»
  let deadline: Date | null = null;
  if (f.deadline) {
    deadline = new Date(`${f.deadline}T00:00:00Z`);
    if (Number.isNaN(deadline.getTime())) errors.deadline = "invalid";
  }
  const price = Number(f.price);
  if (!(price > 0)) errors.price = "required";
  const premium = f.priceType === "PAID_PLUS_PREMIUM";
  const paidUsd = Number(f.paidUsd) || null;
  if (premium && !(paidUsd && paidUsd > 0)) errors.paidUsd = "required";
  const deadlinePassed = !!deadline && !errors.deadline && deadline.getTime() < Date.UTC(ctx.today.getUTCFullYear(), ctx.today.getUTCMonth(), ctx.today.getUTCDate());
  return {
    errors,
    ok: Object.keys(errors).length === 0,
    values: { code: code.code, area, construction, deadline, deadlinePassed, price, paidUsd: premium ? paidUsd : null, district },
  };
}
