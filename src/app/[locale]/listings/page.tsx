import Link from "next/link";
import { notFound } from "next/navigation";
import type { City } from "@prisma/client";
import { isLocale } from "@/i18n/config";
import { db } from "@/lib/db";
import { latestRate, totalEgp } from "@/lib/listing";
import { getSetting } from "@/lib/settings";
import { daysUntil, money, num, toNum, tr } from "@/lib/format";
import { CITY, CITY_KEYS, LISTING_STATUS, PAYMENT_STATUS, PRICE_TYPE, label, toneOf } from "@/lib/labels";
import { Badge, Container, Empty, PageHeader, btn, field, labelCls } from "@/components/ui";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ city?: string; area?: string; budget?: string; sort?: string; paid?: string }>;
};

export default async function ListingsPage({ params, searchParams }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const sp = await searchParams;
  const L = tr(locale);

  const city = CITY_KEYS.includes(sp.city as never) ? (sp.city as City) : undefined;
  const minArea = Number(sp.area) || undefined;
  const budget = Number(sp.budget) || undefined;

  const rate = await latestRate();
  const usd = toNum(rate?.sell ?? 50);
  const validity = await getSetting("documents.validity");

  const rows = await db.listing.findMany({
    where: {
      status: { in: ["PUBLISHED", "IN_DEAL"] },
      seller: { status: "ACTIVE" },
      // DATA-03: العرض اللي إفادته انتهت يختفي (لو الإعداد «hide») أو يظهر بشارة
      ...(validity.expiredListing === "hide" ? { statementExpiredAt: null } : {}),
      plot: {
        ...(city ? { city } : {}),
        ...(minArea ? { areaSqm: { gte: minArea } } : {}),
        ...(sp.paid === "1" ? { paymentStatus: "FULLY_PAID" as const } : {}),
      },
    },
    include: { plot: true, documents: { where: { status: "APPROVED" }, select: { type: true } } },
    orderBy: { publishedAt: "desc" },
  });

  let listings = rows.map((l) => ({ ...l, total: totalEgp(l, usd) }));
  if (budget) listings = listings.filter((l) => l.total <= budget);
  if (sp.sort === "price") listings.sort((a, b) => a.total - b.total);
  if (sp.sort === "sqm") listings.sort((a, b) => a.total / toNum(a.plot.areaSqm) - b.total / toNum(b.plot.areaSqm));

  return (
    <>
      <PageHeader
        title={L("سجل العروض", "Listings register")}
        subtitle={L(
          "كل عرض هنا ورقه متراجع مع محامي. كود القطعة وبيانات البائع بتظهر بعد اتفاق العمولة.",
          "Every listing here has lawyer-checked papers. The plot code and seller details appear after the commission agreement.",
        )}
      />
      <Container className="flex flex-col gap-6">
        <form className="grid gap-4 border border-line bg-paper p-4 md:grid-cols-[repeat(5,minmax(0,1fr))_auto] md:items-end">
          <label className={labelCls}>
            {L("المدينة", "City")}
            <select name="city" defaultValue={city ?? ""} className={field}>
              <option value="">{L("كل المدن", "All cities")}</option>
              {CITY_KEYS.map((k) => (
                <option key={k} value={k}>
                  {label(CITY, k, locale)}
                </option>
              ))}
            </select>
          </label>
          <label className={labelCls}>
            {L("أقل مساحة (م²)", "Min area (m²)")}
            <input name="area" type="number" min={0} defaultValue={sp.area} className={field} />
          </label>
          <label className={labelCls}>
            {L("أقصى ميزانية شاملة (ج.م)", "Max total budget (EGP)")}
            <input name="budget" type="number" min={0} defaultValue={sp.budget} className={field} />
          </label>
          <label className={labelCls}>
            {L("الترتيب", "Sort")}
            <select name="sort" defaultValue={sp.sort ?? ""} className={field}>
              <option value="">{L("الأحدث", "Newest")}</option>
              <option value="price">{L("السعر الأقل", "Lowest price")}</option>
              <option value="sqm">{L("سعر المتر الأقل", "Lowest price per m²")}</option>
            </select>
          </label>
          <label className="flex min-h-11 items-center gap-2 text-sm font-medium text-muted">
            <input type="checkbox" name="paid" value="1" defaultChecked={sp.paid === "1"} className="size-5" />
            {L("مسدد بالكامل بس", "Fully paid only")}
          </label>
          <button type="submit" className={btn.primary}>
            {L("ابحث", "Search")}
          </button>
        </form>

        <p className="text-muted">
          {L(`${num(listings.length, locale)} عرض`, `${listings.length} listings`)} ·{" "}
          {L(`سعر الدولار المستخدم: ${num(usd, locale, 2)} ج.م`, `USD rate used: EGP ${num(usd, locale, 2)}`)}
        </p>

        {listings.length === 0 ? (
          <Empty>{L("مفيش عروض بالشروط دي. جرّب توسّع البحث.", "No listings match. Try widening your search.")}</Empty>
        ) : (
          <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {listings.map((l) => {
              const days = daysUntil(l.plot.buildDeadline);
              const verified = new Set(l.documents.map((d) => d.type));
              return (
                <li key={l.id}>
                  <Link
                    href={`/${locale}/listings/${l.id}`}
                    className="flex h-full flex-col gap-3 border border-line bg-white p-5 hover:border-brand hover:shadow-[0_8px_30px_rgba(10,25,68,0.10)]"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex flex-col">
                        <span className="text-lg font-bold">{label(CITY, l.plot.city, locale)}</span>
                        <span className="text-sm text-muted">{l.plot.district}</span>
                      </div>
                      <Badge tone={toneOf(l.status)}>{label(LISTING_STATUS, l.status, locale)}</Badge>
                    </div>
                    <div className="text-2xl font-bold text-navy">{money(l.total, "EGP", locale)}</div>
                    <div className="text-sm text-muted">
                      {label(PRICE_TYPE, l.priceType, locale)} · {money(l.total / toNum(l.plot.areaSqm), "EGP", locale)}{" "}
                      {L("للمتر", "/ m²")}
                    </div>
                    <dl className="grid grid-cols-2 gap-2 border-t border-line pt-3 text-sm">
                      <div>
                        <dt className="text-muted">{L("المساحة", "Area")}</dt>
                        <dd className="font-semibold">{num(l.plot.areaSqm, locale)} {L("م²", "m²")}</dd>
                      </div>
                      <div>
                        <dt className="text-muted">{L("السداد", "Payment")}</dt>
                        <dd className="font-semibold">{label(PAYMENT_STATUS, l.plot.paymentStatus, locale)}</dd>
                      </div>
                      <div>
                        <dt className="text-muted">{L("نسبة التنفيذ", "Built")}</dt>
                        <dd className="font-semibold">{num(l.plot.constructionPercent, locale)}%</dd>
                      </div>
                      <div>
                        <dt className="text-muted">{L("مهلة البناء", "Build deadline")}</dt>
                        <dd className={`font-semibold ${days !== null && days < 120 ? "text-[#A32020]" : ""}`}>
                          {days === null ? "—" : days < 0 ? L("خلصت", "Passed") : L(`${num(days, locale)} يوم`, `${days} days`)}
                        </dd>
                      </div>
                    </dl>
                    <div className="mt-auto flex flex-wrap gap-1.5">
                      {verified.has("ALLOCATION_LETTER") && <Badge tone="green">{L("✓ خطاب التخصيص", "✓ Allocation letter")}</Badge>}
                      {l.statementExpiredAt ? (
                        <Badge tone="amber">{L("⚠ محتاج تحديث — إفادة الجهاز انتهت", "⚠ Needs update — authority statement expired")}</Badge>
                      ) : (
                        verified.has("AUTHORITY_STATEMENT") && <Badge tone="green">{L("✓ إفادة الجهاز", "✓ Authority statement")}</Badge>
                      )}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Container>
    </>
  );
}
