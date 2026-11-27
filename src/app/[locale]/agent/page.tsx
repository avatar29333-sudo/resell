import Link from "next/link";
import { notFound } from "next/navigation";
import { isLocale } from "@/i18n/config";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { can, dealCtx, subject } from "@/lib/authz";
import { scopeDealsFor, scopeServiceRequestsFor } from "@/lib/authz/scope";
import { errorText } from "@/lib/errors";
import { date, dateTime, num, tr } from "@/lib/format";
import { districtName } from "@/lib/district";
import { CITY, DEAL_STAGE, SERVICE_STATUS, SERVICE_TYPE, label, toneOf } from "@/lib/labels";
import { Badge, Card, Container, Empty, FileLink, Notice, PageHeader, Stat, btn, field } from "@/components/ui";
import { updateServiceRequest } from "../broker/actions";
import { submitSiteReport, updateAuthorityStatus } from "./actions";
import { pageMeta } from "@/lib/meta";
import { SiteReportForm } from "./SiteReportForm";

type Props = { params: Promise<{ locale: string }>; searchParams: Promise<{ from?: string; err?: string; ok?: string }> };

const AUTH_STATUS: Record<string, [string, string]> = {
  SUBMITTED: ["اتقدّم للجهاز", "Submitted"],
  NEEDS_INFO: ["مطلوب استيفاء", "More papers needed"],
  APPROVED: ["اتوافق", "Approved"],
  REJECTED: ["اترفض", "Refused"],
};
const AGENT_ERRORS: Record<string, [string, string]> = {
  photo_none: ["اختار صورة واحدة على الأقل.", "Choose at least one photo."],
  photo_type: ["الصور لازم تكون JPG أو PNG أو WebP.", "Photos must be JPG, PNG or WebP."],
  photo_size: ["صورة أكبر من 4 ميجا.", "A photo is larger than 4 MB."],
  estimate: ["نسبة التنفيذ رقم صحيح من 0 لـ 100.", "Construction must be a whole number from 0 to 100."],
  authority_status: ["اختار حالة الملف.", "Choose the file status."],
  authority_file: ["«اتقدّم» محتاج إيصال التقديم، و«اتوافق» محتاج خطاب الموافقة.", "“Submitted” needs the filing receipt and “Approved” needs the approval letter."],
  authority_note: ["اكتب الملاحظة (10 حروف على الأقل): إيه المطلوب أو سبب الرفض.", "Write a note (10+ characters): what's needed or why it was refused."],
  file_type: ["الملف لازم يكون PDF أو صورة (JPG/PNG/WebP).", "The file must be a PDF or image (JPG/PNG/WebP)."],
  file_size: ["الملف أكبر من 4 ميجا.", "The file is larger than 4 MB."],
};

/** صفحة المندوب (SEC-04 + OPS-02): المعاينات والصفقات المسندة ليه بس */
export const generateMetadata = ({ params }: { params: Promise<{ locale: string }> }) => pageMeta(params, "لوحة المندوب", "Field agent dashboard", { noindex: true });

export default async function AgentPage({ params, searchParams }: Props) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();
  const locale = raw;
  const sp = await searchParams;
  const L = tr(locale);
  const ar = locale === "ar";
  const me = await requireUser(locale, `/${locale}/agent`, ["AGENT", "ADMIN"]);
  const isAdmin = me.role === "ADMIN";

  const [services, deals] = await Promise.all([
    db.serviceRequest.findMany({
      where: isAdmin ? { assignedTo: { role: "AGENT" } } : scopeServiceRequestsFor(me),
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      include: { assignedTo: true, documents: { where: { type: "SITE_PHOTO" }, orderBy: { createdAt: "desc" } } },
    }),
    db.deal.findMany({
      where: { AND: [isAdmin ? { agentId: { not: null } } : scopeDealsFor(me), { status: { in: ["ACTIVE", "ON_HOLD"] } }] },
      include: { listing: { include: { plot: true } }, agent: true, contracts: { select: { type: true, status: true } }, documents: { select: { id: true, type: true, status: true, createdAt: true } } },
      orderBy: { stageChangedAt: "asc" },
    }),
  ]);
  const open = services.filter((s) => s.status !== "DELIVERED" && s.status !== "CANCELLED");

  return (
    <>
      <PageHeader title={L("لوحة المندوب", "Field agent dashboard")} subtitle={L("المعاينات والصفقات المسندة ليك بس.", "Only the inspections and deals assigned to you.")} />
      <Container className="flex flex-col gap-6">
        {sp.from === "broker" && <Notice tone="amber">{L("لوحة الوسيط مش متاحة لحساب المندوب — دي صفحتك.", "The broker dashboard isn't available to field agents — this is your page.")}</Notice>}
        {sp.err && <Notice tone="red">{errorText(sp.err, ar, AGENT_ERRORS)}</Notice>}
        {sp.ok === "report" && <Notice tone="green">{L("تقرير المعاينة اتبعت.", "The site report was sent.")}</Notice>}
        {sp.ok === "authority" && <Notice tone="green">{L("حالة ملف الجهاز اتحدّثت ووصلت للوسيط.", "The authority file status was updated and sent to the broker.")}</Notice>}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <Stat label={L("معاينات مفتوحة", "Open inspections")} value={num(open.length, locale)} />
          <Stat label={L("صفقات في الجهاز", "Deals at the authority")} value={num(deals.filter((d) => d.stage === "TRANSFER_FILED").length, locale)} />
          <Stat label={L("كل الصفقات المسندة", "All assigned deals")} value={num(deals.length, locale)} />
        </div>

        <Card title={L("المعاينات وطلبات الخدمة", "Inspections and service requests")}>
          {services.length === 0 ? (
            <Empty>{L("مفيش طلبات مسندة ليك.", "No requests assigned to you.")}</Empty>
          ) : (
            <ul className="flex flex-col gap-4">
              {services.map((r) => {
                const report = can(subject(me), "service.site_report", { serviceRequest: { requesterId: r.requesterId, assignedToId: r.assignedToId } });
                return (
                  <li key={r.id} id={`sr-${r.id}`} className="flex flex-col gap-2 border border-line p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <div className="font-semibold">
                          {label(SERVICE_TYPE, r.type, locale)} — {r.contactName}
                        </div>
                        <div className="text-sm text-muted">
                          <a href={`tel:${r.contactPhone}`} dir="ltr" className="text-brand">
                            {r.contactPhone}
                          </a>{" "}
                          · {r.city ? label(CITY, r.city, locale) : "—"} {r.district && `· ${r.district}`} {r.plotCode && <span dir="ltr">· {r.plotCode}</span>}
                        </div>
                        {r.message && <div className="text-sm text-muted">{r.message}</div>}
                        {isAdmin && <div className="text-[13px] text-muted">{r.assignedTo?.name}</div>}
                      </div>
                      <form action={updateServiceRequest.bind(null, locale, r.id)} className="flex flex-wrap items-center gap-1.5">
                        <Badge tone={toneOf(r.status)}>{label(SERVICE_STATUS, r.status, locale)}</Badge>
                        <select name="status" defaultValue={r.status} className={`${field} min-h-11 w-32`} aria-label={L("الحالة", "Status")}>
                          {Object.keys(SERVICE_STATUS).map((s) => (
                            <option key={s} value={s}>
                              {label(SERVICE_STATUS, s, locale)}
                            </option>
                          ))}
                        </select>
                        <button className={`${btn.small} border border-brand text-brand`}>{L("حفظ", "Save")}</button>
                      </form>
                    </div>
                    {r.documents.length > 0 && (
                      <div className="flex flex-wrap gap-2 text-sm">
                        {r.documents.map((d, i) => (
                          <span key={d.id} className="flex items-center gap-1">
                            <FileLink id={d.id}>{L(`صورة ${num(i + 1, locale)}`, `Photo ${i + 1}`)}</FileLink>
                            {d.geoLat !== null && d.geoLng !== null && (
                              <a href={`https://www.openstreetmap.org/?mlat=${d.geoLat}&mlon=${d.geoLng}#map=18/${d.geoLat}/${d.geoLng}`} target="_blank" rel="noopener" className="text-[13px] text-muted underline" dir="ltr">
                                📍 {d.geoLat.toFixed(5)}, {d.geoLng.toFixed(5)}
                              </a>
                            )}
                            {d.takenAt && <span className="text-[13px] text-muted">{dateTime(d.takenAt, locale)}</span>}
                          </span>
                        ))}
                        {r.constructionEstimate !== null && <Badge tone="blue">{L(`تقدير التنفيذ ${num(r.constructionEstimate, locale)}%`, `Construction est. ${r.constructionEstimate}%`)}</Badge>}
                      </div>
                    )}
                    {report.allowed && r.status !== "CANCELLED" && <SiteReportForm action={submitSiteReport.bind(null, locale, r.id)} ar={ar} adminReason={report.override} />}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card title={L("الصفقات المسندة ليك", "Deals assigned to you")}>
          {deals.length === 0 ? (
            <Empty>{L("مفيش صفقات في مرحلة الجهاز مسندة ليك.", "No deals at the authority stage are assigned to you.")}</Empty>
          ) : (
            <ul className="flex flex-col gap-4">
              {deals.map((d) => {
                const upd = can(subject(me), "deal.authority_update", { deal: dealCtx(d) });
                return (
                  <li key={d.id} id={`deal-${d.id}`} className="flex flex-col gap-2 border border-line p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Link href={`/${locale}/deals/${d.id}`} className="font-semibold text-brand">
                        #{d.id.slice(-6).toUpperCase()} · {label(CITY, d.listing.plot.city, locale)} — {districtName(d.listing.plot, locale)}
                      </Link>
                      <span className="flex flex-wrap items-center gap-1.5">
                        <Badge tone="blue">{label(DEAL_STAGE, d.stage, locale)}</Badge>
                        {d.authorityStatus && (
                          <Badge tone={d.authorityStatus === "APPROVED" ? "green" : d.authorityStatus === "REJECTED" ? "red" : "amber"}>
                            {L("الجهاز:", "Authority:")} {AUTH_STATUS[d.authorityStatus]?.[ar ? 0 : 1] ?? d.authorityStatus}
                          </Badge>
                        )}
                        <span className="text-[13px] text-muted">{date(d.authorityUpdatedAt ?? d.stageChangedAt, locale)}</span>
                      </span>
                    </div>
                    {isAdmin && <div className="text-[13px] text-muted">{d.agent?.name}</div>}
                    {upd.allowed && (
                      <form action={updateAuthorityStatus.bind(null, locale, d.id)} className="flex flex-wrap items-end gap-2 border-t border-line pt-2">
                        <label className="flex flex-col gap-1 text-sm font-medium">
                          {L("حالة الملف في الجهاز", "File status at the authority")}
                          <select name="status" required defaultValue="" className={`${field} min-h-11 w-48`}>
                            <option value="" disabled>
                              {L("اختار…", "Choose…")}
                            </option>
                            {Object.entries(AUTH_STATUS).map(([k, v]) => (
                              <option key={k} value={k}>
                                {v[ar ? 0 : 1]}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="flex flex-col gap-1 text-sm font-medium">
                          {L("الإيصال / الخطاب", "Receipt / letter")}
                          <input name="file" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" capture="environment" className="border border-dashed border-line p-2 text-sm" />
                        </label>
                        <label className="flex min-w-56 flex-1 flex-col gap-1 text-sm font-medium">
                          {L("ملاحظة (إجبارية للاستيفاء والرفض)", "Note (required for more-papers or refusal)")}
                          <input name="note" className={`${field} min-h-11`} />
                        </label>
                        {upd.override && <input aria-label={L("سبب تدخّل الأدمن", "Admin override reason")} name="overrideReason" required minLength={5} placeholder={L("سبب تدخّل الأدمن", "Admin override reason")} className={`${field} min-h-11 w-48`} />}
                        <button className={`${btn.small} min-h-11 bg-brand text-white`}>{L("حدّث", "Update")}</button>
                      </form>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </Container>
    </>
  );
}
