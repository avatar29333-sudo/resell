"use server";

/** GEO-01: المدينة = مفتاح نصي من جدول المدن */
type City = string;
import { allCities } from "@/lib/cities";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth";
import { isValidPhone, normalizePhone } from "@/lib/format";
import { CITY_KEYS } from "@/lib/labels";
import { idsByRole, notify } from "@/lib/notifications";
import { readAttribution } from "@/lib/attribution";

export type ValuationState = { ok?: boolean; ref?: string; error?: string; fieldErrors?: Partial<Record<"name" | "phone" | "city" | "district" | "area", string>> };

/** MKT-03: «اعرف قيمة قطعتك» → طلب خدمة نوع VALUATION في طابور الوسيط */
export async function submitValuation(locale: string, _prev: ValuationState, form: FormData): Promise<ValuationState> {
  await allCities(); // GEO-01: قايمة المدن من الجدول
  const ar = locale !== "en";
  const s = (k: string) => String(form.get(k) ?? "").trim();
  const name = s("name");
  const phone = normalizePhone(s("phone"));
  const city = s("city");
  const districtId = s("districtId");
  const area = Number(s("area"));
  const paid = s("paymentStatus") === "FULLY_PAID";
  const fe: ValuationState["fieldErrors"] = {};
  if (name.length < 3) fe.name = ar ? "اكتب اسمك" : "Enter your name";
  if (!isValidPhone(phone)) fe.phone = ar ? "رقم الواتساب مش صحيح — اكتبه بكود الدولة" : "Invalid WhatsApp number — include the country code";
  if (!CITY_KEYS.includes(city as never)) fe.city = ar ? "اختار المدينة" : "Choose the city";
  const district = await db.district.findFirst({ where: { id: districtId, city: CITY_KEYS.includes(city as never) ? (city as City) : undefined, active: true } });
  if (!district) fe.district = ar ? "اختار الحي من القايمة" : "Choose the district";
  if (!(area >= 50 && area <= 5000)) fe.area = ar ? "المساحة بين 50 و 5000 م²" : "Area must be 50–5,000 m²";
  if (Object.keys(fe).length) return { error: ar ? "راجع الخانات المعلّمة" : "Please check the highlighted fields", fieldErrors: fe };

  const user = await getCurrentUser();
  const source = await readAttribution();
  const req = await db.serviceRequest.create({
    data: {
      type: "VALUATION",
      contactName: name,
      contactPhone: phone,
      requesterId: user?.id,
      city: city as City,
      district: district!.nameAr,
      message: `${ar ? "المساحة" : "Area"}: ${area} ${ar ? "م²" : "m²"} — ${paid ? (ar ? "مسددة بالكامل" : "fully paid") : ar ? "لسه بتتقسّط" : "in instalments"}`,
      ...(source ? { source } : {}),
    },
  });
  await audit(user?.id ?? null, "service_request.create", "ServiceRequest", req.id, { type: "VALUATION" });
  await notify([...(await idsByRole("BROKER")), ...(await idsByRole("BROKER_LEAD"))], {
    kind: "service_request.new",
    ar: [`طلب تقييم قطعة جديد من ${name}`, `${district!.nameAr} — ${area} م²`],
    en: [`New plot valuation request from ${name}`, `${district!.nameEn} — ${area} m²`],
    link: `/broker?tab=services`,
  });
  return { ok: true, ref: req.id.slice(-6).toUpperCase() };
}
