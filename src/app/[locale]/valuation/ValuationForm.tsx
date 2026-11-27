"use client";

import { useEffect, useState } from "react";
import { track } from "@/components/Analytics";
import type { Locale } from "@/i18n/config";
import { money, tr } from "@/lib/format";
import type { CityOption } from "@/lib/cities";
import { Notice, btn, field, labelCls } from "@/components/ui";
import { useKeptAction } from "@/components/useKeptAction";
import { submitValuation, type ValuationState } from "./actions";

type District = { id: string; city: string; nameAr: string; nameEn: string };

/** MKT-03: «اعرف قيمة قطعتك» — فورم قصير + تقدير فوري من المؤشر الحقيقي لو متاح */
export function ValuationForm({ locale, districts, perSqm, cities }: { locale: Locale; cities: CityOption[]; districts: District[]; perSqm: Record<string, number | null> }) {
  const L = tr(locale);
  const [city, setCity] = useState<string>(cities[0]?.id ?? "");
  const [area, setArea] = useState("");
  const [state, onSubmit, pending] = useKeptAction((p: ValuationState, f: FormData) => submitValuation(locale, p, f), {} as ValuationState);
  const fe = state.fieldErrors ?? {};
  const Err = ({ k }: { k: keyof typeof fe }) => (fe[k] ? <span role="alert" className="text-sm font-semibold text-[#A32020]">{fe[k]}</span> : null);
  useEffect(() => {
    if (state.ok) track("valuation_requested"); // MKT-11
  }, [state.ok]);
  const est = perSqm[city] && Number(area) >= 50 ? Math.round(perSqm[city]! * Number(area)) : null;

  if (state.ok)
    return (
      <Notice tone="green">
        <strong>{L("وصلنا طلب التقييم.", "We received your valuation request.")}</strong> {L(`رقم الطلب ${state.ref}. الوسيط هيكلمك على واتساب خلال يوم عمل بتقييم مبني على صفقات حقيقية.`, `Reference ${state.ref}. A broker will message you on WhatsApp within one working day with a valuation based on real deals.`)}
      </Notice>
    );

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3.5 border border-line p-6">
      {state.error && (
        <p role="alert" className="border border-[#EFC4C4] bg-[#FBEAEA] px-3 py-2 text-[#A32020]">
          {state.error}
        </p>
      )}
      <div className="grid gap-3.5 sm:grid-cols-2">
        <label className={labelCls}>
          {L("المدينة", "City")}
          <select name="city" value={city} onChange={(e) => setCity(e.target.value)} className={field}>
            {cities.map((c) => (
              <option key={c.id} value={c.id}>
                {locale === "ar" ? c.nameAr : c.nameEn}
              </option>
            ))}
          </select>
          <Err k="city" />
        </label>
        <label className={labelCls}>
          {L("المرحلة / الحي", "Phase / district")}
          <select name="districtId" key={city} defaultValue="" required className={field}>
            <option value="" disabled>
              {L("اختار من القايمة", "Choose from the list")}
            </option>
            {districts
              .filter((d) => d.city === city)
              .map((d) => (
                <option key={d.id} value={d.id}>
                  {locale === "ar" ? d.nameAr : d.nameEn}
                </option>
              ))}
          </select>
          <Err k="district" />
        </label>
        <label className={labelCls}>
          {L("المساحة (م²)", "Area (m²)")}
          <input name="area" type="number" min={50} max={5000} required value={area} onChange={(e) => setArea(e.target.value)} className={field} />
          <Err k="area" />
        </label>
        <label className={labelCls}>
          {L("حالة السداد", "Payment status")}
          <select name="paymentStatus" className={field}>
            <option value="INSTALLMENTS">{L("لسه بقسّط", "Still in instalments")}</option>
            <option value="FULLY_PAID">{L("مسددة بالكامل", "Fully paid")}</option>
          </select>
        </label>
      </div>
      {est && (
        <p className="border border-[#C9D6F2] bg-[#EEF3FC] px-3 py-2 text-sm">
          {L(`تقدير مبدئي من صفقات حقيقية: حوالي ${money(est, "EGP", locale)}. الوسيط هيدقق الرقم.`, `Initial estimate from real deals: about ${money(est, "EGP", locale)}. A broker will refine it.`)}
        </p>
      )}
      <label className={labelCls}>
        {L("الاسم", "Name")}
        <input name="name" required minLength={3} autoComplete="name" className={field} />
        <Err k="name" />
      </label>
      <label className={labelCls}>
        {L("رقم الواتساب", "WhatsApp number")}
        <input name="phone" type="tel" required dir="ltr" placeholder="+966 5x xxx xxxx" className={`${field} text-start`} />
        <Err k="phone" />
      </label>
      <button type="submit" disabled={pending} className={btn.primary}>
        {pending ? L("بنبعت…", "Sending…") : L("اعرف قيمة قطعتك", "Get my plot's value")}
      </button>
    </form>
  );
}
