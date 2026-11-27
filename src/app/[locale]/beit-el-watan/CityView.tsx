import Link from "next/link";
/** GEO-01: المدينة = مفتاح نصي من جدول المدن */
type City = string;
import { db } from "@/lib/db";
import { latestRate, totalEgp } from "@/lib/listing";
import { loadIndex } from "@/lib/price-index-data";
import { money, num, toNum, tr } from "@/lib/format";
import { districtName } from "@/lib/district";
import { CITY, label } from "@/lib/labels";
import { CITY_SLUG, slugify } from "@/lib/slugs";
import { Card, Container, Empty, PageHeader, btn } from "@/components/ui";

/** MKT-08: صفحة مدينة أو حي — العروض المنشورة + متوسط سعر المتر (لو البيانات كافية) + أسئلة شائعة (JSON-LD) */
export async function CityView({ locale, city, district }: { locale: "ar" | "en"; city: City; district?: { nameAr: string; nameEn: string } }) {
  const L = tr(locale);
  const cityName = label(CITY, city, locale);
  const place = district ? `${cityName} — ${locale === "ar" ? district.nameAr : district.nameEn}` : cityName;
  const [rows, rate, index, districts] = await Promise.all([
    db.listing.findMany({
      where: { status: "PUBLISHED", seller: { status: "ACTIVE" }, plot: { city, ...(district ? { district: district.nameAr } : {}) } },
      include: { plot: true },
      orderBy: { publishedAt: "desc" },
      take: 24,
    }),
    latestRate(),
    loadIndex(),
    district ? Promise.resolve([]) : db.district.findMany({ where: { city, active: true }, orderBy: { sort: "asc" } }),
  ]);
  const usd = toNum(rate?.sell ?? 50);
  const last = index.points.filter((p) => p.city === city && p.avgPerSqm !== null).at(-1);
  const faq: [string, string][] = [
    [L(`إزاي أشتري قطعة بيت الوطن في ${place} بأمان؟`, `How do I buy a Beit El Watan plot in ${place} safely?`), L("كل عرض على Resell ورقه متراجع مع محامي (خطاب التخصيص وإيصالات السداد وإفادة الجهاز)، والعربون بيتحفظ في البنك لحد ما التنازل يتم في الجهاز.", "Every Resell listing has lawyer-checked papers (allocation letter, receipts and authority statement), and the deposit is held at the bank until the authority approves the transfer.")],
    [L("أقدر أشتري وأنا برّه مصر؟", "Can I buy from abroad?"), L("أيوه. التوقيع إلكتروني، والتنازل بيتم بتوكيل، وكل خطوة بتوصلك على واتساب.", "Yes. Signing is electronic, the transfer is done by power of attorney, and every step reaches you on WhatsApp.")],
    [L("التكلفة الكاملة كام؟", "What's the full cost?"), L("في صفحة كل قطعة حاسبة بتجمع السعر والأقساط الباقية بالدولار ورسوم التنازل والعمولة.", "Each plot page has a calculator adding the price, remaining USD instalments, transfer fee and commission.")],
  ];
  const jsonLd = { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: faq.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) };

  return (
    <>
      <PageHeader
        crumbs={[{ href: `/${locale}/beit-el-watan/${CITY_SLUG[city]}`, label: cityName }]}
        title={L(`أراضي بيت الوطن في ${place}`, `Beit El Watan plots in ${place}`)}
        subtitle={L("عروض منشورة ورقها متراجع، ومتوسط سعر المتر من صفقات اتقفلت فعلاً.", "Published listings with checked papers, and the average price per m² from deals that actually closed.")}
      />
      <Container className="flex flex-col gap-6">
        <div className="grid gap-3 md:grid-cols-3">
          <Card title={L("متوسط سعر المتر", "Average price per m²")}>
            <div className="text-2xl font-bold text-navy">{last ? money(last.avgPerSqm!, "EGP", locale) : L("بيانات غير كافية", "Insufficient data")}</div>
            {last && <div className="text-xs text-muted">{L(`صفقات ${last.month} في المدينة`, `${last.month} deals in the city`)}</div>}
          </Card>
          <Card title={L("عروض منشورة", "Published listings")}>
            <div className="text-2xl font-bold text-navy">{num(rows.length, locale)}</div>
          </Card>
          <Card title={L("عندك قطعة هنا؟", "Own a plot here?")}>
            <div className="flex flex-wrap gap-2">
              <Link href={`/${locale}/valuation`} className={btn.secondary}>
                {L("اعرف قيمتها", "Get its value")}
              </Link>
              <Link href={`/${locale}/list-your-plot`} className={btn.primary}>
                {L("اعرضها", "List it")}
              </Link>
            </div>
          </Card>
        </div>

        {districts.length > 0 && (
          <nav className="flex flex-wrap gap-2" aria-label={L("الأحياء", "Districts")}>
            {districts.map((d) => (
              <Link key={d.id} href={`/${locale}/beit-el-watan/${CITY_SLUG[city]}/${slugify(d.nameEn)}`} className="inline-flex min-h-10 items-center border border-line px-3 hover:border-navy">
                {locale === "ar" ? d.nameAr : d.nameEn}
              </Link>
            ))}
          </nav>
        )}

        {rows.length === 0 ? (
          <Empty>{L("مفيش عروض منشورة هنا دلوقتي.", "No published listings here right now.")}</Empty>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {rows.map((l) => (
              <li key={l.id}>
                <Link href={`/${locale}/listings/${l.id}`} className="flex flex-col gap-1 border border-line bg-white p-4 hover:border-brand">
                  <span className="font-bold">{districtName(l.plot, locale)}</span>
                  <span className="text-xl font-bold text-navy">{money(totalEgp(l, usd), "EGP", locale)}</span>
                  <span className="text-sm text-muted">
                    {num(l.plot.areaSqm, locale)} {L("م²", "m²")}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}

        <section className="flex flex-col gap-3">
          <h2 className="text-2xl font-bold">{L("أسئلة شائعة", "Frequent questions")}</h2>
          {faq.map(([q, a]) => (
            <details key={q} className="border border-line px-5 py-4">
              <summary className="cursor-pointer font-bold">{q}</summary>
              <p className="mt-2 leading-7 text-muted">{a}</p>
            </details>
          ))}
        </section>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      </Container>
    </>
  );
}
