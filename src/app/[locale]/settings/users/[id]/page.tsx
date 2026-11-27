import Link from "next/link";
import { notFound } from "next/navigation";
import { isLocale } from "@/i18n/config";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { can, subject } from "@/lib/authz";
import { date, dateTime, money, num, tr } from "@/lib/format";
import { ACCOUNT_LEVEL, CITY, DEAL_STAGE, LISTING_STATUS, ROLE, label } from "@/lib/labels";
import { dealRef } from "@/lib/action-otp-core";
import { Badge, Card, Container, DL, Notice, PageHeader, btn, field, labelCls } from "@/components/ui";
import { REASON_AR } from "@/lib/export-core";
import { requestExport } from "../../../exports/actions";
import { toggleClientEnabled } from "../../actions";
import { pageMeta } from "@/lib/meta";

type Props = { params: Promise<{ locale: string; id: string }>; searchParams: Promise<{ ok?: string; err?: string }> };

export const generateMetadata = ({ params }: { params: Promise<{ locale: string }> }) => pageMeta(params, "ملف المستخدم", "User profile", { noindex: true });

/** REL-02 — صفحة المستخدم: البيع والشراء في قسمين (البائع/المشتري علاقة مش دور) + ADM-EXP-02 تنزيل ملفه */
export default async function UserPage({ params, searchParams }: Props) {
  const { locale, id } = await params;
  if (!isLocale(locale)) notFound();
  const sp = await searchParams;
  const L = tr(locale);
  const ar = locale === "ar";
  const me = await requireUser(locale, `/${locale}/settings/users/${id}`, ["ADMIN"]);
  const u = await db.user.findUnique({ where: { id } });
  if (!u) notFound();
  const [listings, sells, buys, requests, exportsLog] = await Promise.all([
    db.listing.findMany({ where: { sellerId: id }, include: { plot: true }, orderBy: { createdAt: "desc" } }),
    db.deal.findMany({ where: { listing: { sellerId: id } }, orderBy: { createdAt: "desc" } }),
    db.deal.findMany({ where: { buyerId: id }, orderBy: { createdAt: "desc" } }),
    db.buyRequest.findMany({ where: { buyerId: id }, orderBy: { createdAt: "desc" } }),
    db.exportJob.findMany({ where: { kind: "USER", subjectId: id }, orderBy: { createdAt: "desc" }, take: 10, include: { requestedBy: { select: { name: true } } } }),
  ]);
  const canExport = can(subject(me), "export.user", {}).allowed;
  const dealRow = (d: (typeof sells)[number]) => (
    <li key={d.id} className="flex flex-wrap justify-between gap-2 py-2">
      <Link href={`/${locale}/deals/${d.id}`} className="font-semibold text-brand underline" dir="ltr">
        {dealRef(d.id)}
      </Link>
      <span>
        {label(DEAL_STAGE, d.stage, locale)} · {d.status} {d.agreedPrice ? `· ${money(d.agreedPrice, "EGP", locale)}` : ""}
      </span>
    </li>
  );
  return (
    <>
      <PageHeader crumbs={[{ href: `/${locale}/settings?tab=users`, label: L("المستخدمين", "Users") }]} title={u!.name} subtitle={`${label(ROLE, u!.role, locale)} · ${label(ACCOUNT_LEVEL, u!.accountLevel, locale)}`} />
      <Container className="flex flex-col gap-6">
        <Card title={L("البيانات", "Details")}>
          <DL
            items={[
              [L("الموبايل", "Mobile"), <span key="p" dir="ltr">{u!.phone}</span>],
              [L("الإيميل", "Email"), u!.email ?? "—"],
              [L("اتسجل", "Joined"), date(u!.createdAt, locale)],
              ...(u!.role !== "CLIENT"
                ? ([
                    [
                      L("يتعامل كعميل", "Acts as a client"),
                      <form key="ce" action={toggleClientEnabled.bind(null, locale, u!.id)} className="flex items-center gap-2">
                        <Badge tone={u!.clientEnabled ? "green" : "gray"}>{u!.clientEnabled ? L("مفعّل", "On") : L("مقفول", "Off")}</Badge>
                        <button className={`${btn.small} border border-line`}>{u!.clientEnabled ? L("اقفل", "Turn off") : L("فعّل", "Turn on")}</button>
                        <span className="text-[13px] text-muted">{L("ما بيتسندش لأي صفقة هو طرف فيها.", "Never assigned to a deal they're party to.")}</span>
                      </form>,
                    ],
                  ] as [string, React.ReactNode][])
                : []),
              [L("النشاط", "Activity"), L(`${num(listings.length, locale)} عرض · ${num(sells.length, locale)} صفقة بيع · ${num(buys.length, locale)} صفقة شراء · ${num(requests.length, locale)} طلب شراء`, `${listings.length} listings · ${sells.length} sell deals · ${buys.length} buy deals · ${requests.length} buy requests`)],
            ]}
          />
        </Card>
        <div className="grid gap-6 lg:grid-cols-2">
          <Card title={L("بيع", "Selling")}>
            <h3 className="font-bold">{L("العروض", "Listings")}</h3>
            <ul className="flex flex-col divide-y divide-line text-sm">
              {listings.map((l) => (
                <li key={l.id} className="flex flex-wrap justify-between gap-2 py-2">
                  <Link href={`/${locale}/listings/${l.id}`} className="text-brand underline">
                    {label(CITY, l.plot.city, locale)} — {l.plot.code}
                  </Link>
                  <Badge tone="gray">{label(LISTING_STATUS, l.status, locale)}</Badge>
                </li>
              ))}
              {!listings.length && <li className="py-2 text-muted">—</li>}
            </ul>
            <h3 className="font-bold">{L("صفقاته كبائع", "Deals as seller")}</h3>
            <ul className="flex flex-col divide-y divide-line text-sm">{sells.length ? sells.map(dealRow) : <li className="py-2 text-muted">—</li>}</ul>
          </Card>
          <Card title={L("شراء", "Buying")}>
            <h3 className="font-bold">{L("صفقاته كمشتري", "Deals as buyer")}</h3>
            <ul className="flex flex-col divide-y divide-line text-sm">{buys.length ? buys.map(dealRow) : <li className="py-2 text-muted">—</li>}</ul>
            <h3 className="font-bold">{L("طلبات الشراء", "Buy requests")}</h3>
            <ul className="flex flex-col divide-y divide-line text-sm">
              {requests.map((r) => (
                <li key={r.id} className="py-2">
                  {r.cities.map((c) => label(CITY, c, locale)).join("، ")} · {r.status}
                </li>
              ))}
              {!requests.length && <li className="py-2 text-muted">—</li>}
            </ul>
          </Card>
        </div>
        {canExport && (
          <Card title={<span id="export">{L("تنزيل بيانات المستخدم", "Download the user file")}</span>}>
            {sp.ok === "export" && <Notice tone="green">{L("التصدير شغال في الخلفية — هيوصلك تنبيه بالرابط وتنبيه منفصل بكلمة السر.", "The export runs in the background — you'll get the link and, separately, the password.")}</Notice>}
            {sp.err === "export_reason" && <Notice tone="red">{L("اختار سبب التصدير (ولو «أخرى» اكتب الشرح).", "Choose an export reason (and explain if “Other”).")}</Notice>}
            <form action={requestExport.bind(null, locale, "USER", id)} className="flex flex-col gap-2">
              <label className={labelCls}>
                {L("سبب التصدير", "Export reason")}
                <select name="reason" required className={field}>
                  {Object.entries(REASON_AR).map(([k, v]) => (
                    <option key={k} value={k}>
                      {ar ? v : k}
                    </option>
                  ))}
                </select>
              </label>
              <input name="reasonNote" aria-label={L("شرح (لو أخرى)", "Details (if other)")} placeholder={L("شرح (لو أخرى)", "Details (if other)")} className={field} />
              <span className="text-[13px] text-muted">{L("فيه الملف الشخصي والتوثيق والمستندات والحسابات البنكية كاملة والعروض والصفقات والموافقات وسجل النشاط — ZIP مشفّر + manifest بالبصمات.", "Includes profile, KYC, documents, full bank accounts, listings, deals, consents and activity log — encrypted ZIP + manifest with hashes.")}</span>
              <button className={`${btn.secondary} self-start`}>{L("صدّر ملف المستخدم", "Export the user file")}</button>
            </form>
            <ul className="flex flex-col divide-y divide-line text-sm">
              {exportsLog.map((x) => (
                <li key={x.id} className="flex flex-wrap justify-between gap-2 py-2">
                  <span>
                    {x.requestedBy.name} — {REASON_AR[x.reason] ?? x.reason} — {x.status}
                  </span>
                  <span className="text-[13px] text-muted">{dateTime(x.createdAt, locale)}</span>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </Container>
    </>
  );
}
