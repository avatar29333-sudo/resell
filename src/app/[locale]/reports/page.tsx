import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { isLocale } from "@/i18n/config";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { can, subject } from "@/lib/authz";
import { scopeDealsFor } from "@/lib/authz/scope";
import { STAGES } from "@/lib/deal-machine";
import { money, num, toNum, tr } from "@/lib/format";
import { CITY, CITY_KEYS, DEAL_STAGE, LISTING_STATUS, SERVICE_STATUS, label } from "@/lib/labels";
import { Card, Container, PageHeader, Stat, Table } from "@/components/ui";

function Bars({ rows, locale }: { rows: { label: string; value: number }[]; locale: "ar" | "en" }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="flex flex-col gap-2">
      {rows.map((r) => (
        <li key={r.label} className="grid grid-cols-[9rem_minmax(0,1fr)_3rem] items-center gap-2 text-sm">
          <span className="truncate">{r.label}</span>
          <span className="h-4 bg-paper">
            <span className="block h-4 bg-brand" style={{ width: `${(r.value / max) * 100}%` }} />
          </span>
          <span className="text-end font-semibold">{num(r.value, locale)}</span>
        </li>
      ))}
    </ul>
  );
}

export default async function ReportsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const L = tr(locale);
  const me = await requireUser(locale, `/${locale}/reports`, ["ADMIN", "FINANCE", "BROKER", "BROKER_LEAD", "LAWYER"]);
  if (!can(subject(me), "reports.view").allowed) redirect(`/${locale}/account?denied=1`);
  // PERM-02: الوسيط/المحامي بيشوف أرقام صفقاته هو
  const dealScope = scopeDealsFor(me);

  const [listingsBy, dealsBy, servicesBy, closed, commissions, deposits, expiring] = await Promise.all([
    db.listing.groupBy({ by: ["status"], _count: true }),
    db.deal.groupBy({ by: ["stage"], where: { AND: [dealScope, { status: { in: ["ACTIVE", "ON_HOLD"] } }] }, _count: true }),
    db.serviceRequest.groupBy({ by: ["status"], _count: true }),
    db.deal.findMany({ where: { AND: [dealScope, { status: "COMPLETED" }] }, include: { listing: { include: { plot: true } } } }),
    db.commission.findMany({ where: { deal: dealScope } }),
    db.deposit.groupBy({ by: ["escrowStatus"], where: { deal: dealScope }, _sum: { amount: true }, _count: true }),
    db.document.count({ where: { expiresAt: { lte: new Date(Date.now() + 30 * 86400000), gte: new Date() }, status: "APPROVED" } }),
  ]);

  const closedValue = closed.reduce((s, d) => s + toNum(d.agreedPrice), 0);
  const paid = commissions.filter((c) => c.status === "PAID").reduce((s, c) => s + toNum(c.sellerAmount) + toNum(c.buyerAmount), 0);
  const due = commissions.filter((c) => ["PENDING", "INVOICED"].includes(c.status)).reduce((s, c) => s + toNum(c.sellerAmount) + toNum(c.buyerAmount), 0);
  const held = deposits.find((d) => d.escrowStatus === "HELD");

  return (
    <>
      <PageHeader title={L("التقارير", "Reports")} subtitle={L("صورة سريعة للمنصة للاجتماع الأسبوعي.", "A quick snapshot for the weekly meeting.")} />
      <Container className="flex flex-col gap-6">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <Stat label={L("صفقات اتقفلت", "Deals closed")} value={num(closed.length, locale)} hint={money(closedValue, "EGP", locale)} />
          <Stat label={L("عمولات اتحصّلت", "Commission collected")} value={money(paid, "EGP", locale)} />
          <Stat label={L("عمولات مستحقة", "Commission due")} value={money(due, "EGP", locale)} />
          <Stat label={L("عرابين في البنك", "Deposits held")} value={money(held?._sum.amount ?? 0, "EGP", locale)} hint={L(`${num(held?._count ?? 0, locale)} عربون`, `${held?._count ?? 0} deposits`)} />
          <Stat label={L("مستندات هتنتهي خلال 30 يوم", "Docs expiring in 30 days")} value={num(expiring, locale)} />
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <Card title={L("الصفقات المفتوحة حسب المرحلة", "Open deals by stage")}>
            <Bars locale={locale} rows={STAGES.slice(0, 6).map((s) => ({ label: label(DEAL_STAGE, s, locale), value: dealsBy.find((d) => d.stage === s)?._count ?? 0 }))} />
          </Card>
          <Card title={L("العروض حسب الحالة", "Listings by status")}>
            <Bars locale={locale} rows={Object.keys(LISTING_STATUS).map((s) => ({ label: label(LISTING_STATUS, s, locale), value: listingsBy.find((d) => d.status === s)?._count ?? 0 }))} />
          </Card>
          <Card title={L("طلبات الخدمات", "Service requests")}>
            <Bars locale={locale} rows={Object.keys(SERVICE_STATUS).map((s) => ({ label: label(SERVICE_STATUS, s, locale), value: servicesBy.find((d) => d.status === s)?._count ?? 0 }))} />
          </Card>
        </div>

        <Card title={L("الصفقات المقفولة حسب المدينة", "Closed deals by city")}>
          <Table head={[L("المدينة", "City"), L("عدد", "Count"), L("القيمة", "Value"), L("متوسط المتر", "Avg / m²")]}>
            {CITY_KEYS.map((c) => {
              const rows = closed.filter((d) => d.listing.plot.city === c);
              const value = rows.reduce((s, d) => s + toNum(d.agreedPrice), 0);
              const area = rows.reduce((s, d) => s + toNum(d.listing.plot.areaSqm), 0);
              return (
                <tr key={c}>
                  <td className="font-semibold">{label(CITY, c, locale)}</td>
                  <td>{num(rows.length, locale)}</td>
                  <td>{money(value, "EGP", locale)}</td>
                  <td>{area ? money(value / area, "EGP", locale) : "—"}</td>
                </tr>
              );
            })}
          </Table>
          <Link href={`/${locale}/price-index`} className="text-brand">
            {L("مؤشر الأسعار الكامل ←", "Full price index →")}
          </Link>
        </Card>
      </Container>
    </>
  );
}
