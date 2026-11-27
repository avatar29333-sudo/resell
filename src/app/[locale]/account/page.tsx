import Link from "next/link";
import { notFound } from "next/navigation";
import { isLocale, type Locale } from "@/i18n/config";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { BLOCKER_TEXT, STAGES, blockersToAdvance, nextStage, requiredSigners, stageIndex, type Stage } from "@/lib/deal-machine";
import { date, money, num, toNum, tr } from "@/lib/format";
import { districtName } from "@/lib/district";
import {
  ACCOUNT_LEVEL,
  BUY_REQUEST_STATUS,
  CITY,
  CITY_KEYS,
  COUNTRY,
  DEAL_STAGE,
  DEAL_STATUS,
  DOC_TYPE,
  LISTING_STATUS,
  ROLE,
  SERVICE_STATUS,
  SERVICE_TYPE,
  VERIFICATION,
  label,
  toneOf,
} from "@/lib/labels";
import { Badge, Card, Container, DL, Empty, Notice, PageHeader, btn, field, labelCls } from "@/components/ui";
import { ClearDraft } from "../list-your-plot/ClearDraft";
import { MiniSteps } from "@/components/MiniSteps";
import { pageMeta, siteUrl } from "@/lib/meta";
import { ensureReferralCode } from "@/lib/referral";
import { getSetting } from "@/lib/settings";
import { ShareButtons } from "@/components/ShareButtons";
import { createBuyRequest, setBuyRequestStatus, setMyListingStatus, submitKyc, uploadNewVersion } from "./actions";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ kyc?: string; welcome?: string; listed?: string; rescue?: string; denied?: string; upload?: string }>;
};

// مراحل العرض من ناحية البائع
const LISTING_FLOW = ["DRAFT", "IN_REVIEW", "VERIFIED", "PUBLISHED", "IN_DEAL", "SOLD"] as const;

export const generateMetadata = ({ params }: { params: Promise<{ locale: string }> }) => pageMeta(params, "حسابي", "My account", { noindex: true });

export default async function AccountPage({ params, searchParams }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const sp = await searchParams;
  const L = tr(locale);
  const me = await requireUser(locale, `/${locale}/account`);
  // MKT-06: الإحالة (للعميل والشريك الموثّق)
  const refCode = ["CLIENT", "PARTNER_BROKER"].includes(me.role) ? await ensureReferralCode(me) : null;
  const [referralsCount, rewards, rewardCfg] = refCode
    ? await Promise.all([db.user.count({ where: { referredById: me.id } }), db.referralReward.findMany({ where: { referrerId: me.id } }), getSetting("referral.reward")])
    : [0, [], { type: "pct" as const, value: 0 }];

  const [kyc, listings, allDeals, buyRequests, services, soldDeals] = await Promise.all([
    db.kycProfile.findUnique({ where: { userId: me.id } }),
    db.listing.findMany({
      where: { sellerId: me.id },
      include: {
        plot: true,
        documents: {
          where: { status: { in: ["UPLOADED", "IN_REVIEW", "REJECTED"] }, type: { not: "SITE_PHOTO" } },
          select: { id: true, type: true, status: true, version: true, reviews: { orderBy: { createdAt: "desc" }, take: 1, select: { notes: true } } },
        },
        deals: { where: { status: { in: ["ACTIVE", "ON_HOLD", "COMPLETED"] } }, select: { id: true, stage: true, status: true }, orderBy: { stageChangedAt: "desc" } },
      },
      orderBy: { updatedAt: "desc" },
    }),
    db.deal.findMany({
      where: { buyerId: me.id },
      include: {
        listing: { include: { plot: true } },
        contracts: { select: { type: true, status: true, signatures: true } },
        deposits: { select: { escrowStatus: true } },
        documents: { select: { type: true, status: true } },
        events: { where: { type: "CANCELLED" }, orderBy: { createdAt: "desc" }, take: 1 },
      },
      orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
    }),
    db.buyRequest.findMany({ where: { buyerId: me.id }, orderBy: { createdAt: "desc" } }),
    db.serviceRequest.findMany({ where: { OR: [{ requesterId: me.id }, { contactPhone: me.phone }] }, orderBy: { createdAt: "desc" } }),
    // صفقات البائع اللي انتهت: اتقفلت (اتباعت) أو اتلغت بعد اتفاق السعر
    db.deal.findMany({
      where: {
        listing: { sellerId: me.id },
        OR: [{ status: "COMPLETED" }, { status: "CANCELLED", stage: { in: ["PRICE_AGREED", "PRELIMINARY_CONTRACT", "TRANSFER_FILED", "AUTHORITY_APPROVED"] } }],
      },
      include: {
        listing: { include: { plot: true } },
        buyer: true,
        deposits: { select: { escrowStatus: true, amount: true } },
        events: { where: { type: "CANCELLED" }, orderBy: { createdAt: "desc" }, take: 1 },
      },
      orderBy: { updatedAt: "desc" },
    }),
  ]);
  const deals = allDeals.filter((d) => d.status === "ACTIVE" || d.status === "ON_HOLD");
  const endedDeals = allDeals.filter((d) => d.status === "COMPLETED" || d.status === "CANCELLED");

  /** سبب انتهاء الصفقة بكلام واضح */
  const endReason = (d: { status: string; events: { data: unknown }[] }) => {
    if (d.status === "COMPLETED") return L("الصفقة اتقفلت والتنازل اتسجل في الجهاز", "The deal closed and the transfer was registered");
    const data = (d.events[0]?.data ?? {}) as { reason?: string; note?: string };
    if (data.reason === "sold_to_other") return L("القطعة اتباعت لمشتري تاني", "The plot was sold to another buyer");
    if (data.note) return data.note;
    return L("الصفقة اتلغت", "The deal was cancelled");
  };

  return (
    <>
      <PageHeader
        title={L(`أهلاً ${me.name.split(" ")[0]}`, `Welcome, ${me.name.split(" ")[0]}`)}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <Badge tone={me.accountLevel === "VERIFIED" ? "green" : "amber"}>{label(ACCOUNT_LEVEL, me.accountLevel, locale)}</Badge>
            {me.role !== "CLIENT" && <Badge tone="navy">{label(ROLE, me.role, locale)}</Badge>}
          </span>
        }
        actions={
          <>
            <Link href={`/${locale}/listings`} className="inline-flex min-h-11 items-center border border-[#8C9AC6] px-5 font-semibold text-white hover:bg-navy-soft">
              {L("دوّر على قطعة", "Find a plot")}
            </Link>
            <Link href={`/${locale}/list-your-plot`} className="inline-flex min-h-11 items-center bg-white px-5 font-semibold text-navy hover:bg-paper">
              {L("اعرض قطعة جديدة", "List a new plot")}
            </Link>
          </>
        }
      />
      <Container className="flex flex-col gap-6">
        {sp.welcome && <Notice tone="green">{L("حسابك اتعمل. وثّق هويتك عشان تقدر تبيع أو تشتري.", "Your account is ready. Verify your ID to buy or sell.")}</Notice>}
        {sp.listed && <ClearDraft />}
        {sp.listed && <Notice tone="green">{L("قطعتك وصلت وهي دلوقتي قيد المراجعة. هنبلغك على واتساب.", "Your plot was received and is now in review. We'll update you on WhatsApp.")}</Notice>}
        {sp.rescue && (
          <Notice tone="amber">
            {L("تاريخ مهلة البناء اللي كتبته عدّى — العرض اتقبل ومتعلّم «المهلة خلصت».", "The build deadline you entered has passed — the listing was accepted and marked “deadline passed”.")}{" "}
            <Link href={`/${locale}/rescue`} className="font-semibold text-brand underline">
              {L("اعرف إزاي تنقذ المهلة", "See how to rescue the deadline")}
            </Link>
          </Notice>
        )}
        {sp.denied && <Notice tone="amber">{L("الصفحة دي مش متاحة لحسابك.", "That page isn't available to your account.")}</Notice>}
        {sp.upload === "ok" && <Notice tone="green">{L("النسخة الجديدة اترفعت ووصلت للوسيط.", "The new version was uploaded and sent to the broker.")}</Notice>}
        {sp.upload === "bad" && <Notice tone="red">{L("الملف لازم يكون PDF أو صورة (JPG/PNG/WebP) وأقل من 4 ميجا.", "The file must be a PDF or image (JPG/PNG/WebP) under 4 MB.")}</Notice>}

        {/* ── المشتري: القطع اللي مهتم بيها ومرحلة كل صفقة ── */}
        <section className="flex flex-col gap-3">
          <h2 className="text-2xl font-bold">{L("القطع اللي مهتم بيها", "Plots you're interested in")}</h2>
          {deals.length === 0 ? (
            <Empty>
              {L("لسه ما أبديتش اهتمام بأي قطعة. ", "You haven't shown interest in any plot yet. ")}
              <Link href={`/${locale}/listings`} className="font-semibold text-brand">
                {L("تصفّح سجل العروض", "Browse the register")}
              </Link>
            </Empty>
          ) : (
            <ul className="grid gap-4 md:grid-cols-2">
              {deals.map((d) => {
                const stage = d.stage as Stage;
                const blockers = blockersToAdvance({
                  stage,
                  status: d.status,
                  hasBroker: !!d.brokerId,
                  hasAgent: !!d.agentId,
                  agreedPrice: d.agreedPrice ? toNum(d.agreedPrice) : null,
                  contracts: d.contracts,
                  deposits: d.deposits,
                  hasAuthorityApprovalDoc: d.documents.some((x) => x.type === "AUTHORITY_STATEMENT" && x.status !== "REJECTED"),
                });
                const toSign = d.contracts.filter(
                  (c) => c.status === "SENT_FOR_SIGNATURE" && requiredSigners(c.type).includes("BUYER") && !((c.signatures as { role: string }[]) ?? []).some((x) => x.role === "BUYER"),
                ).length;
                return (
                  <li key={d.id}>
                    <DealCard
                      locale={locale}
                      href={`/${locale}/deals/${d.id}`}
                      title={`${label(CITY, d.listing.plot.city, locale)} — ${districtName(d.listing.plot, locale)}`}
                      meta={`${num(d.listing.plot.areaSqm, locale)} ${L("م²", "m²")} · ${money(d.agreedPrice ?? d.listing.price, "EGP", locale)}${d.agreedPrice ? L(" (متفق)", " (agreed)") : ""}`}
                      status={d.status}
                      stage={stage}
                      todo={
                        toSign > 0
                          ? { tone: "blue", text: L(`مطلوب منك: توقيع ${num(toSign, locale)} عقد`, `Your action: sign ${toSign} contract(s)`) }
                          : d.status === "ACTIVE" && blockers.length && blockers[0] !== "last_stage"
                            ? { tone: "amber", text: L(`مستنيين: ${BLOCKER_TEXT[blockers[0]][0]}`, `Waiting for: ${BLOCKER_TEXT[blockers[0]][1]}`) }
                            : null
                      }
                    />
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {endedDeals.length > 0 && (
          <section className="flex flex-col gap-3">
            <h2 className="text-xl font-bold">{L("قطع كنت مهتم بيها وصفقتها انتهت", "Plots you were interested in — deal ended")}</h2>
            <ul className="flex flex-col divide-y divide-line border border-line bg-white">
              {endedDeals.map((d) => (
                <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div className="flex flex-col gap-0.5">
                    <Link href={`/${locale}/deals/${d.id}`} className="font-semibold text-navy hover:text-brand">
                      {label(CITY, d.listing.plot.city, locale)} — {districtName(d.listing.plot, locale)} · {num(d.listing.plot.areaSqm, locale)} {L("م²", "m²")}
                    </Link>
                    <span className={`text-sm ${d.status === "COMPLETED" ? "text-ok" : "text-[#A32020]"}`}>{endReason(d)}</span>
                    <span className="text-xs text-muted">
                      {L(`وقفت عند: ${label(DEAL_STAGE, d.stage, locale)}`, `Stopped at: ${label(DEAL_STAGE, d.stage, locale)}`)} · {date(d.updatedAt, locale)}
                      {d.deposits.some((x) => x.escrowStatus === "REFUNDED_TO_BUYER") && L(" · العربون اترد لك", " · your deposit was refunded")}
                    </span>
                  </div>
                  <Badge tone={toneOf(d.status)}>{d.status === "COMPLETED" ? L("اشتريتها", "Bought") : label(DEAL_STATUS, d.status, locale)}</Badge>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* ── البائع: قطعي ومرحلة كل عرض ── */}
        <section className="flex flex-col gap-3">
          <h2 className="text-2xl font-bold">{L("قطعي المعروضة", "My plots")}</h2>
          {listings.length === 0 ? (
            <Empty>
              {L("لسه ما عرضتش قطع. ", "You haven't listed a plot yet. ")}
              <Link href={`/${locale}/list-your-plot`} className="font-semibold text-brand">
                {L("اعرض قطعتك", "List your plot")}
              </Link>
            </Empty>
          ) : (
            <ul className="grid gap-4 md:grid-cols-2">
              {listings.map((l) => {
                const idx = LISTING_FLOW.indexOf(l.status as (typeof LISTING_FLOW)[number]);
                const activeDeal = l.deals.find((d) => d.status !== "COMPLETED" && stageIndex(d.stage) >= 2) ?? l.deals.find((d) => d.status === "COMPLETED");
                const interested = l.deals.filter((d) => d.status === "ACTIVE" && stageIndex(d.stage) < 2).length;
                const rejected = l.documents.filter((d) => d.status === "REJECTED").length;
                const withLawyer = l.documents.filter((d) => d.status === "IN_REVIEW").length;
                const next: Record<string, string> = {
                  DRAFT: L("ابعت العرض للمراجعة عشان المحامي يبدأ", "Submit for review so the lawyer can start"),
                  IN_REVIEW: rejected
                    ? L(`المحامي رفض ${num(rejected, locale)} مستند — ارفع نسخة جديدة`, `The lawyer rejected ${rejected} document(s) — upload a new version`)
                    : withLawyer
                      ? L(`${num(withLawyer, locale)} مستند عند المحامي`, `${withLawyer} document(s) with the lawyer`)
                      : L("الوسيط هيبعت ورقك للمحامي", "The broker will send your papers to the lawyer"),
                  VERIFIED: L("الورق اتراجع — الوسيط هينشر العرض", "Papers checked — the broker will publish it"),
                  PUBLISHED: interested ? L(`${num(interested, locale)} مشتري مهتم`, `${interested} interested buyer(s)`) : L("منشور ومستني مشترين", "Published, waiting for buyers"),
                  IN_DEAL: activeDeal ? L(`الصفقة في مرحلة: ${label(DEAL_STAGE, activeDeal.stage, locale)}`, `Deal stage: ${label(DEAL_STAGE, activeDeal.stage, locale)}`) : "",
                  SOLD: L("اتباعت — مبروك", "Sold — congratulations"),
                  WITHDRAWN: L("العرض مسحوب ومش ظاهر لحد", "Withdrawn and hidden from everyone"),
                };
                return (
                  <li key={l.id} id={`listing-${l.id}`} className="flex flex-col gap-3 border border-line bg-white p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <Link href={`/${locale}/listings/${l.id}`} className="text-lg font-bold text-navy hover:text-brand">
                          {label(CITY, l.plot.city, locale)} — {districtName(l.plot, locale)}
                        </Link>
                        <div className="text-sm text-muted">
                          <span dir="ltr">{l.plot.code}</span> · {num(l.plot.areaSqm, locale)} {L("م²", "m²")} · {money(l.price, l.currency, locale)}
                        </div>
                      </div>
                      <Badge tone={toneOf(l.status)}>{label(LISTING_STATUS, l.status, locale)}</Badge>
                    </div>
                    {/* DATA-09: المهلة خلصت → خيار «إنقاذ المهلة» */}
                    {l.plot.buildDeadline && l.plot.buildDeadline < new Date() && !["SOLD", "WITHDRAWN"].includes(l.status) && (
                      <Notice tone="amber">
                        {L("مهلة البناء للقطعة دي خلصت.", "The build deadline for this plot has passed.")}{" "}
                        <Link href={`/${locale}/rescue?plot=${encodeURIComponent(l.plot.code)}`} className="font-semibold text-brand underline">
                          {L("اطلب «إنقاذ المهلة»", "Request a deadline rescue")}
                        </Link>
                      </Notice>
                    )}
                    {l.statementExpiredAt && (
                      <Notice tone="amber">{L("إفادة الجهاز انتهت — ارفع إفادة حديثة عشان العرض يرجع طبيعي.", "The authority statement expired — upload a recent one to restore the listing.")}</Notice>
                    )}
                    {l.status === "WITHDRAWN" ? (
                      <MiniSteps steps={LISTING_FLOW.map((s) => label(LISTING_STATUS, s, locale))} current={0} stopped />
                    ) : (
                      <MiniSteps steps={LISTING_FLOW.map((s) => label(LISTING_STATUS, s, locale))} current={idx} />
                    )}
                    {activeDeal && (
                      <div className="flex flex-col gap-1.5 border-t border-line pt-2">
                        <span className="text-sm font-semibold">{L("مراحل الصفقة", "Deal stages")}</span>
                        <MiniSteps steps={STAGES.map((s) => label(DEAL_STAGE, s, locale))} current={stageIndex(activeDeal.stage)} stopped={activeDeal.status === "ON_HOLD"} />
                      </div>
                    )}
                    <p className={`text-sm ${rejected ? "text-[#A32020]" : "text-muted"}`}>{next[l.status]}</p>
                    {l.documents
                      .filter((d) => d.status === "REJECTED")
                      .map((d) => (
                        <form
                          key={d.id}
                          action={uploadNewVersion.bind(null, locale, d.id)}
                          className="flex flex-col gap-2 border border-[#EFC4C4] bg-[#FBEAEA] p-3"
                        >
                          <span className="text-sm font-semibold text-[#A32020]">
                            {L(`${label(DOC_TYPE, d.type, locale)} اترفض`, `${label(DOC_TYPE, d.type, locale)} was rejected`)}
                            {d.reviews[0]?.notes && ` — ${d.reviews[0].notes}`}
                          </span>
                          <div className="flex flex-wrap items-center gap-2">
                            <input name="file" type="file" required accept="application/pdf,image/jpeg,image/png,image/webp" className="flex-1 border border-dashed border-line bg-white p-1.5 text-sm" />
                            <button className={`${btn.small} bg-brand text-white`}>
                              {L(`ارفع نسخة ${num(d.version + 1, locale)}`, `Upload version ${d.version + 1}`)}
                            </button>
                          </div>
                        </form>
                      ))}
                    <div className="flex flex-wrap gap-2">
                      {activeDeal && (
                        <Link href={`/${locale}/deals/${activeDeal.id}`} className={`${btn.small} bg-brand text-white`}>
                          {L("غرفة الصفقة", "Deal room")}
                        </Link>
                      )}
                      {["DRAFT", "WITHDRAWN"].includes(l.status) && (
                        <form action={setMyListingStatus.bind(null, locale, l.id, "IN_REVIEW")}>
                          <button className={`${btn.small} border border-brand text-brand`}>{L("ابعت للمراجعة", "Submit for review")}</button>
                        </form>
                      )}
                      {["DRAFT", "IN_REVIEW", "VERIFIED", "PUBLISHED"].includes(l.status) && (
                        <form action={setMyListingStatus.bind(null, locale, l.id, "WITHDRAWN")}>
                          <button className={`${btn.small} text-[#A32020]`}>{L("اسحب العرض", "Withdraw")}</button>
                        </form>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {soldDeals.length > 0 && (
          <section className="flex flex-col gap-3">
            <h2 className="text-xl font-bold">{L("صفقات انتهت على قطعي", "Ended deals on my plots")}</h2>
            <ul className="flex flex-col divide-y divide-line border border-line bg-white">
              {soldDeals.map((d) => {
                const released = d.deposits.find((x) => x.escrowStatus === "RELEASED_TO_SELLER");
                return (
                  <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                    <div className="flex flex-col gap-0.5">
                      <Link href={`/${locale}/deals/${d.id}`} className="font-semibold text-navy hover:text-brand">
                        {label(CITY, d.listing.plot.city, locale)} — {districtName(d.listing.plot, locale)} · <span dir="ltr">{d.listing.plot.code}</span>
                      </Link>
                      <span className={`text-sm ${d.status === "COMPLETED" ? "text-ok" : "text-[#A32020]"}`}>
                        {d.status === "COMPLETED"
                          ? L(`اتباعت لـ ${d.buyer.name} بـ ${money(d.agreedPrice, "EGP", locale)}`, `Sold to ${d.buyer.name} for ${money(d.agreedPrice, "EGP", locale)}`)
                          : endReason(d)}
                      </span>
                      <span className="text-xs text-muted">
                        {d.closedAt ? L(`اتقفلت ${date(d.closedAt, locale)}`, `Closed ${date(d.closedAt, locale)}`) : L(`اتلغت عند: ${label(DEAL_STAGE, d.stage, locale)}`, `Cancelled at: ${label(DEAL_STAGE, d.stage, locale)}`)}
                        {released && L(` · العربون اتصرف لك (${money(released.amount, "EGP", locale)})`, ` · deposit released to you (${money(released.amount, "EGP", locale)})`)}
                        {d.listing.status === "PUBLISHED" && d.status === "CANCELLED" && L(" · العرض رجع منشور", " · listing is published again")}
                      </span>
                    </div>
                    <Badge tone={toneOf(d.status)}>{d.status === "COMPLETED" ? L("اتباعت", "Sold") : label(DEAL_STATUS, d.status, locale)}</Badge>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        <div className="grid gap-6 lg:grid-cols-2">
          <Card title={L("بياناتي", "My details")}>
            <DL
              items={[
                [L("الاسم", "Name"), me.name],
                [L("الموبايل", "Mobile"), <span key="p" dir="ltr">{me.phone}</span>],
                [L("الإيميل", "Email"), me.email ?? "—"],
                [L("بلد الإقامة", "Country"), label(COUNTRY, me.countryOfResidence, locale)],
                [
                  L("التحقق الثنائي", "Two-factor"),
                  me.totpEnabledAt ? <Badge key="t" tone="green">{L("مفعّل", "On")}</Badge> : <Badge key="t">{L("مش مفعّل", "Off")}</Badge>,
                ],
              ]}
            />
            <Link href={`/${locale}/account/security`} className={`${btn.small} self-start border border-brand text-brand`}>
              {L("الخصوصية والأمان", "Privacy & security")}
            </Link>
          </Card>

          {/* UX-11: حسابات الفريق الموثّقة (أو أي حساب موثّق من غير ملف) ما يتطلبش منها توثيق */}
          {me.accountLevel === "VERIFIED" && (!kyc || kyc.status === "APPROVED") ? (
            <Card title={<span id="kyc">{L("توثيق الهوية", "ID verification")}</span>}>
              <Badge tone="green">{L("حسابك موثّق", "Your account is verified")}</Badge>
              <p className="text-sm text-muted">{L("مش محتاج ترفع أي حاجة.", "Nothing to upload.")}</p>
            </Card>
          ) : (
          <Card title={<span id="kyc">{L("توثيق الهوية", "ID verification")}</span>}>
            {kyc && <Badge tone={toneOf(kyc.status)}>{label(VERIFICATION, kyc.status, locale)}</Badge>}
            {sp.kyc === "sent" && <Notice tone="green">{L("استلمنا صورك، والمراجعة خلال يوم عمل.", "We received your images; review takes one working day.")}</Notice>}
            {sp.kyc === "missing" && <Notice tone="red">{L("ارفع صورة الهوية والصورة الشخصية (PDF أو صورة (JPG/PNG/WebP) أقل من 4 ميجا).", "Upload both the ID and the selfie (PDF or image (JPG/PNG/WebP) under 4 MB).")}</Notice>}
            {kyc?.status === "REJECTED" && kyc.rejectionReason && <Notice tone="red">{kyc.rejectionReason}</Notice>}
            {kyc?.status === "APPROVED" ? (
              <p className="text-ok">{L("هويتك موثّقة. تقدر تمضي العقود.", "Your ID is verified. You can sign contracts.")}</p>
            ) : kyc?.status === "PENDING" ? (
              <p className="text-muted">{L("الوسيط بيراجع صورك.", "A broker is reviewing your images.")}</p>
            ) : (
              <form action={submitKyc.bind(null, locale)} className="flex flex-col gap-3">
                <label className={labelCls}>
                  {L("نوع الهوية", "ID type")}
                  <select name="idType" className={field}>
                    <option value="NATIONAL_ID">{L("بطاقة رقم قومي", "National ID")}</option>
                    <option value="PASSPORT">{L("باسبور", "Passport")}</option>
                  </select>
                </label>
                <label className={labelCls}>
                  {L("صورة الهوية", "ID image")}
                  <input name="idFile" type="file" required accept="application/pdf,image/jpeg,image/png,image/webp" className="border border-dashed border-line p-2" />
                </label>
                <label className={labelCls}>
                  {L("صورة شخصية واضحة", "A clear selfie")}
                  <input name="selfieFile" type="file" required accept="image/jpeg,image/png,image/webp" className="border border-dashed border-line p-2" />
                </label>
                <button type="submit" className={btn.primary}>
                  {L("ابعت للتوثيق", "Submit for verification")}
                </button>
              </form>
            )}
          </Card>
          )}
        </div>

        {/* MKT-06: برنامج الإحالة */}
        {refCode && (
          <Card title={<span id="referral">{L("ادعي حد واكسب", "Invite and earn")}</span>}>
            <p className="text-sm text-muted">
              {L(
                `ابعت رابطك لأي حد عايز يبيع أو يشتري قطعة. لما صفقته تتقفل بتستحق مكافأة (${rewardCfg.type === "pct" ? `${num(rewardCfg.value, locale)}% من العمولة` : money(rewardCfg.value, "EGP", locale)}).`,
                `Send your link to anyone buying or selling a plot. When their deal closes you earn a reward (${rewardCfg.type === "pct" ? `${rewardCfg.value}% of the commission` : money(rewardCfg.value, "EGP", locale)}).`,
              )}
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm">{L("كودك:", "Your code:")}</span>
              <code dir="ltr" className="bg-paper px-2 py-1 text-lg font-bold tracking-widest">
                {refCode}
              </code>
            </div>
            <ShareButtons base={siteUrl()} path={`/${locale}`} text={L("بيع واشتري قطع بيت الوطن على الورق الصحيح مع Resell", "Buy and sell Beit El Watan plots on the right paperwork with Resell")} refCode={refCode} ar={locale === "ar"} />
            <DL
              items={[
                [L("اللي سجّلوا من رابطك", "Signed up with your link"), num(referralsCount, locale)],
                [L("مكافآت مستحقة", "Rewards due"), money(rewards.filter((r) => r.status === "DUE").reduce((s, r) => s + toNum(r.amount), 0), "EGP", locale)],
                [L("مكافآت اتصرفت", "Rewards paid"), money(rewards.filter((r) => r.status === "PAID").reduce((s, r) => s + toNum(r.amount), 0), "EGP", locale)],
              ]}
            />
          </Card>
        )}

        <div className="grid gap-6 lg:grid-cols-2">
          <Card title={L("طلبات الشراء", "Buy requests")}>
            <p className="text-sm text-muted">{L("قولنا بتدوّر على إيه وهنبعت لك العروض اللي تطابقه.", "Tell us what you're looking for and we'll send matching listings.")}</p>
            {buyRequests.map((b) => (
              <div key={b.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-2">
                <div>
                  <div className="font-semibold">{b.cities.map((c) => label(CITY, c, locale)).join("، ") || L("أي مدينة", "Any city")}</div>
                  <div className="text-sm text-muted">
                    {b.minAreaSqm ? `${num(b.minAreaSqm, locale)}–${num(b.maxAreaSqm, locale)} ${L("م²", "m²")} · ` : ""}
                    {b.budgetMax ? `${L("لحد", "up to")} ${money(b.budgetMax, "EGP", locale)}` : ""}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Badge tone={toneOf(b.status)}>{label(BUY_REQUEST_STATUS, b.status, locale)}</Badge>
                  {b.status === "ACTIVE" && (
                    <form action={setBuyRequestStatus.bind(null, locale, b.id, "PAUSED")}>
                      <button className={`${btn.small} text-brand`}>{L("وقّف", "Pause")}</button>
                    </form>
                  )}
                  {b.status === "PAUSED" && (
                    <form action={setBuyRequestStatus.bind(null, locale, b.id, "ACTIVE")}>
                      <button className={`${btn.small} text-brand`}>{L("شغّل", "Resume")}</button>
                    </form>
                  )}
                </div>
              </div>
            ))}
            <form action={createBuyRequest.bind(null, locale)} className="flex flex-col gap-3 border-t border-line pt-3">
              <fieldset className="flex flex-wrap gap-3">
                <legend className="mb-1 text-sm font-medium text-muted">{L("المدن", "Cities")}</legend>
                {CITY_KEYS.map((c) => (
                  <label key={c} className="flex min-h-11 items-center gap-1.5 text-sm">
                    <input type="checkbox" name="cities" value={c} className="size-4" />
                    {label(CITY, c, locale)}
                  </label>
                ))}
              </fieldset>
              <div className="grid grid-cols-3 gap-2">
                <label className={labelCls}>
                  {L("من (م²)", "Min m²")}
                  <input name="minArea" type="number" min={0} className={field} />
                </label>
                <label className={labelCls}>
                  {L("لحد (م²)", "Max m²")}
                  <input name="maxArea" type="number" min={0} className={field} />
                </label>
                <label className={labelCls}>
                  {L("الميزانية", "Budget")}
                  <input name="budget" type="number" min={0} className={field} />
                </label>
              </div>
              <button className={btn.secondary}>{L("أضف طلب شراء", "Add buy request")}</button>
            </form>
          </Card>

          <Card title={L("طلبات الخدمات", "Service requests")}>
            {services.length === 0 ? (
              <Empty>
                <Link href={`/${locale}/rescue`} className="font-semibold text-brand">
                  {L("اطلب فحص مهلة لقطعتك", "Request a deadline check")}
                </Link>
              </Empty>
            ) : (
              services.map((s) => (
                <div key={s.id} className="flex items-center justify-between gap-2 border-b border-line pb-2">
                  <div>
                    <div className="font-semibold">{label(SERVICE_TYPE, s.type, locale)}</div>
                    <div className="text-sm text-muted">{date(s.createdAt, locale)}</div>
                  </div>
                  <Badge tone={toneOf(s.status)}>{label(SERVICE_STATUS, s.status, locale)}</Badge>
                </div>
              ))
            )}
          </Card>
        </div>
      </Container>
    </>
  );
}

function DealCard({
  locale,
  href,
  title,
  meta,
  status,
  stage,
  todo,
}: {
  locale: Locale;
  href: string;
  title: string;
  meta: string;
  status: string;
  stage: Stage;
  todo: { tone: "blue" | "amber"; text: string } | null;
}) {
  const L = tr(locale);
  const next = nextStage(stage);
  const i = stageIndex(stage);
  return (
    <div className="flex h-full flex-col gap-3 border border-line bg-white p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <Link href={href} className="text-lg font-bold text-navy hover:text-brand">
            {title}
          </Link>
          <div className="text-sm text-muted">{meta}</div>
        </div>
        <Badge tone={toneOf(status)}>{label(DEAL_STATUS, status, locale)}</Badge>
      </div>
      <MiniSteps steps={STAGES.map((s) => label(DEAL_STAGE, s, locale))} current={i} stopped={status === "CANCELLED" || status === "ON_HOLD"} />
      <p className="text-sm">
        <strong>{L(`المرحلة ${num(i + 1, locale)} من ${num(STAGES.length, locale)}: `, `Stage ${i + 1} of ${STAGES.length}: `)}</strong>
        {label(DEAL_STAGE, stage, locale)}
        {next && status === "ACTIVE" && <span className="text-muted">{L(` · اللي بعدها: ${label(DEAL_STAGE, next, locale)}`, ` · next: ${label(DEAL_STAGE, next, locale)}`)}</span>}
      </p>
      {todo && <Notice tone={todo.tone}>{todo.text}</Notice>}
      <Link href={href} className={`${btn.small} mt-auto self-start bg-brand text-white`}>
        {L("افتح غرفة الصفقة", "Open the deal room")}
      </Link>
    </div>
  );
}
