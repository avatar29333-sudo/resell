import { notFound } from "next/navigation";
import { isLocale } from "@/i18n/config";
import { date, daysUntil, num, tr } from "@/lib/format";
import { pageMeta } from "@/lib/meta";
import { RescueCalculator, RescueForm } from "./RescueParts";

// قرار مجلس الإدارة رقم 220 بتاريخ 16 نوفمبر 2026 — التقديم خلال شهرين
const DECISION_DATE = new Date("2026-11-16");
const DEADLINE = new Date("2027-01-16");

export const generateMetadata = ({ params }: { params: Promise<{ locale: string }> }) => pageMeta(params, "إنقاذ مهلة البناء", "Build deadline rescue");

export default async function RescuePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const L = tr(locale);
  const left = Math.max(0, daysUntil(DEADLINE) ?? 0);
  const total = Math.round((DEADLINE.getTime() - DECISION_DATE.getTime()) / 86_400_000);
  const steps = [
    [L("ترفع ورقك", "Upload your papers"), L("خطاب التخصيص، وإيصالات السداد، وآخر إفادة من الجهاز.", "Allocation letter, payment receipts and the latest authority statement.")],
    [L("نعاين ونقيس", "We inspect"), L("مندوبنا يصوّر الموقع ويحدد نسبة التنفيذ في تقرير بالصور والخريطة.", "Our agent photographs the site and measures progress in a report with photos and a map.")],
    [L("نجهّز الطلب", "We prepare the file"), L("المحامي يحسب المستحق ويجهز الملف، وممكن جدولة المبلغ على سنة بسعر دولار ثابت.", "The lawyer calculates what's due and prepares the file; payment can be spread over a year at a fixed USD rate.")],
    [L("نتابع لحد القرار", "We follow up"), L("نقدّم في الجهاز بتوكيل، ونبعت لك كل خطوة على واتساب.", "We file at the authority by power of attorney and update you on WhatsApp at every step.")],
  ];
  const faq = [
    [L("لازم آجي مصر؟", "Do I need to come to Egypt?"), L("لأ. التقديم بيتم بتوكيل رسمي لمندوبنا لتقديم الطلب ومتابعته بس، مش توكيل بيع.", "No. We file with a power of attorney for filing and follow-up only — not a sale POA.")],
    [L("لو عليّا أقساط متأخرة؟", "What if I have overdue instalments?"), L("سداد المستحق بأعبائه شرط للاستفادة. بنحسب لك المبلغ بالظبط قبل ما تقرر.", "Paying what's due with charges is a condition. We calculate the exact amount before you decide.")],
    [L("ولو قررت أبيع بدل ما أكمّل؟", "What if I'd rather sell?"), L("Resell بتبيع قطع بيت الوطن على الورق الصحيح: مراجعة محامي، وعربون محفوظ، وتنازل في الجهاز. وتقرير المعاينة بتاعك بيدخل في ملف البيع.", "Resell sells Beit El Watan plots on the right paperwork: lawyer review, a held deposit and transfer at the authority. Your inspection report goes into the sale file.")],
  ];

  return (
    <>
      <section className="bg-navy pt-14 pb-[72px] text-white">
        <div className="mx-auto grid max-w-6xl items-center gap-8 px-5 md:grid-cols-2 md:px-8">
          <div className="flex flex-col gap-5">
            <span className="self-start border border-[#4A5A8F] px-3 py-1.5 text-sm text-[#D6DCEE]">
              {L(`قرار مجلس إدارة هيئة المجتمعات العمرانية رقم 220 · ${date(DECISION_DATE, locale)}`, `NUCA board decision no. 220 · ${date(DECISION_DATE, locale)}`)}
            </span>
            <h1 className="text-[34px] leading-tight font-bold md:text-[46px]">
              {L("مهلة قطعتك في بيت الوطن قرّبت تخلص؟ القرار الجديد بيديك فرصة، بس لمدة شهرين", "Is your Beit El Watan build deadline running out? The new decision gives you a chance — for two months only")}
            </h1>
            <p className="text-lg leading-8 text-[#D6DCEE]">
              {L(
                "الهيئة فتحت تسهيلات لأصحاب قطع بيت الوطن: مد مهلة التنفيذ لحد سنة، وزيادة دور سكني كامل. إحنا بنحسب لك تستفيد بإيه، ونجهّز الملف، ونقدّمه في جهاز المدينة وأنت في مكانك برّه مصر.",
                "The authority opened relief for Beit El Watan owners: up to a year's extension and an extra residential floor. We work out what you qualify for, prepare the file and submit it while you stay abroad.",
              )}
            </p>
            <div className="flex flex-wrap gap-3">
              <a href="#start" className="inline-flex min-h-12 items-center bg-brand-bright px-6 text-[17px] font-semibold text-white hover:bg-brand">
                {L("افحص قطعتك مجاناً", "Check your plot for free")}
              </a>
              <a href="#check" className="inline-flex min-h-12 items-center border border-[#8C9AC6] px-6 text-[17px] text-white hover:bg-navy-soft">
                {L("احسب حالتك", "Check your case")}
              </a>
            </div>
          </div>
          <div className="flex flex-col gap-4 bg-white p-7 text-ink">
            <div className="text-sm text-muted">{L("آخر موعد لتقديم الطلبات (تقريباً)", "Application deadline (approx.)")}</div>
            <div className="flex items-baseline gap-2.5">
              <span className="text-[64px] leading-none font-bold text-navy">{num(left, locale)}</span>
              <span className="text-[22px] font-semibold">{L("يوم باقيين", "days left")}</span>
            </div>
            <div className="h-2 bg-[#E6E9F2]">
              <div className="h-2 bg-brand-bright" style={{ width: `${Math.min(100, ((total - left) / total) * 100)}%` }} />
            </div>
            <p className="text-[15px] leading-7 text-muted">
              {L("القرار بيقول: التقديم خلال شهرين من الإعلان، ومش هيتقبل أي طلب بعدها. آخر يوم تقريباً: ", "Applications within two months of the announcement; none accepted after. Approximate last day: ")}
              <strong className="text-ink">{date(DEADLINE, locale)}</strong>
            </p>
            <p className="border-t border-[#E6E9F2] pt-3.5 text-sm text-muted">
              ✓ {L("مش بنستلم منك أي فلوس للجهاز. الرسوم بتحوّلها أنت من الخارج باسمك.", "We never take money for the authority. You transfer fees from abroad in your own name.")}
            </p>
          </div>
        </div>
      </section>

      <section id="tiers" className="bg-paper py-[72px]">
        <div className="mx-auto flex max-w-6xl flex-col gap-7 px-5 md:px-8">
          <div className="flex flex-col gap-2">
            <h2 className="text-3xl font-bold">{L("التسهيلات حسب نسبة تنفيذ قطعتك", "Relief by construction progress")}</h2>
            <p className="text-lg text-muted">{L("نسبة التنفيذ هي اللي بتحدد حقك. عشان كده أول حاجة بنعملها إننا نقيسها في الموقع.", "Your construction level sets what you qualify for, so we measure it on site first.")}</p>
          </div>
          <div className="grid gap-5 md:grid-cols-3">
            {[
              [L("التنفيذ أكتر من 70%", "Over 70% built"), L("6 شهور زيادة", "6 more months"), L("من غير أي مقابل مادي.", "Free of charge."), false],
              [L("التنفيذ من 35% لـ 70%", "35% to 70% built"), L("سنة كاملة", "A full year"), L("مقابل 10% من سعر القطعة الحالي، بالدولار ومحوّلة من الخارج. وتقدر تطلّع التراخيص في الفترة دي.", "For 10% of the current plot price, in USD from abroad. You can get permits during this time."), true],
              [L("التنفيذ أقل من 35%", "Under 35% built"), L("حالة خاصة", "Special case"), L("القرار ما حددش شروط للنسبة دي. بنراجع حالتك مع الجهاز ونقولك إيه الممكن، ومنها خيار البيع.", "The decision sets no terms here. We review your case with the authority, including the option to sell."), false],
            ].map(([a, b, c, hi]) => (
              <div key={String(a)} className={`flex flex-col gap-3 bg-white p-6 ${hi ? "border-2 border-brand" : "border border-line"}`}>
                <div className="font-semibold text-brand">{a}</div>
                <div className="text-3xl font-bold">{b}</div>
                <div className="leading-7 text-muted">{c}</div>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-5 bg-navy px-7 py-6 text-white">
            <div className="flex flex-col gap-1.5">
              <div className="text-xl font-bold">{L("ولكل القطع: زيادة دور سكني كامل", "For every plot: one extra residential floor")}</div>
              <div className="text-[#D6DCEE]">{L("مقابل علاوة بتتدفع كاش بالدولار من الخارج، في حدود الارتفاع المسموح وبترخيص طبقاً لقانون البناء.", "For a premium paid in USD from abroad, within height limits and with a building permit.")}</div>
            </div>
            <a href="#check" className="font-semibold text-white">
              {L("احسب حالتك ←", "Check your case →")}
            </a>
          </div>
        </div>
      </section>

      <section id="check" className="mx-auto max-w-6xl px-5 py-[72px] md:px-8">
        <RescueCalculator locale={locale} />
      </section>

      <section id="how" className="bg-paper py-[72px]">
        <div className="mx-auto flex max-w-6xl flex-col gap-7 px-5 md:px-8">
          <h2 className="text-3xl font-bold">{L("طريقة العمل، وأنت برّه مصر", "How it works from abroad")}</h2>
          <ol className="grid gap-5 md:grid-cols-4">
            {steps.map(([t, b], i) => (
              <li key={t} className="flex flex-col gap-2.5 border-t-[3px] border-navy pt-4">
                <span className="text-[28px] font-bold text-brand">{num(i + 1, locale)}</span>
                <span className="text-[19px] font-bold">{t}</span>
                <span className="leading-7 text-muted">{b}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="start" className="mx-auto grid max-w-6xl items-start gap-8 px-5 py-[72px] md:grid-cols-2 md:px-8">
        <div className="flex flex-col gap-3.5">
          <h2 className="text-3xl font-bold">{L("ابدأ فحص قطعتك مجاناً", "Start your free plot check")}</h2>
          <p className="text-lg leading-8 text-muted">{L("سيب بياناتك ونرد عليك خلال يوم عمل.", "Leave your details and we'll reply within one working day.")}</p>
          <p className="leading-7 text-muted">{L("رقمك وورقك ما بيظهروش لأي حد غير الوسيط والمحامي المسؤولين عن ملفك.", "Only the broker and lawyer handling your file see your number and papers.")}</p>
        </div>
        <RescueForm locale={locale} />
      </section>

      <section id="faq" className="bg-paper py-[72px]">
        <div className="mx-auto flex max-w-[900px] flex-col gap-4 px-5 md:px-8">
          <h2 className="text-3xl font-bold">{L("أسئلة بتتكرر", "Frequent questions")}</h2>
          {faq.map(([q, a]) => (
            <details key={q} className="bg-white px-6 py-5">
              <summary className="cursor-pointer text-lg font-bold">{q}</summary>
              <p className="mt-2 leading-7 text-muted">{a}</p>
            </details>
          ))}
        </div>
      </section>
    </>
  );
}
