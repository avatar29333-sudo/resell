"use client";

import { useActionState, useState } from "react";
import type { Locale } from "@/i18n/config";
import { tr } from "@/lib/format";
import { CITY, CITY_KEYS, label } from "@/lib/labels";
import { btn, field, labelCls, Notice } from "@/components/ui";
import { submitRescue, type RescueState } from "./actions";

export function RescueCalculator({ locale }: { locale: Locale }) {
  const L = tr(locale);
  const [tier, setTier] = useState<"a" | "b" | "c">("b");
  const tiers = [
    { id: "a" as const, label: L("أكتر من 70% — البنا قرّب يخلص", "Over 70% — nearly finished") },
    { id: "b" as const, label: L("من 35% لـ 70% — في نص الطريق", "35% to 70% — halfway") },
    { id: "c" as const, label: L("أقل من 35% — لسه في الأول", "Under 35% — just started") },
  ];
  const results = {
    a: [L("6 شهور زيادة، ببلاش", "6 extra months, free"), L("تقدّم خلال المهلة وتسدد أي أقساط مستحقة، وتاخد 6 شهور إضافية تكمّل فيها التنفيذ.", "Apply within the window and settle any due instalments to get 6 extra months to finish building.")],
    b: [L("سنة كاملة مقابل 10%", "A full year for 10%"), L("هتدفع 10% من سعر القطعة الحالي بالدولار من الخارج، وممكن جدولة المبلغ على سنة. بنحسب لك الرقم بعد ما نعرف السعر الحالي من الجهاز.", "You pay 10% of the plot's current price in USD from abroad, which can be spread over a year. We calculate it once we have the current price from the authority.")],
    c: [L("محتاجين نراجع حالتك", "We need to review your case"), L("القرار ما ذكرش النسبة دي. بنسأل الجهاز عن وضع قطعتك، ونعرض عليك الخيارات ومنها البيع قبل ما المهلة تخلص.", "The decision doesn't cover this range. We ask the authority about your plot and present your options, including selling before the deadline.")],
  };
  return (
    <div className="grid gap-8 md:grid-cols-2">
      <div className="flex flex-col gap-4">
        <h2 className="text-3xl font-bold">{L("احسب حالتك في دقيقة", "Check your case in a minute")}</h2>
        <p className="leading-8 text-muted">
          {L("اختار نسبة التنفيذ التقريبية. ده تقدير مبدئي، والرقم النهائي بيحدده الجهاز بعد المعاينة.", "Pick your approximate construction level. This is an estimate; the authority sets the final figure after inspection.")}
        </p>
        <div className="flex flex-col gap-2.5" role="radiogroup">
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
      </div>
      <div className="flex flex-col gap-4 border border-line bg-[#F9FAFC] p-7">
        <div className="text-sm text-muted">{L("النتيجة المبدئية", "Initial result")}</div>
        <div className="text-[28px] font-bold text-navy">{results[tier][0]}</div>
        <p className="leading-8">{results[tier][1]}</p>
        <p className="border-t border-line pt-3.5 text-[15px] leading-7 text-muted">
          {L(
            "الشروط في كل الحالات: سداد كل الأقساط المستحقة بأعبائها، وإن القطعة ما يكونش عليها مخالفات، وما يكونش فيه قضايا مرفوعة على الهيئة أو الجهاز بخصوصها.",
            "Conditions in all cases: all due instalments paid with charges, no violations on the plot, and no lawsuits against the authority about it.",
          )}
        </p>
        <a href="#start" className={`${btn.primary} self-start`}>
          {L("احجز معاينة لقطعتك", "Book a site inspection")}
        </a>
      </div>
    </div>
  );
}

export function RescueForm({ locale }: { locale: Locale }) {
  const L = tr(locale);
  const [state, action, pending] = useActionState(
    (p: RescueState, f: FormData) => submitRescue(locale, p, f),
    {} as RescueState,
  );
  if (state.ok)
    return (
      <Notice tone="green">
        <strong>{L("وصلنا طلبك.", "We received your request.")}</strong>{" "}
        {L(`رقم الطلب ${state.ref}. هنكلمك على واتساب خلال يوم عمل.`, `Reference ${state.ref}. We'll contact you on WhatsApp within one working day.`)}
      </Notice>
    );
  return (
    <form action={action} className="flex flex-col gap-3.5 border border-line p-6">
      {state.error && (
        <p role="alert" className="border border-[#EFC4C4] bg-[#FBEAEA] px-3 py-2 text-[#A32020]">
          {state.error}
        </p>
      )}
      <label className={labelCls}>
        {L("الاسم بالكامل", "Full name")}
        <input name="name" required autoComplete="name" className={field} />
      </label>
      <label className={labelCls}>
        {L("رقم الواتساب", "WhatsApp number")}
        <input name="phone" type="tel" required dir="ltr" placeholder="+966 5x xxx xxxx" className={`${field} text-start`} />
      </label>
      <div className="grid gap-3.5 sm:grid-cols-2">
        <label className={labelCls}>
          {L("المدينة", "City")}
          <select name="city" className={field}>
            {CITY_KEYS.map((k) => (
              <option key={k} value={k}>
                {label(CITY, k, locale)}
              </option>
            ))}
          </select>
        </label>
        <label className={labelCls}>
          {L("المساحة (م²)", "Area (m²)")}
          <input name="area" type="number" min={0} className={field} />
        </label>
      </div>
      <label className={labelCls}>
        {L("نوع الخدمة", "Service")}
        <select name="type" className={field}>
          <option value="DEADLINE_RESCUE">{L("إنقاذ المهلة", "Deadline rescue")}</option>
          <option value="SITE_INSPECTION">{L("معاينة وتقرير بس", "Inspection and report only")}</option>
        </select>
      </label>
      <label className={labelCls}>
        {L("خطاب التخصيص (اختياري دلوقتي) — PDF أو صورة", "Allocation letter (optional for now) — PDF or image")}
        <input name="file" type="file" accept="application/pdf,image/*" className="border border-dashed border-[#C5CBD8] p-2.5" />
      </label>
      <button type="submit" disabled={pending} className={btn.primary}>
        {pending ? L("بنبعت…", "Sending…") : L("أرسل طلب الفحص", "Send inspection request")}
      </button>
    </form>
  );
}
