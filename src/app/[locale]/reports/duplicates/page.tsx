import Link from "next/link";
import { notFound } from "next/navigation";
import { isLocale } from "@/i18n/config";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { findDuplicates, sameBuyerGroups } from "@/lib/duplicates";
import { districtName } from "@/lib/district";
import { date, money, num, toNum, tr } from "@/lib/format";
import { CITY, DEAL_STAGE, DEAL_STATUS, LISTING_STATUS, label, toneOf } from "@/lib/labels";
import { pageMeta } from "@/lib/meta";
import { Badge, Card, Container, Empty, PageHeader } from "@/components/ui";

/** DATA-08 — تقرير الأدمن بالقطع المحتمل تكرارها */
export const generateMetadata = ({ params }: { params: Promise<{ locale: string }> }) => pageMeta(params, "قطع محتمل تكرارها", "Possible duplicates", { noindex: true });

export default async function DuplicatesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const L = tr(locale);
  await requireUser(locale, `/${locale}/reports/duplicates`, ["ADMIN"]);

  const plots = await db.plot.findMany({
    include: {
      listings: {
        include: { seller: { select: { name: true } }, deals: { include: { buyer: { select: { id: true, name: true } } }, orderBy: { createdAt: "asc" } } },
      },
    },
  });
  const lite = plots.map((p) => ({ ...p, areaSqm: toNum(p.areaSqm), buyerIds: p.listings.flatMap((l) => l.deals.map((d) => d.buyer.id)) }));
  const byCode = findDuplicates(lite);
  const inCode = new Set(byCode.flat().map((p) => p.id));
  // المجموعات اللي اتلقت بالمشتري بس (مش متكررة مع مجموعات الكود)
  const groups = [...byCode, ...sameBuyerGroups(lite).filter((g) => g.some((p) => !inCode.has(p.id)))];
  // نفس المشتري في أكتر من صفقة على قطع المجموعة = علامة واضحة
  const sameBuyer = (g: (typeof groups)[number]) => {
    const buyers = g.flatMap((p) => p.listings.flatMap((l) => l.deals.map((d) => d.buyer.id)));
    return buyers.length !== new Set(buyers).size;
  };

  return (
    <>
      <PageHeader
        crumbs={[{ href: `/${locale}/reports`, label: L("التقارير", "Reports") }]}
        title={L("قطع محتمل تكرارها", "Possible duplicate plots")}
        subtitle={L(
          "نفس المدينة والحي والمساحة، والكود متطابق أو قريب (فرق حرفين بالكتير بعد توحيد الكتابة) — أو نفس المشتري عنده صفقات على أكتر من قطعة منهم.",
          "Same city, district and area, with an identical or close code (at most two characters apart after normalising) — or one buyer with deals on more than one of them.",
        )}
      />
      <Container className="flex flex-col gap-4">
        {groups.length === 0 ? (
          <Empty>{L("مفيش قطع محتمل تكرارها.", "No possible duplicates found.")}</Empty>
        ) : (
          groups.map((g, i) => (
            <Card
              key={g[0].id}
              title={
                <span className="flex flex-wrap items-center gap-2">
                  {L(`مجموعة ${num(i + 1, locale)}`, `Group ${i + 1}`)} — {label(CITY, g[0].city, locale)} · {districtName(g[0], locale)} · {num(g[0].areaSqm, locale)} {L("م²", "m²")}
                  {sameBuyer(g) && <Badge tone="red">{L("نفس المشتري في أكتر من صفقة", "Same buyer in more than one deal")}</Badge>}
                </span>
              }
            >
              <ul className="flex flex-col gap-3">
                {g.map((p) => (
                  <li key={p.id} className="border border-line p-3">
                    <div className="font-mono text-sm" dir="ltr">
                      {p.code}
                    </div>
                    {p.listings.length === 0 && <div className="text-sm text-muted">{L("مفيش عروض على القطعة دي.", "No listings on this plot.")}</div>}
                    {p.listings.map((l) => (
                      <div key={l.id} className="mt-1 flex flex-col gap-1 text-sm">
                        <div className="flex flex-wrap items-center gap-2">
                          <Link href={`/${locale}/listings/${l.id}`} className="font-semibold text-brand">
                            {L("عرض", "Listing")} #{l.id.slice(-6).toUpperCase()}
                          </Link>
                          <Badge tone={toneOf(l.status)}>{label(LISTING_STATUS, l.status, locale)}</Badge>
                          <span className="text-muted">
                            {l.seller.name} · {money(l.price, l.currency, locale)} · {date(l.createdAt, locale)}
                          </span>
                        </div>
                        {l.deals.map((d) => (
                          <div key={d.id} className="ms-4 flex flex-wrap items-center gap-2 text-muted">
                            <Link href={`/${locale}/deals/${d.id}`} className="text-brand">
                              {L("صفقة", "Deal")} #{d.id.slice(-6).toUpperCase()}
                            </Link>
                            {d.buyer.name} · {label(DEAL_STAGE, d.stage, locale)} · {label(DEAL_STATUS, d.status, locale)}
                            {d.agreedPrice && <> · {money(d.agreedPrice, d.agreedCurrency ?? "EGP", locale)}</>}
                          </div>
                        ))}
                      </div>
                    ))}
                  </li>
                ))}
              </ul>
            </Card>
          ))
        )}
      </Container>
    </>
  );
}
