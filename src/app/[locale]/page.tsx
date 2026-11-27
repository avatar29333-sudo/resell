import { allCities } from "@/lib/cities";
import Link from "next/link";
import { notFound } from "next/navigation";
import { isLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { CITY, CITY_KEYS, label } from "@/lib/labels";
import { db } from "@/lib/db";
import { num, tr } from "@/lib/format";

type Params = Promise<{ locale: string }>;

export default async function HomePage({ params }: { params: Params }) {
  await allCities(); // GEO-01: قايمة المدن من الجدول
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = getDictionary(locale);
  const L = tr(locale);
  // MKT-14: العداد من الصفقات الحقيقية بس (isDemo=false)، والقصص المنشورة بموافقة الطرفين
  const [closedSafely, stories] = await Promise.all([
    db.deal.count({ where: { status: "COMPLETED", isDemo: false } }),
    db.dealStory.findMany({ where: { status: "PUBLISHED" }, orderBy: { publishedAt: "desc" }, take: 6 }),
  ]);

  const steps = [
    { n: 1, title: t.steps.s1Title, body: t.steps.s1Body },
    { n: 2, title: t.steps.s2Title, body: t.steps.s2Body },
    { n: 3, title: t.steps.s3Title, body: t.steps.s3Body },
    { n: 4, title: t.steps.s4Title, body: t.steps.s4Body },
  ];
  const cities = CITY_KEYS.map((k) => [k, label(CITY, k, locale)] as const);
  const field = "min-h-12 w-full border border-line bg-white px-3 text-ink";

  return (
    <>
      <section className="bg-navy pt-14 pb-24 text-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-5 md:px-8">
          <span className="self-start border border-[#4A5A8F] px-3 py-1.5 text-sm text-[#D6DCEE]">
            {t.hero.badge}
          </span>
          <h1 className="max-w-3xl text-4xl leading-tight font-bold md:text-[52px]">{t.hero.title}</h1>
          <p className="max-w-2xl text-lg leading-8 text-[#D6DCEE]">{t.hero.body}</p>
        </div>
      </section>

      {/* شريط البحث — بيتربط بسجل العروض في السبرنت S3 */}
      <section className="mx-auto -mt-12 max-w-6xl px-5 md:px-8">
        <form
          action={`/${locale}/listings`}
          className="grid gap-4 bg-white p-5 shadow-[0_8px_30px_rgba(10,25,68,0.12)] md:grid-cols-[1fr_1fr_1fr_auto] md:items-end"
        >
          <label className="flex flex-col gap-1.5 text-sm font-medium text-muted">
            {t.hero.city}
            <select name="city" className={field} defaultValue="">
              <option value="">{t.hero.cityAny}</option>
              {cities.map(([key, name]) => (
                <option key={key} value={key}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium text-muted">
            {t.hero.area}
            <input name="area" type="number" min={0} inputMode="numeric" className={field} />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium text-muted">
            {t.hero.budget}
            <input name="budget" type="number" min={0} inputMode="numeric" className={field} />
          </label>
          <button type="submit" className="min-h-12 bg-brand px-6 font-semibold text-white hover:bg-navy">
            {t.hero.search}
          </button>
        </form>
      </section>

      <section id="how" className="mx-auto max-w-6xl px-5 py-20 md:px-8">
        <h2 className="mb-8 text-3xl font-bold">{t.steps.title}</h2>
        <ol className="grid gap-6 md:grid-cols-4">
          {steps.map((s) => (
            <li key={s.n} className="flex flex-col gap-2 border-t-[3px] border-navy pt-4">
              <span className="text-2xl font-bold text-brand">{s.n.toLocaleString(locale === "ar" ? "ar-EG" : "en")}</span>
              <h3 className="text-lg font-bold">{s.title}</h3>
              <p className="leading-7 text-muted">{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="bg-paper py-16">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-6 px-5 md:px-8">
          <div className="flex max-w-2xl flex-col gap-2">
            <h2 className="text-2xl font-bold">{t.cta.title}</h2>
            <p className="leading-7 text-muted">{t.cta.body}</p>
          </div>
          <Link
            href={`/${locale}/list-your-plot`}
            className="inline-flex min-h-12 items-center bg-brand px-7 font-semibold text-white hover:bg-navy"
          >
            {t.cta.button}
          </Link>
        </div>
      </section>

      {/* MKT-14: قصص صفقات حقيقية (بموافقة الطرفين) + عداد من البيانات الحقيقية بس */}
      <section className="mx-auto flex max-w-6xl flex-col gap-6 px-5 py-16 md:px-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h2 className="text-2xl font-bold">{L("صفقات اتقفلت بأمان", "Deals closed safely")}</h2>
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-bold text-navy">{num(closedSafely, locale)}</span>
            <span className="text-sm text-muted">{L("صفقة حقيقية على المنصة", "real deals on the platform")}</span>
          </div>
        </div>
        {stories.length > 0 ? (
          <ul className="grid gap-4 md:grid-cols-3">
            {stories.map((s) => (
              <li key={s.id} className="border-s-[3px] border-brand bg-paper p-5 leading-7">
                {(locale === "ar" ? s.textAr : s.textEn) ?? s.textAr}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted">{L("أول القصص هتظهر هنا بعد موافقة أصحابها.", "The first stories will appear here once their owners agree.")}</p>
        )}
        <div className="flex flex-wrap gap-3">
          <Link href={`/${locale}/valuation`} className="inline-flex min-h-11 items-center border border-line px-5 font-semibold hover:border-navy">
            {L("اعرف قيمة قطعتك", "What's my plot worth?")}
          </Link>
          <Link href={`/${locale}/remind-me`} className="inline-flex min-h-11 items-center border border-line px-5 font-semibold hover:border-navy">
            {L("فكّرني بمهلتي", "Remind me of my deadline")}
          </Link>
          <Link href={`/${locale}/guides`} className="inline-flex min-h-11 items-center border border-line px-5 font-semibold hover:border-navy">
            {L("الأدلة", "Guides")}
          </Link>
        </div>
      </section>
    </>
  );
}
