import { getSetting } from "@/lib/settings";
import Link from "next/link";
import { notFound } from "next/navigation";
import { isLocale } from "@/i18n/config";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { date, money, num, toNum, tr } from "@/lib/format";
import { pageMeta } from "@/lib/meta";
import { districtName } from "@/lib/district";
import { CITY, DEAL_STAGE, DEAL_STATUS, LISTING_STATUS, label, toneOf } from "@/lib/labels";
import { Badge, Card, Container, Empty, PageHeader, Stat, Table, btn } from "@/components/ui";

export const generateMetadata = ({ params }: { params: Promise<{ locale: string }> }) => pageMeta(params, "بوابة الشريك", "Partner portal", { noindex: true });

/**
 * MKT-07: بوابة السمسار الشريك — عروضه (اللي عرضها)، صفقاتها بالمرحلة، ونصيبه من العمولة.
 * بيانات المشترين محمية بنفس قواعد البائع: الاسم بيظهر بعد اتفاق العمولة بس.
 */
export default async function PartnerPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();
  const locale = raw;
  const L = tr(locale);
  const me = await requireUser(locale, `/${locale}/partner`, ["PARTNER_BROKER", "ADMIN"]);
  const where = me.role === "ADMIN" ? { submittedBy: { role: "PARTNER_BROKER" as const } } : { submittedById: me.id };
  const listings = await db.listing.findMany({
    where,
    include: {
      plot: true,
      submittedBy: { select: { name: true, partnerSharePct: true } },
      deals: {
        include: { buyer: { select: { name: true } }, contracts: { select: { type: true, status: true } }, commission: true },
        orderBy: { createdAt: "desc" },
      },
    },
    orderBy: { createdAt: "desc" },
  });
  // PUB-03: نسبة الشريك من إعداداته، وإلا الافتراضي من إعدادات الأدمن (مش 0٪)
  const defaultShare = (await getSetting("partner.defaultSharePct")).value;
  const sharePct = me.role === "PARTNER_BROKER" ? (me.partnerSharePct != null ? toNum(me.partnerSharePct) : defaultShare) : null;
  const closed = listings.flatMap((l) => l.deals.filter((d) => d.status === "COMPLETED").map((d) => ({ d, pct: l.submittedBy?.partnerSharePct != null ? toNum(l.submittedBy.partnerSharePct) : defaultShare })));
  const shareOf = (d: (typeof closed)[number]["d"], pct: number) => (d.commission ? ((toNum(d.commission.sellerAmount) + toNum(d.commission.buyerAmount)) * pct) / 100 : 0);
  const earned = closed.reduce((s, x) => s + shareOf(x.d, x.pct), 0);

  return (
    <>
      <PageHeader title={L("بوابة الشريك", "Partner portal")} subtitle={L("القطع اللي عرضتها لعملائك، وصفقاتها، ونصيبك من العمولة.", "The plots you listed for your clients, their deals and your commission share.")} />
      <Container className="flex flex-col gap-6">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label={L("عروضك", "Your listings")} value={num(listings.length, locale)} />
          <Stat label={L("صفقات شغالة", "Active deals")} value={num(listings.reduce((s, l) => s + l.deals.filter((d) => d.status === "ACTIVE").length, 0), locale)} />
          <Stat label={L("صفقات اتقفلت", "Closed deals")} value={num(closed.length, locale)} />
          <Stat label={L("نصيبك من العمولة", "Your commission share")} value={money(earned, "EGP", locale)} hint={sharePct !== null ? L(`نسبتك ${num(sharePct, locale)}%`, `Your rate ${sharePct}%`) : undefined} />
        </div>
        <Link href={`/${locale}/list-your-plot`} className={`${btn.primary} self-start`}>
          {L("اعرض قطعة لعميل", "List a client's plot")}
        </Link>
        <Card title={L("العروض والصفقات", "Listings and deals")}>
          {listings.length === 0 ? (
            <Empty>{L("لسه ما عرضتش قطع.", "You haven't listed any plots yet.")}</Empty>
          ) : (
            <Table head={[L("القطعة", "Plot"), L("الحالة", "Status"), L("الصفقات", "Deals"), L("نصيبك", "Your share")]}>
              {listings.map((l) => (
                <tr key={l.id}>
                  <td>
                    <Link href={`/${locale}/listings/${l.id}`} className="font-semibold text-brand">
                      {label(CITY, l.plot.city, locale)} — {districtName(l.plot, locale)}
                    </Link>
                    <div className="text-xs text-muted">
                      {num(l.plot.areaSqm, locale)} {L("م²", "m²")} · {date(l.createdAt, locale)}
                      {me.role === "ADMIN" && ` · ${l.submittedBy?.name ?? ""}`}
                    </div>
                  </td>
                  <td>
                    <Badge tone={toneOf(l.status)}>{label(LISTING_STATUS, l.status, locale)}</Badge>
                  </td>
                  <td>
                    {l.deals.length === 0
                      ? "—"
                      : l.deals.map((d) => {
                          const agreed = d.contracts.some((c) => c.type === "COMMISSION_AGREEMENT" && (c.status === "SIGNED" || c.status === "VERIFIED"));
                          return (
                            <div key={d.id} className="text-sm">
                              <Link href={`/${locale}/deals/${d.id}`} className="text-brand">
                                #{d.id.slice(-6).toUpperCase()}
                              </Link>{" "}
                              · {label(DEAL_STAGE, d.stage, locale)} · {label(DEAL_STATUS, d.status, locale)}
                              <span className="text-muted"> · {agreed ? d.buyer.name : L("المشتري بيظهر بعد اتفاق العمولة", "Buyer shown after the commission agreement")}</span>
                            </div>
                          );
                        })}
                  </td>
                  <td>{money(l.deals.filter((d) => d.status === "COMPLETED").reduce((s, d) => s + shareOf(d, l.submittedBy?.partnerSharePct != null ? toNum(l.submittedBy.partnerSharePct) : defaultShare), 0), "EGP", locale)}</td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      </Container>
    </>
  );
}
