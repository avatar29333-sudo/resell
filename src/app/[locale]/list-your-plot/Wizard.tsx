"use client";

import { useActionState, useRef, useState } from "react";
import type { Locale } from "@/i18n/config";
import { tr } from "@/lib/format";
import { CITY, CITY_KEYS, label } from "@/lib/labels";
import { btn, field, labelCls } from "@/components/ui";
import { createListing, type ListState } from "./actions";

export function Wizard({ locale, partner = false }: { locale: Locale; partner?: boolean }) {
  const L = tr(locale);
  const [step, setStep] = useState(0);
  const [priceType, setPriceType] = useState("ALL_INCLUSIVE");
  const [localError, setLocalError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState((p: ListState, f: FormData) => createListing(locale, p, f), {} as ListState);

  const titles = [L("بيانات القطعة", "Plot details"), L("السعر", "Price"), L("المستندات", "Documents")];

  // نتأكد إن حقول الخطوة الحالية متملية قبل ما نكمّل
  const next = () => {
    const fs = formRef.current?.querySelectorAll<HTMLInputElement>(`[data-step="${step}"] [required]`) ?? [];
    for (const el of fs) {
      if (!el.checkValidity()) {
        el.reportValidity();
        return;
      }
    }
    setLocalError(null);
    setStep(step + 1);
  };

  const error = localError ?? state.error;

  return (
    <form ref={formRef} action={action} className="flex flex-col gap-6">
      <ol className="grid grid-cols-3 gap-2">
        {titles.map((t, i) => (
          <li
            key={t}
            aria-current={i === step ? "step" : undefined}
            className={`border-t-[3px] pt-2 text-sm font-semibold ${i < step ? "border-ok text-ok" : i === step ? "border-brand text-navy" : "border-line text-muted"}`}
          >
            {i + 1}. {t}
          </li>
        ))}
      </ol>

      {error && (
        <p role="alert" className="border border-[#EFC4C4] bg-[#FBEAEA] px-3 py-2 text-[#A32020]">
          {error}
        </p>
      )}

      <div data-step="0" hidden={step !== 0} className="grid gap-4 sm:grid-cols-2">
        <label className={labelCls}>
          {L("المدينة", "City")}
          <select name="city" required className={field}>
            {CITY_KEYS.map((k) => (
              <option key={k} value={k}>
                {label(CITY, k, locale)}
              </option>
            ))}
          </select>
        </label>
        <label className={labelCls}>
          {L("المرحلة / الحي", "Phase / district")}
          <input name="district" required placeholder={L("مثلاً الحي الأول", "e.g. District 1")} className={field} />
        </label>
        <label className={labelCls}>
          {L("كود القطعة (من خطاب التخصيص)", "Plot code (from the allocation letter)")}
          <input name="code" required dir="ltr" className={`${field} text-start`} />
          <span className="text-xs">{L("مش هيظهر لأي مشتري قبل اتفاق العمولة.", "Hidden from buyers until the commission agreement.")}</span>
        </label>
        <label className={labelCls}>
          {L("المساحة (م²)", "Area (m²)")}
          <input name="area" type="number" min={50} max={5000} required className={field} />
        </label>
        <label className={labelCls}>
          {L("حالة السداد", "Payment status")}
          <select name="paymentStatus" className={field}>
            <option value="INSTALLMENTS">{L("لسه بقسّط", "Still in instalments")}</option>
            <option value="FULLY_PAID">{L("مسدد بالكامل", "Fully paid")}</option>
          </select>
        </label>
        <label className={labelCls}>
          {L("نهاية مهلة البناء", "Build deadline")}
          <input name="deadline" type="date" className={field} />
        </label>
        <label className={labelCls}>
          {L("نسبة التنفيذ التقريبية (%)", "Approx. construction (%)")}
          <input name="construction" type="number" min={0} max={100} defaultValue={0} className={field} />
        </label>
      </div>

      <div data-step="1" hidden={step !== 1} className="grid gap-4 sm:grid-cols-2">
        <fieldset className="flex flex-col gap-2 sm:col-span-2">
          <legend className="mb-1.5 text-sm font-medium text-muted">{L("نوع السعر", "Price type")}</legend>
          <label className="flex min-h-11 items-center gap-2">
            <input type="radio" name="priceType" value="ALL_INCLUSIVE" checked={priceType === "ALL_INCLUSIVE"} onChange={() => setPriceType("ALL_INCLUSIVE")} className="size-5" />
            {L("سعر شامل بالجنيه", "All-inclusive price in EGP")}
          </label>
          <label className="flex min-h-11 items-center gap-2">
            <input type="radio" name="priceType" value="PAID_PLUS_PREMIUM" checked={priceType === "PAID_PLUS_PREMIUM"} onChange={() => setPriceType("PAID_PLUS_PREMIUM")} className="size-5" />
            {L("المدفوع بالدولار + أوفر", "Amount paid in USD + premium")}
          </label>
        </fieldset>
        {priceType === "PAID_PLUS_PREMIUM" && (
          <label className={labelCls}>
            {L("المبلغ المدفوع للجهاز (دولار)", "Paid to the authority (USD)")}
            <input name="paidUsd" type="number" min={1} required className={field} />
          </label>
        )}
        <label className={labelCls}>
          {priceType === "PAID_PLUS_PREMIUM" ? L("الأوفر المطلوب (ج.م)", "Premium asked (EGP)") : L("السعر الشامل المطلوب (ج.م)", "Total asking price (EGP)")}
          <input name="price" type="number" min={1} required className={field} />
        </label>
      </div>

      <div data-step="2" hidden={step !== 2} className="flex flex-col gap-4">
        <p className="leading-7 text-muted">
          {L(
            "الملفات بتتحفظ في خزنة مشفّرة، والمحامي بيراجعها قبل النشر. PDF أو صورة، أقل من 4 ميجا لكل ملف.",
            "Files are kept in an encrypted vault and reviewed by a lawyer before publishing. PDF or image, under 4 MB each.",
          )}
        </p>
        <label className={labelCls}>
          {L("خطاب التخصيص (مطلوب)", "Allocation letter (required)")}
          <input name="allocation" type="file" required accept="application/pdf,image/*" className="border border-dashed border-line p-2.5" />
        </label>
        <label className={labelCls}>
          {L("إيصالات السداد", "Payment receipts")}
          <input name="receipts" type="file" accept="application/pdf,image/*" className="border border-dashed border-line p-2.5" />
        </label>
        <label className={labelCls}>
          {L("آخر إفادة من الجهاز", "Latest authority statement")}
          <input name="statement" type="file" accept="application/pdf,image/*" className="border border-dashed border-line p-2.5" />
        </label>
        {partner && (
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input type="checkbox" name="clientConsent" className="size-4" />
            {L("أؤكد إن مالك القطعة موافق كتابةً على عرضها عن طريقي", "I confirm the plot owner has agreed in writing to list it through me")}
          </label>
        )}
      </div>

      <div className="flex flex-wrap gap-3">
        {step > 0 && (
          <button type="button" onClick={() => setStep(step - 1)} className={btn.secondary}>
            {L("رجوع", "Back")}
          </button>
        )}
        {step < 2 ? (
          <button type="button" onClick={next} className={btn.primary}>
            {L("التالي", "Next")}
          </button>
        ) : (
          <button type="submit" disabled={pending} className={btn.primary}>
            {pending ? L("بنرفع…", "Uploading…") : L("ابعت للمراجعة", "Submit for review")}
          </button>
        )}
      </div>
    </form>
  );
}
