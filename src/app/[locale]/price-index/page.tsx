import { allCities } from "@/lib/cities";
import Link from "next/link";
import { notFound } from "next/navigation";
/** GEO-01: المدينة = مفتاح نصي من جدول المدن */
type City = string;
import { isLocale, type Locale } from "@/i18n/config";
import { loadIndex } from "@/lib/price-index-data";
import { money, num, tr } from "@/lib/format";
import { CITY, CITY_KEYS, label } from "@/lib/labels";
import { pageMeta } from "@/lib/meta";
import { Card, Container, Empty, PageHeader, Table } from "@/components/ui";

type Props = { params: Promise<{ locale: string }>; searchParams: Promise<{ city?: string }> };

function monthLabel(d: Date, locale: Locale) {
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-EG" : "en-US", { month: "short", year: "2-digit" }).format(d);
}

/** خط بسيط لمتوسط سعر المتر عبر الشهور */
function LineChart({ points, locale }: { points: { x: Date; y: number; n: number }[]; locale: Locale }) {
  const W = 760;
  const H = 300;
  const P = { t: 20, r: 24, b: 40, l: 76 };
  const ys = points.map((p) => p.y);
  const min = Math.min(...ys) * 0.95;
  const max = Math.max(...ys) * 1.05;
  const sx = (i: number) => P.l + (i * (W - P.l - P.r)) / Math.max(1, points.length - 1);
  const sy = (v: number) => H - P.b - ((v - min) / (max - min || 1)) * (H - P.t - P.b);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => min + f * (max - min));
  const d = points.map((p, i) => `${i ? "L" : "M"}${sx(i).toFixed(1)},${sy(p.y).toFixed(1)}`).join(" ");
  const last = points[points.length - 1];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={tr(locale)("متوسط سعر المتر بالشهر", "Average price per m² by month")} className="w-full" direction="ltr">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={P.l} x2={W - P.r} y1={sy(t)} y2={sy(t)} stroke="#DDE1EA" />
          <text x={P.l - 8} y={sy(t) + 4} textAnchor="end" fontSize="12" fill="#4B5263">
            {num(t, locale)}
          </text>
        </g>
      ))}
      {points.map((p, i) =>
        i % 2 === 0 || i === points.length - 1 ? (
          <text key={i} x={sx(i)} y={H - 14} textAnchor="middle" fontSize="12" fill="#4B5263">
            {monthLabel(p.x, locale)}
          </text>
        ) : null,
      )}
      <path d={d} fill="none" stroke="#193EA8" strokeWidth="2.5" />
      {points.map((p, i) => (
        <circle key={i} cx={sx(i)} cy={sy(p.y)} r="3.5" fill="#193EA8">
          <title>{`${monthLabel(p.x, locale)}: ${num(p.y, locale)} (${p.n})`}</title>
        </circle>
      ))}
      <text x={sx(points.length - 1) - 6} y={sy(last.y) - 10} textAnchor="end" fontSize="13" fontWeight="700" fill="#0A1944">
        {num(last.y, locale)}
      </text>
    </svg>
  );
}

export const generateMetadata = ({ params }: { params: Promise<{ locale: string }> }) => pageMeta(params, "مؤشر أسعار بيت الوطن", "Beit El Watan price index");

export default async function PriceIndexPage({ params, searchParams }: Props) {
  await allCities(); // GEO-01: قايمة المدن من الجدول
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const L = tr(locale);
  const sp = await searchParams;
  const city = (CITY_KEYS.includes(sp.city as never) ? sp.city : "NEW_CAIRO") as City;

  // DATA-04: من الصفقات المقفولة فعلاً بس، والشهر اللي صفقاته أقل من الحد ما بيظهرش له رقم
  const { points, minDeals } = await loadIndex();
  const toDate = (m: string) => new Date(`${m}-01T00:00:00Z`);
  const cityPoints = points.filter((p) => p.city === city);
  const series = cityPoints.filter((p) => p.avgPerSqm !== null).map((p) => ({ x: toDate(p.month), y: p.avgPerSqm!, n: p.deals }));

  const latestByCity = CITY_KEYS.map((c) => {
    const rows = points.filter((p) => p.city === c && p.avgPerSqm !== null);
    const last = rows[rows.length - 1];
    const yearAgo = rows.find((p) => last && p.month <= `${Number(last.month.slice(0, 4)) - 1}${last.month.slice(4)}`) ?? null;
    return {
      city: c,
      last: last?.avgPerSqm ?? null,
      lastMonth: last?.month ?? null,
      change: last && yearAgo ? (last.avgPerSqm! / yearAgo.avgPerSqm! - 1) * 100 : null,
      deals: points.filter((p) => p.city === c).reduce((s, r) => s + r.deals, 0),
    };
  });

  return (
    <>
      <PageHeader
        title={L("مؤشر أسعار بيت الوطن", "Beit El Watan price index")}
        subtitle={L(
          "متوسط سعر المتر الشامل بالجنيه، محسوب من الصفقات اللي اتقفلت على المنصة بس — مش من أسعار العرض.",
          "Average all-in price per m² in EGP, from deals closed on the platform only — not asking prices.",
        )}
      />
      <Container className="flex flex-col gap-6">
        <nav className="flex flex-wrap gap-2" aria-label={L("المدينة", "City")}>
          {CITY_KEYS.map((c) => (
            <Link
              key={c}
              href={`/${locale}/price-index?city=${c}`}
              aria-current={c === city ? "page" : undefined}
              className={`inline-flex min-h-11 items-center border px-4 font-semibold ${c === city ? "border-navy bg-navy text-white" : "border-line hover:border-navy"}`}
            >
              {label(CITY, c, locale)}
            </Link>
          ))}
        </nav>

        <Card title={L(`${label(CITY, city, locale)} — متوسط سعر المتر بالشهر (ج.م)`, `${label(CITY, city, locale)} — average price per m² by month (EGP)`)}>
          {series.length > 1 ? (
            <LineChart points={series} locale={locale} />
          ) : (
            <Empty>
              {L(
                `بيانات غير كافية — المؤشر بيظهر لما يبقى فيه ${num(minDeals, locale)} صفقات مقفولة على الأقل في الشهر.`,
                `Insufficient data — the index appears once there are at least ${minDeals} closed deals in a month.`,
              )}
            </Empty>
          )}
          {cityPoints.some((p) => p.avgPerSqm === null) && series.length > 1 && (
            <p className="text-sm text-muted">{L(`الشهور اللي فيها أقل من ${num(minDeals, locale)} صفقات مش ظاهرة (بيانات غير كافية).`, `Months with fewer than ${minDeals} deals are not shown (insufficient data).`)}</p>
          )}
        </Card>

        <Table head={[L("المدينة", "City"), L("آخر متوسط للمتر", "Latest avg / m²"), L("التغيير في سنة", "1-year change"), L("عدد الصفقات", "Deals")]}>
          {latestByCity.map((r) => (
            <tr key={r.city}>
              <td className="font-semibold">{label(CITY, r.city, locale)}</td>
              <td>{r.last ? money(r.last, "EGP", locale) : <span className="text-muted">{L("بيانات غير كافية", "Insufficient data")}</span>}</td>
              <td className={r.change !== null && r.change >= 0 ? "text-ok" : "text-[#A32020]"}>
                {r.change === null ? "—" : `${r.change >= 0 ? "+" : ""}${num(r.change, locale, 1)}%`}
              </td>
              <td>{num(r.deals, locale)}</td>
            </tr>
          ))}
        </Table>
      </Container>
    </>
  );
}
