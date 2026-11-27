"use client";

import { useEffect, useState } from "react";
import { useKeptAction } from "@/components/useKeptAction";
import { track } from "@/components/Analytics";
import type { Locale } from "@/i18n/config";
import { money, num, tr } from "@/lib/format";
import type { CityOption } from "@/lib/cities";
import { rescueFee, suggestedPrice, type Tier } from "@/lib/rescue-calc";
import { btn, field, labelCls, Notice } from "@/components/ui";
import { submitRescue, type RescueState } from "./actions";

type Prefill = { tier: Tier; city: string; area: string; price: string; feeEgp: string; feeUsd: string };
const PREFILL_EVENT = "resell:rescue-prefill";

/**
 * MKT-01: حاسبة إنقاذ المهلة — الشريحة + سعر القطعة الحالي (أو المساحة والمدينة ونقترح السعر من المؤشر الحقيقي)
 * → المبلغ بالدولار والجنيه، و«ابدأ الطلب» بيملا الفورم تحت بالقيم دي.
 */
export function RescueCalculator({ locale, usdRate, perSqm, feePct, cities }: { locale: Locale; cities: CityOption[]; usdRate: number; perSqm: Record<string, number | null>; feePct: number }) {
  const L = tr(locale);
  const [tier, setTier] = useState<Tier>("b");
  const [city, setCity] = useState<string>(cities[0]?.id ?? "");
  const [area, setArea] = useState("");
  const [price, setPrice] = useState("");
  const suggestion = suggestedPrice(Number(area), perSqm[city]);
  const usedPrice = Number(price) > 0 ? Number(price) : (suggestion ?? 0);
  const fee = rescueFee(tier, usedPrice, usdRate, feePct);
  const tiers = [
    { id: "a" as const, label: L("أكتر من 70% — البنا قرّب يخلص", "Over 70% — nearly finished") },
    { id: "b" as const, label: L("من 35% لـ 70% — في نص الطريق", "35% to 70% — halfway") },
    { id: "c" as const, label: L("أقل من 35% — لسه في الأول", "Under 35% — just started") },
  ];

  function start() {
    const detail: Prefill = { tier, city, area, price: usedPrice ? String(usedPrice) : "", feeEgp: fee.egp ? String(fee.egp) : "", feeUsd: fee.usd ? String(fee.usd) : "" };
    window.dispatchEvent(new CustomEvent(PREFILL_EVENT, { detail }));
    document.getElementById("start")?.scrollIntoView({ behavior: "smooth" });
  }

  return (
    <div className="grid gap-8 md:grid-cols-2">
      <div className="flex flex-col gap-4">
        <h2 className="text-3xl font-bold">{L("احسب حالتك في دقيقة", "Check your case in a minute")}</h2>
        <p className="leading-8 text-muted">
          {L("اختار نسبة التنفيذ التقريبية واكتب سعر قطعتك الحالي. ده تقدير مبدئي، والرقم النهائي بيحدده الجهاز.", "Pick your approximate construction level and enter your plot's current price. This is an estimate; the authority sets the final figure.")}
        </p>
        <div className="flex flex-col gap-2.5" role="radiogroup" aria-label={L("نسبة التنفيذ", "Construction level")}>
          {tiers.map((t) => (
            <button
              key={t.id}
              type="button"
              role="radio"
              aria-checked={tier === t.id}
              onClick={() => setTier(t.id)}
              className={`min-h-[52px] px-4 text-start ${tier === t.id ? "border-2 border-navy bg-navy font-semibold text-white" : "border border-[#C5CBD8] bg-white"}`}
            >
              {t.label}
            </button>
          ))}
        </div>
        {tier === "b" && (
          <div className="grid gap-3 sm:grid-cols-2">
            <label className={labelCls}>
              {L("المدينة", "City")}
              <select value={city} onChange={(e) => setCity(e.target.value)} className={field}>
                {cities.map((c) => (
                  <option key={c.id} value={c.id}>
                    {locale === "ar" ? c.nameAr : c.nameEn}
                  </option>
                ))}
              </select>
            </label>
            <label className={labelCls}>
              {L("المساحة (م²)", "Area (m²)")}
              <input type="number" min={50} max={5000} inputMode="decimal" value={area} onChange={(e) => setArea(e.target.value)} className={field} />
            </label>
            <label className={`${labelCls} sm:col-span-2`}>
              {L("سعر القطعة الحالي (ج.م)", "Current plot price (EGP)")}
              <input type="number" min={0} inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder={suggestion ? String(suggestion) : ""} aria-label={L("سعر القطعة الحالي (ج.م)", "Current plot price (EGP)")} className={field} />
              <span className="text-[13px]">
                {suggestion
                  ? L(`مقترح من مؤشر الأسعار الحقيقي: ${money(suggestion, "EGP", locale)} — اكتب سعرك لو تعرفه.`, `Suggested from the real price index: ${money(suggestion, "EGP", locale)} — enter your own if you know it.`)
                  : L("مفيش بيانات صفقات كفاية للمدينة دي عشان نقترح سعر — اكتب السعر اللي تعرفه.", "Not enough deal data in this city to suggest a price — enter the price you know.")}
              </span>
            </label>
          </div>
        )}
      </div>
      <div className="flex flex-col gap-4 border border-line bg-[#F9FAFC] p-7">
        <div className="text-sm text-muted">{L("النتيجة المبدئية", "Initial result")}</div>
        {tier === "a" && (
          <>
            <div className="text-[28px] font-bold text-navy">{L("6 شهور زيادة، ببلاش", "6 extra months, free")}</div>
            <p className="leading-8">{L("تقدّم خلال المهلة وتسدد أي أقساط مستحقة، وتاخد 6 شهور إضافية تكمّل فيها التنفيذ.", "Apply within the window and settle any due instalments to get 6 extra months to finish building.")}</p>
          </>
        )}
        {tier === "b" && (
          <>
            <div className="text-[28px] font-bold text-navy">{L("سنة كاملة", "A full year")}</div>
            {fee.usd ? (
              <div className="flex flex-col gap-1">
                <div className="text-3xl font-bold" dir="ltr">
                  ${num(fee.usd, "en")}
                </div>
                <div className="text-muted">
                  {L(`≈ ${money(fee.egp!, "EGP", locale)} — ${num(feePct, locale)}% من ${money(usedPrice, "EGP", locale)} بسعر دولار ${num(usdRate, locale, 2)}`, `≈ ${money(fee.egp!, "EGP", locale)} — ${feePct}% of ${money(usedPrice, "EGP", locale)} at USD ${usdRate.toFixed(2)}`)}
                </div>
              </div>
            ) : (
              <p className="text-muted">{L("اكتب السعر (أو المساحة) عشان نحسب لك المبلغ.", "Enter the price (or the area) to calculate the amount.")}</p>
            )}
            <p className="leading-7 text-muted">{L("بتتدفع بالدولار من الخارج باسمك، وممكن جدولتها على سنة.", "Paid in USD from abroad in your name; can be spread over a year.")}</p>
          </>
        )}
        {tier === "c" && (
          <>
            <div className="text-[28px] font-bold text-navy">{L("محتاجين نراجع حالتك", "We need to review your case")}</div>
            <p className="leading-8">{L("القرار ما ذكرش النسبة دي. بنسأل الجهاز عن وضع قطعتك ونعرض عليك الخيارات ومنها البيع قبل ما المهلة تخلص.", "The decision doesn't cover this range. We ask the authority about your plot and present your options, including selling before the deadline.")}</p>
          </>
        )}
        <p className="border-t border-line pt-3.5 text-[15px] leading-7 text-muted">
          {L(
            "الشروط في كل الحالات: سداد كل الأقساط المستحقة بأعبائها، وإن القطعة ما يكونش عليها مخالفات، وما يكونش فيه قضايا مرفوعة على الهيئة أو الجهاز بخصوصها.",
            "Conditions in all cases: all due instalments paid with charges, no violations on the plot, and no lawsuits against the authority about it.",
          )}
        </p>
        <button type="button" onClick={start} className={`${btn.primary} self-start`}>
          {L("ابدأ الطلب بالقيم دي", "Start the request with these values")}
        </button>
      </div>
    </div>
  );
}

export function RescueForm({ locale, cities }: { locale: Locale; cities: CityOption[]; }) {
  const L = tr(locale);
  // UX-01: الفورم ما يتمسحش لو السيرفر رجّع خطأ
  const [state, onSubmit, pending] = useKeptAction((p: RescueState, f: FormData) => submitRescue(locale, p, f), {} as RescueState);
  // MKT-01: القيم جاية من الحاسبة
  const [pre, setPre] = useState<Prefill | null>(null);
  const [city, setCity] = useState<string>(cities[0]?.id ?? "");
  const [area, setArea] = useState("");
  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<Prefill>).detail;
      setPre(d);
      setCity(d.city);
      setArea(d.area);
    };
    window.addEventListener(PREFILL_EVENT, on);
    return () => window.removeEventListener(PREFILL_EVENT, on);
  }, []);
  const fe = state.fieldErrors ?? {};
  const Err = ({ k }: { k: keyof typeof fe }) =>
    fe[k] ? (
      <span role="alert" className="text-sm font-semibold text-[#A32020]">
        {fe[k]}
      </span>
    ) : null;
  useEffect(() => {
    if (state.ok) track("lead_rescue_submitted"); // MKT-11
  }, [state.ok]);
  if (state.ok)
    return (
      <Notice tone="green">
        <strong>{L("وصلنا طلبك.", "We received your request.")}</strong>{" "}
        {L(`رقم الطلب ${state.ref}. هنكلمك على واتساب خلال يوم عمل.`, `Reference ${state.ref}. We'll contact you on WhatsApp within one working day.`)}
      </Notice>
    );
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3.5 border border-line p-6">
      {state.error && (
        <p role="alert" className="border border-[#EFC4C4] bg-[#FBEAEA] px-3 py-2 text-[#A32020]">
          {state.error}
        </p>
      )}
      {pre && (
        <p className="border border-[#C9D6F2] bg-[#EEF3FC] px-3 py-2 text-sm">
          {L("القيم من الحاسبة اتحطت في الطلب.", "Values from the calculator were added to the request.")}
          {pre.feeUsd && <span dir="ltr"> · ${num(Number(pre.feeUsd), "en")}</span>}
        </p>
      )}
      <input type="hidden" name="tier" value={pre?.tier ?? ""} />
      <input type="hidden" name="price" value={pre?.price ?? ""} />
      <input type="hidden" name="feeUsd" value={pre?.feeUsd ?? ""} />
      <label className={labelCls}>
        {L("الاسم بالكامل", "Full name")}
        <input name="name" required minLength={3} autoComplete="name" aria-invalid={!!fe.name} className={field} />
        <Err k="name" />
      </label>
      <label className={labelCls}>
        {L("رقم الواتساب", "WhatsApp number")}
        <input name="phone" type="tel" required dir="ltr" placeholder="+966 5x xxx xxxx" aria-invalid={!!fe.phone} className={`${field} text-start`} />
        <Err k="phone" />
      </label>
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
        </label>
        <label className={labelCls}>
          {L("المساحة (م²)", "Area (m²)")}
          <input name="area" type="number" min={0} value={area} onChange={(e) => setArea(e.target.value)} className={field} />
        </label>
      </div>
      <label className={labelCls}>
        {L("نوع الخدمة", "Service")}
        <select name="type" className={field} defaultValue="DEADLINE_RESCUE">
          <option value="DEADLINE_RESCUE">{L("إنقاذ المهلة", "Deadline rescue")}</option>
          <option value="SITE_INSPECTION">{L("معاينة وتقرير بس", "Inspection and report only")}</option>
        </select>
      </label>
      <label className={labelCls}>
        {L("خطاب التخصيص (اختياري دلوقتي) — PDF أو صورة (JPG/PNG/WebP)", "Allocation letter (optional for now) — PDF or image (JPG/PNG/WebP)")}
        <input name="file" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" aria-invalid={!!fe.file} className="border border-dashed border-[#C5CBD8] p-2.5" />
        <Err k="file" />
      </label>
      <button type="submit" disabled={pending} className={btn.primary}>
        {pending ? L("بنبعت…", "Sending…") : L("أرسل طلب الفحص", "Send inspection request")}
      </button>
    </form>
  );
}
