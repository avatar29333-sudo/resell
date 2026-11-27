"use client";

import { useEffect, useRef, useState } from "react";
import type { Locale } from "@/i18n/config";
import { tr } from "@/lib/format";
import { btn, field, labelCls } from "@/components/ui";
import { useKeptAction } from "@/components/useKeptAction";
import { codeHint } from "@/lib/plot-code";
import { MultiUpload } from "@/components/MultiUpload";
import type { CityOption } from "@/lib/cities";
import { DRAFT_KEY, stepErrors, type Draft } from "./wizard-rules";
import { createListing, uploadDraftFile, type ListState } from "./actions";

type District = { id: string; city: string; nameAr: string; nameEn: string };
type Round = { id: string; cityId: string | null; nameAr: string; nameEn: string };
const TEXT_FIELDS = ["city", "districtId", "offeringRoundId", "code", "area", "paymentStatus", "deadline", "construction", "priceType", "paidUsd", "price", "remainingUsd"] as const;
const FILES = [
  { name: "allocation", required: true },
  { name: "receipts", required: false },
  { name: "statement", required: false },
] as const;
const STEP_FIELDS: string[][] = [["city", "districtId", "code", "area", "deadline", "construction"], ["priceType", "paidUsd", "price", "remainingUsd"], ["allocation"]];

const FIELD_TEXT: Record<string, Record<string, [string, string]>> = {
  city: { required: ["اختار المدينة", "Choose the city"] },
  district: { required: ["اختار الحي من القايمة", "Choose the district from the list"] },
  code: {
    required: ["اكتب كود القطعة", "Enter the plot code"],
    format: ["الكود لازم يكون بالشكل ده: NC-8E-1016 (بادئة المدينة-البلوك-الرقم)", "The code must look like NC-8E-1016 (city prefix-block-number)"],
    prefix: ["بادئة الكود مش مطابقة للمدينة اللي اخترتها", "The code prefix doesn't match the chosen city"],
  },
  area: { range: ["المساحة لازم تكون بين 50 و 5000 م²", "Area must be between 50 and 5,000 m²"] },
  construction: { range: ["نسبة التنفيذ رقم صحيح من 0 لـ 100", "Construction must be a whole number from 0 to 100"] },
  deadline: { invalid: ["تاريخ المهلة مش صحيح", "The deadline date is invalid"] },
  price: { required: ["اكتب السعر", "Enter the price"] },
  paidUsd: { required: ["اكتب المبلغ المدفوع بالدولار", "Enter the amount paid in USD"] },
  allocation: { required: ["ارفع خطاب التخصيص", "Upload the allocation letter"], file: ["الملف لازم يكون PDF أو صورة (JPG/PNG/WebP) وأقل من 4 ميجا", "The file must be a PDF or image (JPG/PNG/WebP) under 4 MB"] },
  receipts: { file: ["الملف لازم يكون PDF أو صورة (JPG/PNG/WebP) وأقل من 4 ميجا", "The file must be a PDF or image (JPG/PNG/WebP) under 4 MB"] },
  statement: { file: ["الملف لازم يكون PDF أو صورة (JPG/PNG/WebP) وأقل من 4 ميجا", "The file must be a PDF or image (JPG/PNG/WebP) under 4 MB"] },
};

export function Wizard({
  locale,
  partner = false,
  cities,
  districts = [],
  rounds = [],
  initial,
}: {
  locale: Locale;
  partner?: boolean;
  /** GEO-01: المدن الشغالة من الجدول */
  cities: CityOption[];
  districts?: District[];
  /** GEO-02: الطرح منفصل عن الحي */
  rounds?: Round[];
  initial?: Draft;
}) {
  const L = tr(locale);
  const ar = locale === "ar";
  const [step, setStep] = useState(0);
  const [v, setV] = useState<Draft>({ city: cities[0]?.id ?? "", priceType: "ALL_INCLUSIVE", paymentStatus: "INSTALLMENTS", construction: "0" });
  const [files, setFiles] = useState<Record<string, { id: string; name: string } | undefined>>({});
  const [uploading, setUploading] = useState<string | null>(null);
  const [clientErrors, setClientErrors] = useState<Record<string, string>>({});
  const [restored, setRestored] = useState(false);
  const loaded = useRef(false);

  const [state, onSubmit, pending] = useKeptAction(
    (p: ListState, f: FormData) => createListing(locale, p, f),
    {} as ListState,
    (_f, e) => {
      // آخر خطوة: نتأكد من كل الخطوات قبل الإرسال
      for (let s = 0; s < 3; s++) {
        const errs = stepErrors(s, v, files, cities.find((c) => c.id === v.city));
        if (Object.keys(errs).length) {
          setClientErrors(errs);
          setStep(s);
          e.preventDefault();
          return false;
        }
      }
      setClientErrors({});
    },
  );

  // UX-02: استرجاع المسودة
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const d = JSON.parse(raw) as { v: Draft; files: typeof files; step: number };
        setV((cur) => ({ ...cur, ...d.v }));
        setFiles(d.files ?? {});
        setStep(Math.min(2, Math.max(0, d.step ?? 0)));
        setRestored(true);
      } else if (initial) {
        // MKT-03: بيانات طلب التقييم
        setV((cur) => ({ ...cur, ...Object.fromEntries(Object.entries(initial).filter(([, x]) => x)) }));
      }
    } catch {
      /* مسودة بايظة — نتجاهلها */
    }
    loaded.current = true;
  }, []);
  // UX-02: حفظ تلقائي مع كل تغيير
  useEffect(() => {
    if (!loaded.current) return;
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ v, files, step, at: Date.now() }));
    } catch {
      /* التخزين مقفول */
    }
  }, [v, files, step]);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setV((cur) => ({ ...cur, [k]: e.target.value }));
  const cityDistricts = districts.filter((d) => d.city === v.city);
  const cityRounds = rounds.filter((r) => !r.cityId || r.cityId === v.city);
  const cityRow = cities.find((c) => c.id === v.city);
  const hint = cityRow ? codeHint(cityRow, ar) : { example: "", words: "" };
  const titles = [L("بيانات القطعة", "Plot details"), L("السعر", "Price"), L("المستندات", "Documents")];
  const serverErrors = (state.fieldErrors ?? {}) as Record<string, string>;
  const errs = { ...serverErrors, ...clientErrors };

  const next = () => {
    const e = stepErrors(step, v, files, cities.find((c) => c.id === v.city));
    setClientErrors(e);
    if (Object.keys(e).length === 0) setStep(step + 1);
  };

  async function pick(name: string, e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setUploading(name);
    const fd = new FormData();
    fd.set("file", f);
    const r = await uploadDraftFile(locale, name, fd);
    setUploading(null);
    if (r.id) {
      setFiles((cur) => ({ ...cur, [name]: { id: r.id!, name: r.name ?? f.name } }));
      setClientErrors((cur) => {
        const c = { ...cur };
        delete c[name];
        return c;
      });
      e.target.value = ""; // الملف اترفع — ما نبعتوش تاني مع الفورم
    } else {
      setClientErrors((cur) => ({ ...cur, [name]: "file" }));
    }
  }

  const Err = ({ name }: { name: string }) =>
    errs[name] ? (
      <span role="alert" className="text-sm font-semibold text-[#A32020]">
        {FIELD_TEXT[name]?.[errs[name]]?.[ar ? 0 : 1] ?? L("راجع الخانة دي", "Check this field")}
      </span>
    ) : null;
  const inv = (name: string) => ({ "aria-invalid": !!errs[name] || undefined });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
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

      {restored && (
        <p className="flex flex-wrap items-center gap-2 border border-[#C9D6F2] bg-[#EEF3FC] px-3 py-2 text-sm">
          {L("رجّعنالك المسودة اللي كنت بتكتبها.", "We restored the draft you were writing.")}
          <button
            type="button"
            className="font-semibold text-brand underline"
            onClick={() => {
              localStorage.removeItem(DRAFT_KEY);
              setV({ city: cities[0]?.id ?? "", priceType: "ALL_INCLUSIVE", paymentStatus: "INSTALLMENTS", construction: "0" });
              setFiles({});
              setStep(0);
              setRestored(false);
            }}
          >
            {L("ابدأ من جديد", "Start over")}
          </button>
        </p>
      )}

      {state.error && (
        <p role="alert" className="border border-[#EFC4C4] bg-[#FBEAEA] px-3 py-2 text-[#A32020]">
          {state.error}
        </p>
      )}

      {/* كل القيم بتتبعت مع الفورم حتى لو الخطوة مستخبية */}
      {TEXT_FIELDS.map((k) => (step === STEP_FIELDS.findIndex((s) => s.includes(k)) ? null : <input key={k} type="hidden" name={k} value={v[k] ?? ""} />))}
      {FILES.map((f) => files[f.name] && <input key={f.name} type="hidden" name={`${f.name}Id`} value={files[f.name]!.id} />)}

      {step === 0 && (
        <div className="grid gap-4 sm:grid-cols-2">
          <label className={labelCls}>
            {L("المدينة", "City")}
            <select name="city" value={v.city} onChange={(e) => setV((cur) => ({ ...cur, city: e.target.value, districtId: "", offeringRoundId: "" }))} className={field} {...inv("city")}>
              {cities.map((c) => (
                <option key={c.id} value={c.id}>
                  {ar ? c.nameAr : c.nameEn}
                </option>
              ))}
            </select>
            <Err name="city" />
          </label>
          <label className={labelCls}>
            {L("الحي", "District")}
            <select name="districtId" value={v.districtId ?? ""} onChange={set("districtId")} className={field} {...inv("district")}>
              <option value="" disabled>
                {L("اختار من القايمة", "Choose from the list")}
              </option>
              {cityDistricts.map((d) => (
                <option key={d.id} value={d.id}>
                  {ar ? d.nameAr : d.nameEn}
                </option>
              ))}
            </select>
            <Err name="district" />
          </label>
          <label className={labelCls}>
            {L("الطرح (مرحلة بيت الوطن)", "Offering round (Beit El Watan phase)")}
            <select name="offeringRoundId" value={v.offeringRoundId ?? ""} onChange={set("offeringRoundId")} className={field}>
              <option value="">{L("مش متأكد", "Not sure")}</option>
              {cityRounds.map((r) => (
                <option key={r.id} value={r.id}>
                  {ar ? r.nameAr : r.nameEn}
                </option>
              ))}
            </select>
          </label>
          <label className={labelCls}>
            {L("كود القطعة (من خطاب التخصيص)", "Plot code (from the allocation letter)")}
            <input name="code" value={v.code ?? ""} onChange={set("code")} dir="ltr" placeholder={hint.example} className={`${field} text-start`} {...inv("code")} />
            <span className="text-xs">
              {L(`الشكل: ${hint.words} — مثلاً ${hint.example}. مش هيظهر لأي مشتري قبل اتفاق العمولة.`, `Format: ${hint.words} — e.g. ${hint.example}. Hidden from buyers until the commission agreement.`)}
            </span>
            <Err name="code" />
          </label>
          <label className={labelCls}>
            {L("المساحة (م²)", "Area (m²)")}
            <input name="area" type="number" inputMode="decimal" value={v.area ?? ""} onChange={set("area")} className={field} {...inv("area")} />
            <Err name="area" />
          </label>
          <label className={labelCls}>
            {L("حالة السداد", "Payment status")}
            <select name="paymentStatus" value={v.paymentStatus} onChange={set("paymentStatus")} className={field}>
              <option value="INSTALLMENTS">{L("لسه بقسّط", "Still in instalments")}</option>
              <option value="FULLY_PAID">{L("مسدد بالكامل", "Fully paid")}</option>
            </select>
          </label>
          <label className={labelCls}>
            {L("نهاية مهلة البناء", "Build deadline")}
            <input name="deadline" type="date" value={v.deadline ?? ""} onChange={set("deadline")} className={field} {...inv("deadline")} />
            <span className="text-xs">{L("لو المهلة خلصت، اكتب تاريخها برضه — هنعرض عليك «إنقاذ المهلة».", "If the deadline has passed, enter it anyway — we'll offer a deadline rescue.")}</span>
            <Err name="deadline" />
          </label>
          <label className={labelCls}>
            {L("نسبة التنفيذ التقريبية (%)", "Approx. construction (%)")}
            <input name="construction" type="number" inputMode="numeric" value={v.construction ?? ""} onChange={set("construction")} className={field} {...inv("construction")} />
            <Err name="construction" />
          </label>
        </div>
      )}

      {step === 1 && (
        <div className="grid gap-4 sm:grid-cols-2">
          <fieldset className="flex flex-col gap-2 sm:col-span-2">
            <legend className="mb-1.5 text-sm font-medium text-muted">{L("نوع السعر", "Price type")}</legend>
            <label className="flex min-h-11 items-center gap-2">
              <input type="radio" name="priceType" value="ALL_INCLUSIVE" checked={v.priceType === "ALL_INCLUSIVE"} onChange={set("priceType")} className="size-5" />
              {L("سعر شامل بالجنيه", "All-inclusive price in EGP")}
            </label>
            <label className="flex min-h-11 items-center gap-2">
              <input type="radio" name="priceType" value="PAID_PLUS_PREMIUM" checked={v.priceType === "PAID_PLUS_PREMIUM"} onChange={set("priceType")} className="size-5" />
              {L("المدفوع بالدولار + أوفر", "Amount paid in USD + premium")}
            </label>
          </fieldset>
          {v.priceType === "PAID_PLUS_PREMIUM" && (
            <label className={labelCls}>
              {L("المبلغ المدفوع للجهاز (دولار)", "Paid to the authority (USD)")}
              <input name="paidUsd" type="number" inputMode="decimal" value={v.paidUsd ?? ""} onChange={set("paidUsd")} className={field} {...inv("paidUsd")} />
              <Err name="paidUsd" />
            </label>
          )}
          <label className={labelCls}>
            {v.priceType === "PAID_PLUS_PREMIUM" ? L("الأوفر المطلوب (ج.م)", "Premium asked (EGP)") : L("السعر الشامل المطلوب (ج.م)", "Total asking price (EGP)")}
            <input name="price" type="number" inputMode="decimal" value={v.price ?? ""} onChange={set("price")} className={field} {...inv("price")} />
            <Err name="price" />
          </label>
          {v.paymentStatus !== "FULLY_PAID" && (
            <label className={labelCls}>
              {L("الأقساط الباقية للجهاز (دولار) — اختياري", "Remaining authority instalments (USD) — optional")}
              <input name="remainingUsd" type="number" min={0} inputMode="decimal" value={v.remainingUsd ?? ""} onChange={set("remainingUsd")} className={field} />
              <span className="text-xs">{L("بتظهر للمشتري في حاسبة التكلفة الكاملة بسعر دولار النهارده.", "Shown to buyers in the full-cost calculator at today's USD rate.")}</span>
            </label>
          )}
        </div>
      )}

      {step === 2 && (
        <div className="flex flex-col gap-4">
          <p className="leading-7 text-muted">
            {L(
              "كل ملف بيترفع أول ما تختاره وبيتحفظ في خزنة مشفّرة، والمحامي بيراجعه قبل النشر. PDF أو صورة (JPG/PNG/WebP)، أقل من 4 ميجا لكل ملف.",
              "Each file uploads as soon as you choose it and is kept in an encrypted vault; a lawyer reviews it before publishing. PDF or image (JPG/PNG/WebP), under 4 MB each.",
            )}
          </p>
          {FILES.map((f) => {
            const title = { allocation: L("خطاب التخصيص (مطلوب)", "Allocation letter (required)"), receipts: L("إيصالات السداد", "Payment receipts"), statement: L("آخر إفادة من الجهاز", "Latest authority statement") }[f.name];
            return (
              <div key={f.name} className={labelCls}>
                <span>{title}</span>
                {files[f.name] ? (
                  <span className="flex flex-wrap items-center gap-2 border border-[#BFE3CC] bg-[#EAF6EE] px-3 py-2 text-sm">
                    ✓ {files[f.name]!.name}
                    <button type="button" className="font-semibold text-brand underline" onClick={() => setFiles((cur) => ({ ...cur, [f.name]: undefined }))}>
                      {L("غيّر الملف", "Change file")}
                    </button>
                  </span>
                ) : (
                  <input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" aria-label={title} onChange={(e) => pick(f.name, e)} disabled={uploading === f.name} className="border border-dashed border-line p-2.5" {...inv(f.name)} />
                )}
                {uploading === f.name && <span className="text-xs text-muted">{L("بنرفع الملف…", "Uploading…")}</span>}
                <Err name={f.name} />
              </div>
            );
          })}
          {/* DOC-01: أي مستند إضافي بعنوان (إيصال قسط أخير، خطاب من الجهاز…) — لحد 20 ميجا، HEIC بيتحول JPG */}
          <div className={labelCls}>
            <span>{L("مستندات أخرى (اختياري)", "Other documents (optional)")}</span>
            <MultiUpload locale={locale} />
          </div>
          {partner && (
            <label className="flex min-h-11 items-center gap-2 text-sm">
              <input type="checkbox" name="clientConsent" className="size-4" />
              {L("أؤكد إن مالك القطعة موافق كتابةً على عرضها عن طريقي", "I confirm the plot owner has agreed in writing to list it through me")}
            </label>
          )}
        </div>
      )}

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
          <button type="submit" disabled={pending || !!uploading} className={btn.primary}>
            {pending ? L("بنبعت…", "Sending…") : L("ابعت للمراجعة", "Submit for review")}
          </button>
        )}
      </div>
    </form>
  );
}
