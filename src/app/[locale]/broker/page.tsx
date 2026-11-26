import Link from "next/link";
import { notFound } from "next/navigation";
import { isLocale } from "@/i18n/config";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { STAGES } from "@/lib/deal-machine";
import { date, daysUntil, money, num, toNum, tr } from "@/lib/format";
import {
  CITY,
  COMMISSION_STATUS,
  COUNTRY,
  DEAL_STAGE,
  DEAL_STATUS,
  DOC_STATUS,
  DOC_TYPE,
  LISTING_STATUS,
  SERVICE_STATUS,
  SERVICE_TYPE,
  label,
  toneOf,
} from "@/lib/labels";
import { Badge, Card, Container, Empty, FileLink, PageHeader, Stat, Table, Tabs, btn, field } from "@/components/ui";
import { kycDecision, moveListing, sendDocsToLawyer, updateServiceRequest } from "./actions";

type Props = { params: Promise<{ locale: string }>; searchParams: Promise<{ tab?: string; status?: string }> };

export default async function BrokerPage({ params, searchParams }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const sp = await searchParams;
  const L = tr(locale);
  const me = await requireUser(locale, `/${locale}/broker`, ["ADMIN", "BROKER", "AGENT"]);
  const tab = ["queue", "deals", "services", "commissions"].includes(sp.tab ?? "") ? sp.tab! : "queue";
  const isAgent = me.role === "AGENT";
  const mine = isAgent ? { agentId: me.id } : {};

  const [reviewListings, verifiedListings, kycPending, newServices, activeDeals, counts] = await Promise.all([
    db.listing.count({ where: { status: "IN_REVIEW" } }),
    db.listing.count({ where: { status: "VERIFIED" } }),
    db.kycProfile.count({ where: { status: "PENDING" } }),
    db.serviceRequest.count({ where: { status: "NEW" } }),
    db.deal.count({ where: { status: "ACTIVE", ...mine } }),
    db.deal.groupBy({ by: ["stage"], where: { status: { in: ["ACTIVE", "ON_HOLD"] }, ...mine }, _count: true }),
  ]);

  const base = `/${locale}/broker`;
  return (
    <>
      <PageHeader
        title={isAgent ? L("لوحة المندوب", "Field agent dashboard") : L("لوحة الوسيط", "Broker dashboard")}
        subtitle={L("طابور التوثيق، الصفقات حسب المرحلة، وطلبات الخدمات.", "Verification queue, deals by stage and service requests.")}
      />
      <Container className="flex flex-col gap-6">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <Stat label={L("عروض للمراجعة", "Listings to review")} value={num(reviewListings, locale)} href={`${base}?tab=queue`} />
          <Stat label={L("موثّقة ومستنية النشر", "Verified, to publish")} value={num(verifiedListings, locale)} href={`${base}?tab=queue`} />
          <Stat label={L("هويات للتوثيق", "IDs to verify")} value={num(kycPending, locale)} href={`${base}?tab=queue#kyc`} />
          <Stat label={L("طلبات خدمة جديدة", "New service requests")} value={num(newServices, locale)} href={`${base}?tab=services`} />
          <Stat label={L("صفقات شغالة", "Active deals")} value={num(activeDeals, locale)} href={`${base}?tab=deals`} />
        </div>

        <Tabs
          current={tab}
          tabs={[
            { key: "queue", label: L("طابور التوثيق", "Verification queue"), href: `${base}?tab=queue`, count: reviewListings + verifiedListings + kycPending },
            { key: "deals", label: L("الصفقات", "Deals"), href: `${base}?tab=deals` },
            { key: "services", label: L("طلبات الخدمات", "Service requests"), href: `${base}?tab=services`, count: newServices },
            { key: "commissions", label: L("العمولات", "Commissions"), href: `${base}?tab=commissions` },
          ]}
        />

        {tab === "queue" && <Queue locale={locale} canAct={!isAgent} />}
        {tab === "deals" && <Deals locale={locale} counts={counts} status={sp.status} agentId={isAgent ? me.id : undefined} />}
        {tab === "services" && <Services locale={locale} />}
        {tab === "commissions" && <Commissions locale={locale} />}
      </Container>
    </>
  );
}

async function Queue({ locale, canAct }: { locale: "ar" | "en"; canAct: boolean }) {
  const L = tr(locale);
  const [listings, kyc] = await Promise.all([
    db.listing.findMany({
      where: { status: { in: ["IN_REVIEW", "VERIFIED"] } },
      include: { plot: true, seller: true, documents: { where: { status: { not: "SUPERSEDED" } } } },
      orderBy: { createdAt: "asc" },
    }),
    db.kycProfile.findMany({ where: { status: "PENDING" }, include: { user: true }, orderBy: { createdAt: "asc" } }),
  ]);
  return (
    <>
      <Card title={L("العروض", "Listings")}>
        {listings.length === 0 ? (
          <Empty>{L("الطابور فاضي.", "The queue is empty.")}</Empty>
        ) : (
          <Table head={[L("القطعة", "Plot"), L("البائع", "Seller"), L("المستندات", "Documents"), L("الحالة", "Status"), L("الإجراء", "Action")]}>
            {listings.map((l) => {
              const allocApproved = l.documents.some((d) => d.type === "ALLOCATION_LETTER" && d.status === "APPROVED");
              const uploaded = l.documents.some((d) => d.status === "UPLOADED");
              return (
                <tr key={l.id}>
                  <td>
                    <Link href={`/${locale}/listings/${l.id}`} className="font-semibold text-brand">
                      {label(CITY, l.plot.city, locale)} — {l.plot.district}
                    </Link>
                    <div className="text-xs text-muted" dir="ltr">
                      {l.plot.code} · {num(l.plot.areaSqm, locale)} m²
                    </div>
                  </td>
                  <td>
                    {l.seller.name}
                    <div className="text-xs text-muted">{date(l.createdAt, locale)}</div>
                  </td>
                  <td>
                    <ul className="flex flex-col gap-1">
                      {l.documents.map((d) => (
                        <li key={d.id} className="flex flex-wrap items-center gap-1.5">
                          <FileLink id={d.id}>{label(DOC_TYPE, d.type, locale)}</FileLink>
                          <Badge tone={toneOf(d.status)}>{label(DOC_STATUS, d.status, locale)}</Badge>
                        </li>
                      ))}
                    </ul>
                  </td>
                  <td>
                    <Badge tone={toneOf(l.status)}>{label(LISTING_STATUS, l.status, locale)}</Badge>
                  </td>
                  <td>
                    {canAct && (
                      <div className="flex flex-col items-start gap-1">
                        {uploaded && (
                          <form action={sendDocsToLawyer.bind(null, locale, l.id)}>
                            <button className={`${btn.small} border border-brand text-brand`}>{L("ابعت للمحامي", "Send to lawyer")}</button>
                          </form>
                        )}
                        {l.status === "IN_REVIEW" && (
                          <form action={moveListing.bind(null, locale, l.id, "VERIFIED")}>
                            <button disabled={!allocApproved} title={allocApproved ? "" : L("مستني اعتماد المحامي لخطاب التخصيص", "Waiting for lawyer approval of the allocation letter")} className={`${btn.small} bg-ok text-white disabled:opacity-40`}>
                              {L("وثّق العرض", "Verify")}
                            </button>
                          </form>
                        )}
                        {l.status === "VERIFIED" && (
                          <form action={moveListing.bind(null, locale, l.id, "PUBLISHED")}>
                            <button className={`${btn.small} bg-brand text-white`}>{L("انشر", "Publish")}</button>
                          </form>
                        )}
                        <form action={moveListing.bind(null, locale, l.id, "DRAFT")}>
                          <button className={`${btn.small} text-[#A32020]`}>{L("رجّعه للبائع", "Return to seller")}</button>
                        </form>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </Table>
        )}
      </Card>

      <Card title={<span id="kyc">{L("توثيق الهويات", "ID verification")}</span>}>
        {kyc.length === 0 ? (
          <Empty>{L("مفيش هويات مستنية.", "No IDs waiting.")}</Empty>
        ) : (
          <Table head={[L("العميل", "Client"), L("الملفات", "Files"), L("القرار", "Decision")]}>
            {kyc.map((k) => (
              <tr key={k.id}>
                <td>
                  <div className="font-semibold">{k.user.name}</div>
                  <div className="text-xs text-muted">
                    <span dir="ltr">{k.user.phone}</span> · {label(COUNTRY, k.user.countryOfResidence, locale)}
                  </div>
                </td>
                <td className="flex flex-col gap-1">
                  {k.idDocumentId && <FileLink id={k.idDocumentId}>{k.idType === "PASSPORT" ? L("الباسبور", "Passport") : L("البطاقة", "National ID")}</FileLink>}
                  {k.selfieDocumentId && <FileLink id={k.selfieDocumentId}>{L("الصورة الشخصية", "Selfie")}</FileLink>}
                </td>
                <td>
                  {canAct && (
                    <form action={kycDecision.bind(null, locale, k.id)} className="flex flex-wrap items-center gap-1.5">
                      <button name="decision" value="APPROVED" className={`${btn.small} bg-ok text-white`}>
                        {L("قبول", "Approve")}
                      </button>
                      <input name="reason" placeholder={L("سبب الرفض", "Reason if rejecting")} className={`${field} min-h-9 w-40`} />
                      <button name="decision" value="REJECTED" className={`${btn.small} border border-[#A32020] text-[#A32020]`}>
                        {L("رفض", "Reject")}
                      </button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </>
  );
}

async function Deals({
  locale,
  counts,
  status,
  agentId,
}: {
  locale: "ar" | "en";
  counts: { stage: string; _count: number }[];
  status?: string;
  agentId?: string;
}) {
  const L = tr(locale);
  const statuses = ["ACTIVE", "ON_HOLD", "COMPLETED", "CANCELLED"];
  const st = statuses.includes(status ?? "") ? status! : "ACTIVE";
  const deals = await db.deal.findMany({
    where: { status: st as never, ...(agentId ? { agentId } : {}) },
    include: { listing: { include: { plot: true } }, buyer: true, broker: true },
    orderBy: { stageChangedAt: "asc" },
  });
  return (
    <>
      <nav className="flex flex-wrap gap-2">
        {statuses.map((s) => (
          <Link
            key={s}
            href={`/${locale}/broker?tab=deals&status=${s}`}
            aria-current={s === st ? "page" : undefined}
            className={`inline-flex min-h-10 items-center border px-3 text-sm font-semibold ${s === st ? "border-navy bg-navy text-white" : "border-line"}`}
          >
            {label(DEAL_STATUS, s, locale)}
          </Link>
        ))}
      </nav>
      <div className="grid gap-3 overflow-x-auto pb-2 md:grid-cols-4 xl:grid-cols-7">
        {STAGES.map((stage) => {
          const items = deals.filter((d) => d.stage === stage);
          return (
            <section key={stage} className="flex min-w-52 flex-col gap-2 bg-paper p-2">
              <h3 className="flex items-center justify-between px-1 text-sm font-bold">
                {label(DEAL_STAGE, stage, locale)}
                <span className="bg-white px-1.5 text-xs text-muted">{num(st === "ACTIVE" ? (counts.find((c) => c.stage === stage)?._count ?? 0) : items.length, locale)}</span>
              </h3>
              {items.map((d) => {
                const waited = -(daysUntil(d.stageChangedAt) ?? 0);
                return (
                  <Link key={d.id} href={`/${locale}/deals/${d.id}`} className="flex flex-col gap-1 border border-line bg-white p-2.5 text-sm hover:border-brand">
                    <span className="font-semibold">
                      {label(CITY, d.listing.plot.city, locale)} · #{d.id.slice(-6).toUpperCase()}
                    </span>
                    <span className="text-muted">{d.buyer.name}</span>
                    <span className={`text-xs ${waited > 14 ? "font-semibold text-[#A32020]" : "text-muted"}`}>
                      {L(`في المرحلة من ${num(waited, locale)} يوم`, `${waited} days in stage`)}
                    </span>
                  </Link>
                );
              })}
            </section>
          );
        })}
      </div>
    </>
  );
}

async function Services({ locale }: { locale: "ar" | "en" }) {
  const L = tr(locale);
  const [rows, team] = await Promise.all([
    db.serviceRequest.findMany({ include: { assignedTo: true, documents: true }, orderBy: [{ status: "asc" }, { createdAt: "desc" }] }),
    db.user.findMany({ where: { role: { in: ["BROKER", "AGENT", "LAWYER"] } }, orderBy: { name: "asc" } }),
  ]);
  return rows.length === 0 ? (
    <Empty>{L("مفيش طلبات.", "No requests.")}</Empty>
  ) : (
    <Table head={[L("صاحب الطلب", "Requester"), L("الخدمة", "Service"), L("القطعة", "Plot"), L("المرفقات", "Files"), L("الحالة والمسؤول", "Status and owner")]}>
      {rows.map((r) => (
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
            {r.documents.length === 0
              ? "—"
              : r.documents.map((d) => (
                  <div key={d.id}>
                    <FileLink id={d.id}>{label(DOC_TYPE, d.type, locale)}</FileLink>
                  </div>
                ))}
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
              <select name="assignedToId" defaultValue={r.assignedToId ?? ""} className={`${field} min-h-9 w-36`} aria-label={L("المسؤول", "Owner")}>
                <option value="">{L("مش متسند", "Unassigned")}</option>
                {team.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
              <button className={`${btn.small} border border-brand text-brand`}>{L("حفظ", "Save")}</button>
            </form>
          </td>
        </tr>
      ))}
    </Table>
  );
}

async function Commissions({ locale }: { locale: "ar" | "en" }) {
  const L = tr(locale);
  const rows = await db.commission.findMany({
    include: { deal: { include: { listing: { include: { plot: true } } } } },
    orderBy: { createdAt: "desc" },
  });
  const sum = (s: string) => rows.filter((r) => r.status === s).reduce((a, r) => a + toNum(r.sellerAmount) + toNum(r.buyerAmount), 0);
  return (
    <>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {(["PENDING", "INVOICED", "PAID", "WAIVED"] as const).map((s) => (
          <Stat key={s} label={label(COMMISSION_STATUS, s, locale)} value={money(sum(s), "EGP", locale)} hint={L(`${num(rows.filter((r) => r.status === s).length, locale)} صفقة`, `${rows.filter((r) => r.status === s).length} deals`)} />
        ))}
      </div>
      <Table head={[L("الصفقة", "Deal"), L("المرحلة", "Stage"), L("من البائع", "Seller"), L("من المشتري", "Buyer"), L("الحالة", "Status")]}>
        {rows.map((r) => (
          <tr key={r.id}>
            <td>
              <Link href={`/${locale}/deals/${r.dealId}`} className="font-semibold text-brand">
                #{r.dealId.slice(-6).toUpperCase()} · {label(CITY, r.deal.listing.plot.city, locale)}
              </Link>
            </td>
            <td>{label(DEAL_STAGE, r.deal.stage, locale)}</td>
            <td>
              {money(r.sellerAmount, r.currency, locale)} <span className="text-xs text-muted">({num(r.sellerRatePct, locale, 2)}%)</span>
            </td>
            <td>
              {money(r.buyerAmount, r.currency, locale)} <span className="text-xs text-muted">({num(r.buyerRatePct, locale, 2)}%)</span>
            </td>
            <td>
              <Badge tone={toneOf(r.status)}>{label(COMMISSION_STATUS, r.status, locale)}</Badge>
            </td>
          </tr>
        ))}
      </Table>
    </>
  );
}
