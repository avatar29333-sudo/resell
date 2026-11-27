import Link from "next/link";
import { notFound } from "next/navigation";
import { isLocale } from "@/i18n/config";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { scopeDealsFor, scopeServiceRequestsFor } from "@/lib/authz/scope";
import { errorText } from "@/lib/errors";
import { date, num, tr } from "@/lib/format";
import { districtName } from "@/lib/district";
import { CITY, DEAL_STAGE, SERVICE_STATUS, SERVICE_TYPE, label, toneOf } from "@/lib/labels";
import { Badge, Card, Container, Empty, Notice, PageHeader, Stat, Table, btn, field } from "@/components/ui";
import { updateServiceRequest } from "../broker/actions";

type Props = { params: Promise<{ locale: string }>; searchParams: Promise<{ from?: string; err?: string }> };

/** صفحة المندوب (SEC-04 + OPS-02): المعاينات والصفقات المسندة ليه بس */
export default async function AgentPage({ params, searchParams }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const sp = await searchParams;
  const L = tr(locale);
  const me = await requireUser(locale, `/${locale}/agent`, ["AGENT", "ADMIN"]);

  const [services, deals] = await Promise.all([
    db.serviceRequest.findMany({ where: me.role === "ADMIN" ? { assignedTo: { role: "AGENT" } } : scopeServiceRequestsFor(me), orderBy: [{ status: "asc" }, { createdAt: "desc" }], include: { assignedTo: true } }),
    db.deal.findMany({
      where: { AND: [me.role === "ADMIN" ? { agentId: { not: null } } : scopeDealsFor(me), { status: { in: ["ACTIVE", "ON_HOLD"] } }] },
      include: { listing: { include: { plot: true } }, agent: true },
      orderBy: { stageChangedAt: "asc" },
    }),
  ]);
  const open = services.filter((s) => s.status !== "DELIVERED" && s.status !== "CANCELLED");

  return (
    <>
      <PageHeader title={L("لوحة المندوب", "Field agent dashboard")} subtitle={L("المعاينات والصفقات المسندة ليك بس.", "Only the inspections and deals assigned to you.")} />
      <Container className="flex flex-col gap-6">
        {sp.from === "broker" && <Notice tone="amber">{L("لوحة الوسيط مش متاحة لحساب المندوب — دي صفحتك.", "The broker dashboard isn't available to field agents — this is your page.")}</Notice>}
        {sp.err && <Notice tone="red">{errorText(sp.err, locale === "ar")}</Notice>}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <Stat label={L("معاينات مفتوحة", "Open inspections")} value={num(open.length, locale)} />
          <Stat label={L("صفقات في الجهاز", "Deals at the authority")} value={num(deals.filter((d) => d.stage === "TRANSFER_FILED").length, locale)} />
          <Stat label={L("كل الصفقات المسندة", "All assigned deals")} value={num(deals.length, locale)} />
        </div>

        <Card title={L("المعاينات وطلبات الخدمة", "Inspections and service requests")}>
          {services.length === 0 ? (
            <Empty>{L("مفيش طلبات مسندة ليك.", "No requests assigned to you.")}</Empty>
          ) : (
            <Table head={[L("صاحب الطلب", "Requester"), L("الخدمة", "Service"), L("المكان", "Location"), L("الحالة", "Status")]}>
              {services.map((r) => (
                <tr key={r.id}>
                  <td>
                    <div className="font-semibold">{r.contactName}</div>
                    <div className="text-xs text-muted" dir="ltr">
                      {r.contactPhone}
                    </div>
                    <div className="text-xs text-muted">{date(r.createdAt, locale)}</div>
                  </td>
                  <td>{label(SERVICE_TYPE, r.type, locale)}</td>
                  <td>
                    {r.city ? label(CITY, r.city, locale) : "—"} {r.district && `· ${r.district}`}
                    {r.plotCode && (
                      <div className="text-xs text-muted" dir="ltr">
                        {r.plotCode}
                      </div>
                    )}
                    {r.message && <div className="text-xs text-muted">{r.message}</div>}
                  </td>
                  <td>
                    <form action={updateServiceRequest.bind(null, locale, r.id)} className="flex flex-wrap items-center gap-1.5">
                      <Badge tone={toneOf(r.status)}>{label(SERVICE_STATUS, r.status, locale)}</Badge>
                      <select name="status" defaultValue={r.status} className={`${field} min-h-9 w-32`} aria-label={L("الحالة", "Status")}>
                        {Object.keys(SERVICE_STATUS).map((s) => (
                          <option key={s} value={s}>
                            {label(SERVICE_STATUS, s, locale)}
                          </option>
                        ))}
                      </select>
                      <button className={`${btn.small} border border-brand text-brand`}>{L("حفظ", "Save")}</button>
                    </form>
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </Card>

        <Card title={L("الصفقات المسندة ليك", "Deals assigned to you")}>
          {deals.length === 0 ? (
            <Empty>{L("مفيش صفقات في مرحلة الجهاز مسندة ليك.", "No deals at the authority stage are assigned to you.")}</Empty>
          ) : (
            <Table head={[L("الصفقة", "Deal"), L("المرحلة", "Stage"), L("من", "Since")]}>
              {deals.map((d) => (
                <tr key={d.id}>
                  <td>
                    <Link href={`/${locale}/deals/${d.id}`} className="font-semibold text-brand">
                      #{d.id.slice(-6).toUpperCase()} · {label(CITY, d.listing.plot.city, locale)} — {districtName(d.listing.plot, locale)}
                    </Link>
                    {me.role === "ADMIN" && <div className="text-xs text-muted">{d.agent?.name}</div>}
                  </td>
                  <td>
                    <Badge tone="blue">{label(DEAL_STAGE, d.stage, locale)}</Badge>
                  </td>
                  <td>{date(d.stageChangedAt, locale)}</td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      </Container>
    </>
  );
}
