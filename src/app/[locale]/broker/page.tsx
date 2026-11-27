import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { User } from "@prisma/client";
import { isLocale } from "@/i18n/config";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { STAGES } from "@/lib/deal-machine";
import { can, listingCtx, subject } from "@/lib/authz";
import { scopeDealsFor, scopeKycQueueFor, scopePrivateListingsFor, scopeServiceRequestsFor } from "@/lib/authz/scope";
import { errorText } from "@/lib/errors";
import { getSetting } from "@/lib/settings";
import { date, daysUntil, money, num, toNum, tr } from "@/lib/format";
import { districtName } from "@/lib/district";
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
import { Badge, Card, Container, Empty, FileLink, Notice, PageHeader, Stat, Table, Tabs, btn, field } from "@/components/ui";
import { AdminReason } from "@/components/AdminReason";
import { pageMeta } from "@/lib/meta";
import { convertValuation } from "./actions";
import { siteUrl } from "@/lib/meta";
import { approveBuyRequest, assignListingBroker, claimListing, kycDecision, moveListing, sendDocsToLawyer, updateServiceRequest } from "./actions";

type Props = { params: Promise<{ locale: string }>; searchParams: Promise<{ tab?: string; status?: string; err?: string; converted?: string; scope?: string }> };

export const generateMetadata = ({ params }: { params: Promise<{ locale: string }> }) => pageMeta(params, "لوحة الوسيط", "Broker dashboard", { noindex: true });

export default async function BrokerPage({ params, searchParams }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const sp = await searchParams;
  const L = tr(locale);
  const me = await requireUser(locale, `/${locale}/broker`, ["ADMIN", "BROKER", "BROKER_LEAD", "AGENT"]);
  // SEC-04: المندوب ليه صفحته الخاصة، ما يشوفش طابور التوثيق ولا الهويات
  if (me.role === "AGENT") redirect(`/${locale}/agent?from=broker`);
  const tab = ["queue", "deals", "services", "commissions"].includes(sp.tab ?? "") ? sp.tab! : "queue";

  const listingScope = scopePrivateListingsFor(me);
  const dealScope = scopeDealsFor(me);
  const [reviewListings, verifiedListings, kycPending, newServices, activeDeals, counts] = await Promise.all([
    db.listing.count({ where: { AND: [listingScope, { status: "IN_REVIEW" }] } }),
    db.listing.count({ where: { AND: [listingScope, { status: "VERIFIED" }] } }),
    db.kycProfile.count({ where: scopeKycQueueFor(me) }),
    db.serviceRequest.count({ where: { AND: [scopeServiceRequestsFor(me), { status: "NEW" }] } }),
    db.deal.count({ where: { AND: [dealScope, { status: "ACTIVE" }] } }),
    db.deal.groupBy({ by: ["stage"], where: { AND: [dealScope, { status: { in: ["ACTIVE", "ON_HOLD"] } }] }, _count: true }),
  ]);

  const base = `/${locale}/broker`;
  return (
    <>
      <PageHeader
        title={me.role === "BROKER_LEAD" ? L("لوحة مسؤول الوسطاء", "Broker lead dashboard") : L("لوحة الوسيط", "Broker dashboard")}
        subtitle={L("العروض المسندة ليك، طابور التوثيق، الصفقات حسب المرحلة، وطلبات الخدمات.", "Listings assigned to you, the verification queue, deals by stage and service requests.")}
      />
      <Container className="flex flex-col gap-6">
        {sp.err && <Notice tone="red">{errorText(sp.err, locale === "ar")}</Notice>}
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

        {tab === "queue" && <Queue locale={locale} me={me} scope={sp.scope} />}
        {tab === "deals" && <Deals locale={locale} me={me} counts={counts} status={sp.status} />}
        {tab === "services" && <Services locale={locale} me={me} converted={sp.converted} />}
        {tab === "commissions" && <Commissions locale={locale} me={me} />}
      </Container>
    </>
  );
}

async function Queue({ locale, me, scope: scopeRaw }: { locale: "ar" | "en"; me: User; scope?: string }) {
  const L = tr(locale);
  const ar = locale === "ar";
  const isAdmin = me.role === "ADMIN";
  const canAssign = can(subject(me), "listing.assign", {}).allowed;
  // PUB-02: «مسند لي» افتراضياً + «غير مسند» (يقدر يستلمه)؛ «الكل» للقائد والأدمن
  const seesAll = me.role === "BROKER_LEAD" || isAdmin;
  const scope = scopeRaw === "unassigned" || (scopeRaw === "all" && seesAll) ? scopeRaw : "mine";
  const scopeWhere = scope === "unassigned" ? { assignedBrokerId: null } : scope === "all" ? {} : { assignedBrokerId: me.id };
  const pendingBuys = await db.buyRequest.findMany({ where: { approvedAt: null, status: "ACTIVE" }, include: { buyer: { select: { name: true } } }, orderBy: { createdAt: "asc" }, take: 30 });
  const [listings, kyc, brokers] = await Promise.all([
    db.listing.findMany({
      where: { AND: [scope === "unassigned" ? {} : scopePrivateListingsFor(me), scopeWhere, { status: { in: ["IN_REVIEW", "VERIFIED"] } }] },
      include: { plot: true, seller: true, assignedBroker: true, documents: { where: { status: { not: "SUPERSEDED" } } }, deals: { select: { stage: true, status: true } } },
      orderBy: { createdAt: "asc" },
    }),
    db.kycProfile.findMany({ where: scopeKycQueueFor(me), include: { user: true }, orderBy: { createdAt: "asc" } }),
    canAssign ? db.user.findMany({ where: { role: { in: ["BROKER", "BROKER_LEAD"] }, status: "ACTIVE" }, orderBy: { name: "asc" } }) : Promise.resolve([]),
  ]);
  return (
    <>
      {pendingBuys.length > 0 && (
        <Card title={L("طلبات شراء مستنية المراجعة (عملاء أساسيين)", "Buy requests awaiting review (basic clients)")}>
          <ul className="flex flex-col divide-y divide-line text-sm">
            {pendingBuys.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>
                  {b.buyer.name} — {b.cities.map((c) => label(CITY, c, locale)).join("، ")}
                  {b.budgetMax ? ` — ${num(b.budgetMax, locale)} ${L("ج.م", "EGP")}` : ""}
                </span>
                <form action={approveBuyRequest.bind(null, locale, b.id)}>
                  <button className={`${btn.small} bg-ok text-white`}>{L("اعتمد الطلب", "Approve")}</button>
                </form>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <Card title={L("العروض", "Listings")}>
        <nav aria-label={L("فلتر الطابور", "Queue filter")} className="flex flex-wrap gap-2">
          {(
            [
              ["mine", L("مسند لي", "Assigned to me")],
              ["unassigned", L("غير مسند", "Unassigned")],
              ...(seesAll ? ([["all", L("الكل", "All")]] as const) : []),
            ] as const
          ).map(([k, t]) => (
            <Link key={k} href={`/${locale}/broker?tab=queue&scope=${k}`} aria-current={scope === k ? "page" : undefined} className={`inline-flex min-h-11 items-center border px-3 text-sm font-semibold ${scope === k ? "border-navy bg-navy text-white" : "border-line"}`}>
              {t}
            </Link>
          ))}
        </nav>
        {listings.length === 0 ? (
          <Empty>{L("مفيش عروض مسندة ليك في الطابور.", "No listings assigned to you in the queue.")}</Empty>
        ) : (
          <Table head={[L("القطعة", "Plot"), L("البائع", "Seller"), L("المستندات", "Documents"), L("الحالة", "Status"), L("الإجراء", "Action")]}>
            {listings.map((l) => {
              const ctx = { listing: listingCtx(l) };
              const p = (a: "listing.send_to_lawyer" | "listing.verify" | "listing.publish" | "listing.pause") => can(subject(me), a, ctx);
              const send = p("listing.send_to_lawyer");
              const verify = p("listing.verify");
              const publish = p("listing.publish");
              const pause = p("listing.pause");
              const uploaded = l.documents.some((d) => d.status === "UPLOADED");
              return (
                <tr key={l.id}>
                  <td>
                    {!l.assignedBroker && (me.role === "BROKER" || me.role === "BROKER_LEAD") && (
                      <form action={claimListing.bind(null, locale, l.id)} className="mb-1">
                        <button className={`${btn.small} border border-brand text-brand`}>{L("استلمه", "Claim")}</button>
                      </form>
                    )}
                    <Link href={`/${locale}/listings/${l.id}`} className="font-semibold text-brand">
                      {label(CITY, l.plot.city, locale)} — {districtName(l.plot, locale)}
                    </Link>
                    <div className="text-[13px] text-muted" dir="ltr">
                      {l.plot.code}
                    </div>
                    <div className="text-[13px] text-muted">
                      {num(l.plot.areaSqm, locale)} {L("م²", "m²")}
                    </div>
                    <div className="text-[13px] text-muted">
                      {L("الوسيط:", "Broker:")} {l.assignedBroker?.name ?? L("مش متسند", "Unassigned")}
                    </div>
                  </td>
                  <td>
                    {l.seller.name}
                    <div className="text-[13px] text-muted">{date(l.createdAt, locale)}</div>
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
                    <div className="flex flex-col items-start gap-1">
                      {uploaded && send.allowed && (
                        <form action={sendDocsToLawyer.bind(null, locale, l.id)} className="flex flex-wrap gap-1">
                          <AdminReason show={send.override} ar={ar} />
                          <button className={`${btn.small} border border-brand text-brand`}>{L("ابعت للمحامي", "Send to lawyer")}</button>
                        </form>
                      )}
                      {l.status === "IN_REVIEW" && (
                        <form action={moveListing.bind(null, locale, l.id, "VERIFIED")} className="flex flex-wrap gap-1">
                          <AdminReason show={verify.override} ar={ar} />
                          <button
                            disabled={!verify.allowed}
                            title={verify.allowed ? "" : L("مستني اعتماد المحامي لخطاب التخصيص وإيصال السداد وإفادة الجهاز", "Waiting for lawyer approval of the allocation letter, payment receipt and authority statement")}
                            className={`${btn.small} bg-ok text-white disabled:opacity-40`}
                          >
                            {L("وثّق العرض", "Verify")}
                          </button>
                        </form>
                      )}
                      {l.status === "VERIFIED" && publish.allowed && (
                        <form action={moveListing.bind(null, locale, l.id, "PUBLISHED")} className="flex flex-wrap gap-1">
                          <AdminReason show={publish.override} ar={ar} />
                          <button className={`${btn.small} bg-brand text-white`}>{L("انشر", "Publish")}</button>
                        </form>
                      )}
                      {pause.allowed && (
                        <form action={moveListing.bind(null, locale, l.id, "DRAFT")} className="flex flex-wrap gap-1">
                          <AdminReason show={pause.override} ar={ar} />
                          <button className={`${btn.small} text-[#A32020]`}>{L("رجّعه للبائع", "Return to seller")}</button>
                        </form>
                      )}
                      {canAssign && (
                        <form action={assignListingBroker.bind(null, locale, l.id)} className="flex flex-wrap items-center gap-1">
                          <select name="brokerId" defaultValue={l.assignedBrokerId ?? ""} className={`${field} min-h-11 w-36`} aria-label={L("وسيط العرض", "Listing broker")}>
                            <option value="">{L("مش متسند", "Unassigned")}</option>
                            {brokers.map((b) => (
                              <option key={b.id} value={b.id}>
                                {b.name}
                              </option>
                            ))}
                          </select>
                          <button className={`${btn.small} border border-line`}>{L("إسناد", "Assign")}</button>
                        </form>
                      )}
                    </div>
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
            {kyc.map((k) => {
              const adminOnly = k.user.kycRejections >= 3 && !isAdmin;
              return (
                <tr key={k.id}>
                  <td>
                    <div className="font-semibold">{k.user.name}</div>
                    <div className="text-[13px] text-muted">
                      <span dir="ltr">{k.user.phone}</span> · {label(COUNTRY, k.user.countryOfResidence, locale)}
                    </div>
                    {k.user.kycRejections > 0 && (
                      <div className="text-[13px] text-[#A32020]">{L(`اترفض قبل كده ${num(k.user.kycRejections, locale)} مرة`, `Rejected ${k.user.kycRejections} time(s) before`)}</div>
                    )}
                  </td>
                  <td className="flex flex-col gap-1">
                    {k.idDocumentId && <FileLink id={k.idDocumentId}>{k.idType === "PASSPORT" ? L("الباسبور", "Passport") : L("البطاقة", "National ID")}</FileLink>}
                    {k.selfieDocumentId && <FileLink id={k.selfieDocumentId}>{L("الصورة الشخصية", "Selfie")}</FileLink>}
                  </td>
                  <td>
                    {adminOnly ? (
                      <span className="text-[13px] text-muted">{L("محتاج قرار الأدمن (3 رفضات)", "Needs an admin decision (3 rejections)")}</span>
                    ) : (
                      <form action={kycDecision.bind(null, locale, k.id)} className="flex flex-wrap items-center gap-1.5">
                        <button name="decision" value="APPROVED" className={`${btn.small} bg-ok text-white`}>
                          {L("قبول", "Approve")}
                        </button>
                        <input aria-label={L("سبب الرفض (10 حروف على الأقل)", "Rejection reason (10+ chars)")} name="reason" minLength={10} placeholder={L("سبب الرفض (10 حروف على الأقل)", "Rejection reason (10+ chars)")} className={`${field} min-h-11 w-48`} />
                        <button name="decision" value="REJECTED" className={`${btn.small} border border-[#A32020] text-[#A32020]`}>
                          {L("رفض", "Reject")}
                        </button>
                      </form>
                    )}
                  </td>
                </tr>
              );
            })}
          </Table>
        )}
      </Card>
    </>
  );
}

async function Deals({ locale, me, counts, status }: { locale: "ar" | "en"; me: User; counts: { stage: string; _count: number }[]; status?: string }) {
  const L = tr(locale);
  const statuses = ["ACTIVE", "ON_HOLD", "COMPLETED", "CANCELLED"];
  const st = statuses.includes(status ?? "") ? status! : "ACTIVE";
  const deals = await db.deal.findMany({
    where: { AND: [scopeDealsFor(me, { brokersCanReadAll: me.role === "BROKER" && (await getSetting("deals.unassignedBrokers")).access === "read" }), { status: st as never }] },
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
            className={`inline-flex min-h-11 items-center border px-3 text-sm font-semibold ${s === st ? "border-navy bg-navy text-white" : "border-line"}`}
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
                <span className="bg-white px-1.5 text-[13px] text-muted">{num(st === "ACTIVE" ? (counts.find((c) => c.stage === stage)?._count ?? 0) : items.length, locale)}</span>
              </h3>
              {items.map((d) => {
                const waited = -(daysUntil(d.stageChangedAt) ?? 0);
                return (
                  <Link key={d.id} href={`/${locale}/deals/${d.id}`} className="flex flex-col gap-1 border border-line bg-white p-2.5 text-sm hover:border-brand">
                    <span className="font-semibold">
                      {label(CITY, d.listing.plot.city, locale)} · #{d.id.slice(-6).toUpperCase()}
                    </span>
                    <span className="text-muted">{d.buyer.name}</span>
                    {me.role !== "BROKER" && d.broker && <span className="text-[13px] text-muted">{d.broker.name}</span>}
                    <span className={`text-[13px] ${waited > 14 ? "font-semibold text-[#A32020]" : "text-muted"}`}>
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

async function Services({ locale, me, converted }: { locale: "ar" | "en"; me: User; converted?: string }) {
  const L = tr(locale);
  const ar = locale === "ar";
  const canAssign = can(subject(me), "service.assign", { serviceRequest: { requesterId: "", assignedToId: null } });
  const [rows, team] = await Promise.all([
    db.serviceRequest.findMany({ where: scopeServiceRequestsFor(me), include: { assignedTo: true, documents: true }, orderBy: [{ status: "asc" }, { createdAt: "desc" }] }),
    db.user.findMany({ where: { role: { in: ["BROKER", "AGENT", "LAWYER"] }, status: "ACTIVE" }, orderBy: { name: "asc" } }),
  ]);
  return rows.length === 0 ? (
    <Empty>{L("مفيش طلبات.", "No requests.")}</Empty>
  ) : (
    <Table head={[L("صاحب الطلب", "Requester"), L("الخدمة", "Service"), L("القطعة", "Plot"), L("المرفقات", "Files"), L("الحالة والمسؤول", "Status and owner")]}>
      {rows.map((r) => (
        <tr key={r.id}>
          <td>
            <div className="font-semibold">{r.contactName}</div>
            <div className="text-[13px] text-muted" dir="ltr">
              {r.contactPhone}
            </div>
            <div className="text-[13px] text-muted">{date(r.createdAt, locale)}</div>
          </td>
          <td>
            {label(SERVICE_TYPE, r.type, locale)}
            {/* MKT-03: تقييم → عرض مسودة بضغطة */}
            {r.type === "VALUATION" && (
              <form action={convertValuation.bind(null, locale, r.id)} className="mt-1">
                <button className={`${btn.small} border border-brand text-brand`}>{L("حوّله لعرض مسودة", "Turn into a draft listing")}</button>
              </form>
            )}
            {converted === r.id && (
              <div className="mt-1 text-[13px]">
                {r.requesterId ? L("وصل لصاحب الطلب إشعار بالرابط.", "The requester was notified with the link.") : L("ابعت الرابط ده لصاحب الطلب على واتساب:", "Send this link to the requester on WhatsApp:")}
                <div dir="ltr" className="select-all font-mono">{`${siteUrl()}/${locale}/list-your-plot?from=${r.id}`}</div>
              </div>
            )}
          </td>
          <td>
            {r.city ? label(CITY, r.city, locale) : "—"} {r.district && `· ${r.district}`}
            {r.plotCode && (
              <div className="text-[13px] text-muted" dir="ltr">
                {r.plotCode}
              </div>
            )}
            {r.message && <div className="text-[13px] text-muted">{r.message}</div>}
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
              <select name="status" defaultValue={r.status} className={`${field} min-h-11 w-32`} aria-label={L("الحالة", "Status")}>
                {Object.keys(SERVICE_STATUS).map((s) => (
                  <option key={s} value={s}>
                    {label(SERVICE_STATUS, s, locale)}
                  </option>
                ))}
              </select>
              {canAssign.allowed ? (
                <select name="assignedToId" defaultValue={r.assignedToId ?? ""} className={`${field} min-h-11 w-36`} aria-label={L("المسؤول", "Owner")}>
                  <option value="">{L("مش متسند", "Unassigned")}</option>
                  {team.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="text-[13px] text-muted">{r.assignedTo?.name ?? L("مش متسند", "Unassigned")}</span>
              )}
              <AdminReason show={canAssign.override} ar={ar} />
              <button className={`${btn.small} border border-brand text-brand`}>{L("حفظ", "Save")}</button>
            </form>
          </td>
        </tr>
      ))}
    </Table>
  );
}

async function Commissions({ locale, me }: { locale: "ar" | "en"; me: User }) {
  const L = tr(locale);
  const rows = await db.commission.findMany({
    where: { deal: scopeDealsFor(me) },
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
              {money(r.sellerAmount, r.currency, locale)} <span className="text-[13px] text-muted">({num(r.sellerRatePct, locale, 2)}%)</span>
            </td>
            <td>
              {money(r.buyerAmount, r.currency, locale)} <span className="text-[13px] text-muted">({num(r.buyerRatePct, locale, 2)}%)</span>
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
