import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { ContractType } from "@prisma/client";
import { isLocale } from "@/i18n/config";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { factsOf, loadDealFor, overviewOf } from "@/lib/access";
import { DealOverview, DealTimeline, StatementLink } from "./Overview";
import { eventCategory, eventSentence, type EventCategory } from "@/lib/deal-overview";
import { can, dealCtx, listingCtx, subject } from "@/lib/authz";
import { allowedDealUploads, type UploadSide } from "@/lib/authz/policy";
import { permissionsFor } from "@/lib/authz/ui";
import { partyNameVisible } from "@/lib/authz/redact";
import { BLOCKER_TEXT, blockersToAdvance, nextStage, requiredSigners, type Blocker } from "@/lib/deal-machine";
import { date, dateTime, money, num, toNum, tr } from "@/lib/format";
import { latestRate } from "@/lib/listing";
import { districtName } from "@/lib/district";
import {
  CITY,
  COMMISSION_STATUS,
  CONTRACT_TYPE,
  DEAL_EVENT,
  DEAL_STAGE,
  DEAL_STATUS,
  DOC_STATUS,
  DOC_TYPE,
  label,
  toneOf,
} from "@/lib/labels";
import { getSetting } from "@/lib/settings";
import { Badge, Card, Container, DL, Empty, FileLink, Notice, PageHeader, btn, field, labelCls } from "@/components/ui";
import { StageStepper } from "@/components/StageStepper";
import { AdminReason } from "@/components/AdminReason";
import { TrackEvent } from "@/components/Analytics";
import { OtpConfirm } from "@/components/OtpConfirm";
import { MultiUpload } from "@/components/MultiUpload";
import { ContractSlots } from "./ContractSlots";
import { requestExport } from "../../exports/actions";
import { REASON_AR } from "@/lib/export-core";
import { renderTemplate } from "@/lib/templates";
import { dealVars } from "@/lib/contract-vars";
import { PAYOUT_ERRORS } from "@/lib/bank";
import { FEE_NOTICE } from "@/lib/bank-rules";
import { OTP_ERRORS } from "@/lib/action-otp";
import { contractActionKey } from "@/lib/action-otp-core";
import { storyConsent } from "../actions";
import {
  addNote,
  advanceStage,
  assignTeam,
  confirmDeposit,
  confirmPrice,
  createContract,
  decidePayment,
  lawyerDecision,
  proposePrice,
  recordDeposit,
  requestAgent,
  resubmitContract,
  revertStage,
  sendForSignature,
  setCommissionStatus,
  setDealStatus,
  settleDeposit,
  signContract,
  respondPrice,
  attachDealDocuments,
  grantDisclosure,
  selectDealBank,
  revokeDisclosure,
  shareDocument,
  replaceDealDocument,
  requestDocument,
  verifyContract,
  partyDepositConfirm,
  requestCancellation,
  uploadDealDocument,
} from "../actions";

type Props = { params: Promise<{ locale: string; id: string }>; searchParams: Promise<{ err?: string; ok?: string; new?: string; ev?: string; log?: string; page?: string; got?: string; want?: string }> };

// العقد اللي بيتعمل في كل مرحلة (DATA-05)
const CONTRACT_FOR_STAGE: Partial<Record<string, ContractType[]>> = {
  INTEREST: ["COMMISSION_AGREEMENT"],
  PRICE_AGREED: ["PRELIMINARY_CONTRACT", "DEPOSIT_RECEIPT"],
  // DEAL-02: نموذج 6 (تعهد المشتري) قبل تقديم التنازل
  PRELIMINARY_CONTRACT: ["DEPOSIT_RECEIPT", "BUYER_UNDERTAKING", "POWER_OF_ATTORNEY"],
  TRANSFER_FILED: ["POWER_OF_ATTORNEY"],
  AUTHORITY_APPROVED: ["CLOSING"],
};

const CANCEL_REASONS: [string, string, string][] = [
  ["authority_refused", "الجهاز رفض التنازل", "Authority refused the transfer"],
  ["seller_withdrew", "البائع رجع في البيع", "Seller withdrew"],
  ["documents_invalid", "الورق طلع فيه مشكلة", "Documents turned out invalid"],
  ["buyer_withdrew", "المشتري رجع", "Buyer withdrew"],
  ["no_agreement", "ما اتفقوش على السعر", "No agreement on price"],
  ["other", "سبب تاني", "Other"],
];

const ERRORS: Record<string, [string, string]> = {
  ...OTP_ERRORS,
  ...Object.fromEntries(Object.entries(PAYOUT_ERRORS).map(([k, v]) => [`payout_${k}`, v])),
  title: ["لازم عنوان لكل مستند (3 حروف على الأقل).", "Each document needs a title (at least 3 characters)."],
  poa_fields: ["اكتب رقم التوكيل ومكتب التوثيق أو القنصلية.", "Enter the POA number and the notary office or consulate."],
  no_draft: ["نزّل نسخة للتوقيع الأول — الرفع بيتقارن بيها.", "Download a signing copy first — the upload is checked against it."],
  code_old: ["الكود ده لنسخة ملغاة — نزّل آخر نسخة ووقّع عليها.", "That code belongs to a void copy — download the latest copy and sign it."],
  code_wrong: ["كود المستند مش مطابق للنسخة الحالية — اكتبه زي ما هو مطبوع تحت الصفحة.", "The document code doesn't match the current copy — type it exactly as printed at the bottom."],
  mix: ["ارفع PDF واحد بس، أو صور JPG/PNG بس.", "Upload one PDF only, or JPG/PNG photos only."],
  poa_sale: ["التوكيل لازم يكون للتقديم والمتابعة بس — توكيل فيه صلاحية بيع مرفوض.", "The POA must be for filing and follow-up only — a POA with sale powers is rejected."],
  agree: ["لازم تعلّم على مربع الموافقة الأول.", "Tick the consent box first."],
  bank_locked: ["الحساب مثبّت على الصفقة — كلّم المالية للتغيير.", "The account is locked to the deal — contact finance to change it."],
  verify_checklist: ["لازم تأكد كل بنود المطابقة.", "Confirm every checklist item."],
  forbidden: ["الفعل ده مش متاح لحسابك على الصفقة دي.", "This action isn't available to you on this deal."],
  reason_required: ["لازم تكتب سبب التدخّل (5 حروف على الأقل).", "Please write an override reason (at least 5 characters)."],
  note_required: ["لازم ملاحظة واضحة (10 حروف على الأقل).", "A clear note is required (at least 10 characters)."],
  bank_ref: ["اكتب رقم مرجع البنك.", "Enter the bank reference number."],
  approval_pending: ["فيه طلب صرف مستني موافقة الأدمن.", "A payout request is already awaiting admin approval."],
  type: ["نوع المستند ده مش مسموح لدورك في المرحلة دي.", "That document type isn't allowed for your role at this stage."],
  conflict: ["ما ينفعش تسند حد هو طرف في الصفقة.", "You can't assign someone who is a party to the deal."],
  price: ["اكتب سعر صحيح.", "Enter a valid price."],
  amount: ["اكتب مبلغ صحيح.", "Enter a valid amount."],
  size: ["الملف أكبر من 4 ميجا.", "The file is larger than 4 MB."],
  file: ["اختار ملف PDF أو صورة (JPG/PNG/WebP).", "Choose a PDF or image (JPG/PNG/WebP) file."],
};

export async function generateMetadata({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  const t = locale === "en" ? "Deal" : "صفقة";
  return { title: `${t} #${id.slice(-6).toUpperCase()}`, robots: { index: false, follow: false } };
}

export default async function DealRoom({ params, searchParams }: Props) {
  const { locale, id } = await params;
  if (!isLocale(locale)) notFound();
  const sp = await searchParams;
  const L = tr(locale);
  const ar = locale === "ar";
  const me = await requireUser(locale, `/${locale}/deals/${id}`);
  const deal = await loadDealFor(me, id);
  // DEAL-01: سعر النهارده (استرشادي) لحد ما يتقفل
  const indicativeRate = toNum((await latestRate())?.sell ?? 0);
  if (!deal) redirect(`/${locale}/account?denied=1`);
  // MKT-14
  const story = deal.status === "COMPLETED" ? await db.dealStory.findUnique({ where: { dealId: deal.id } }) : null;
  const storySide = me.id === deal.buyerId ? "buyer" : me.id === deal.listing.sellerId ? "seller" : null;

  const dc = dealCtx(deal);
  const p = permissionsFor(
    me,
    [
      "deal.advance",
      "deal.revert",
      "deal.hold",
      "deal.cancel",
      "deal.propose_price",
      "deal.confirm_price",
      "deal.note",
      "deal.internal_note",
      "deal.assign",
      "deal.request_agent",
      "deal.upload_doc",
      "deal.view_money",
      "contract.create",
      "contract.approve",
      "contract.sign",
      "deposit.view",
      "deposit.record",
      "deposit.confirm",
      "deposit.release",
      "deposit.refund",
      "payment.approve",
      "commission.collect",
      "commission.waive",
      "export.deal",
    ],
    { deal: dc },
  );
  const side = me.id === deal.buyerId ? "BUYER" : me.id === deal.listing.sellerId ? "SELLER" : null;
  const open = deal.status === "ACTIVE" || deal.status === "ON_HOLD";
  const facts = factsOf(deal);
  const blockers = blockersToAdvance(facts);
  const to = nextStage(facts.stage);
  const lc = { listing: listingCtx(deal.listing), deal: dc };
  const codeVisible = can(subject(me), "listing.view_code", lc).allowed;
  const namesVisible = partyNameVisible({
    viewerIsParty: !!side,
    commissionSigned: !!dc.commissionSigned,
    dealOpen: open,
    consented: (side === "BUYER" ? dc.sellerDisclosed : dc.buyerDisclosed)?.includes("name"),
  });
  const team = p["deal.assign"].allowed ? await db.user.findMany({ where: { role: { in: ["BROKER", "BROKER_LEAD", "LAWYER", "AGENT"] }, status: "ACTIVE" }, orderBy: { name: "asc" } }) : [];
  const neededContracts = (CONTRACT_FOR_STAGE[deal.stage] ?? []).filter((t) => !deal.contracts.some((c) => c.type === t && c.status !== "VOID"));
  const plot = deal.listing.plot;
  const ref = deal.id.slice(-6).toUpperCase();
  const fourEyes = (await getSetting("payments.fourEyes")).limitEgp;
  const uploadSide: UploadSide | null =
    me.role === "ADMIN" ? "ADMIN" : side ?? (me.id === deal.brokerId ? "BROKER" : me.id === deal.agentId ? "AGENT" : me.id === deal.lawyerId ? "LAWYER" : me.role === "FINANCE" ? "FINANCE" : null);
  const uploadTypes = uploadSide ? allowedDealUploads(uploadSide, deal.stage) : [];
  const ov = (k: keyof typeof p) => p[k].override;

  const docs = [
    ...deal.documents.map((d) => ({ ...d, scope: "deal" as const })),
    ...deal.listing.documents.filter((d) => d.type !== "SITE_PHOTO").map((d) => ({ ...d, uploadedBy: null, scope: "listing" as const })),
  ].map((d) => ({
    ...d,
    canOpen: can(subject(me), "document.view", { ...lc, document: { type: d.type, ownerId: d.ownerId, uploadedById: d.uploadedById, status: d.status, visibility: d.visibility } }).allowed,
  }));
  // DOC-01: مستندات أخرى + طلبات المستندات المفتوحة
  const docRequests = await db.documentRequest.findMany({ where: { dealId: id, status: "OPEN" }, orderBy: { createdAt: "asc" } });
  const otherDocs = docs.filter((d) => d.scope === "deal" && d.type === "OTHER" && d.status !== "SUPERSEDED");
  const canRequestDoc = [deal.lawyerId, deal.brokerId].includes(me.id) || me.role === "ADMIN";
  // BANK-01: حسابات الطرف اللي ينفع يختار منها
  const myAccounts = side ? await db.bankAccount.findMany({ where: { userId: me.id, status: { in: ["PENDING", "VERIFIED"] } }, orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }] }) : [];
  const myDealAccount = side === "BUYER" ? deal.buyerBankAccount : side === "SELLER" ? deal.sellerBankAccount : null;
  // CON-03: نموذج 2 (اتفاق العمولة) بالموافقة الإلكترونية — النص معبّى ببيانات الصفقة الحقيقية
  const clickwraps: Record<string, { title: string; version: number; text: string }> = {};
  for (const c of deal.contracts.filter((x) => x.type === "COMMISSION_AGREEMENT" && x.templateVersionId && x.status !== "VOID")) {
    const tv = await db.templateVersion.findUnique({ where: { id: c.templateVersionId! }, include: { template: true } });
    if (tv) clickwraps[c.id] = { title: tv.template.titleAr, version: tv.version, text: renderTemplate(tv.bodyMarkdown, await dealVars(deal, tv.version)).text };
  }
  const exportsLog = p["export.deal"].allowed ? await db.exportJob.findMany({ where: { kind: "DEAL", subjectId: id }, orderBy: { createdAt: "desc" }, take: 10, include: { requestedBy: { select: { name: true } } } }) : [];
  const ovw = { ...overviewOf(deal), docRequests: docRequests.map((r) => ({ side: r.side, title: r.title })) };
  const dealFees = await getSetting("deal.fees");
  const logFilter = (["money", "docs", "comms", "stage"] as const).find((x) => x === sp.log) as EventCategory | undefined;
  const events = deal.events.filter((e) => !(e.data as { internal?: boolean } | null)?.internal || p["deal.internal_note"].allowed);

  return (
    <>
      <PageHeader
        crumbs={[
          { href: `/${locale}/${side ? "account" : "broker?tab=deals"}`, label: side ? L("حسابي", "My account") : L("الصفقات", "Deals") },
          { href: `/${locale}/deals/${id}`, label: `#${ref}` },
        ]}
        title={L(`غرفة الصفقة #${ref}`, `Deal room #${ref}`)}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <Badge tone={toneOf(deal.status)}>{label(DEAL_STATUS, deal.status, locale)}</Badge>
            {label(CITY, plot.city, locale)} — {districtName(plot, locale)} · {num(plot.areaSqm, locale)} {L("م²", "m²")}
            {codeVisible && (
              <span dir="ltr" className="border border-navy-soft px-1.5 text-sm">
                {plot.code}
              </span>
            )}
          </span>
        }
      />
      <Container className="flex flex-col gap-6">
        {/* MKT-11 */}
        <TrackEvent name={sp.new ? "interest_registered" : sp.ev} />
        {/* MKT-14: موافقة الطرفين على نشر قصة الصفقة */}
        {story && storySide && (
          <div id="story" className="flex flex-col gap-2 border border-[#C9D6F2] bg-[#EEF3FC] p-4">
            <strong>{L("تسمح ننشر قصة صفقتك؟", "May we share your deal's story?")}</strong>
            <span className="text-sm">{L("هننشر المدينة والمدة اللي الصفقة خدتها بس — من غير أسماء. الكود بيظهر بس لو الطرفين وافقوا.", "We'd share only the city and how long the deal took — no names. The plot code appears only if both sides agree.")}</span>
            {(storySide === "buyer" ? story.buyerConsentAt : story.sellerConsentAt) ? (
              <span className="text-sm text-ok">{L("✓ إنت موافق. تقدر تسحب موافقتك في أي وقت.", "✓ You agreed. You can withdraw at any time.")}</span>
            ) : null}
            <form action={storyConsent.bind(null, locale, deal.id)} className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="showCode" defaultChecked={storySide === "buyer" ? story.buyerShowCode : story.sellerShowCode} className="size-4" />
                {L("ممكن تظهروا كود القطعة كمان", "You may show the plot code too")}
              </label>
              <button name="agree" value="yes" className={`${btn.small} bg-brand text-white`}>{L("موافق", "I agree")}</button>
              <button name="agree" value="no" className={`${btn.small} border border-line`}>{L("لا", "No")}</button>
            </form>
          </div>
        )}
        {sp.new && <Notice tone="green">{L("اهتمامك اتسجل، والوسيط هيكلمك لاتفاق العمولة.", "Your interest is registered. The broker will contact you about the commission agreement.")}</Notice>}
        {sp.ok === "approval_requested" && <Notice tone="amber">{L(`المبلغ فوق حد الأربع عيون (${num(fourEyes, locale)} ج.م) — اتبعت طلب موافقة للأدمن.`, `The amount is above the four-eyes limit (EGP ${fourEyes}) — an approval request was sent to the admin.`)}</Notice>}
        {sp.ok === "signed_uploaded" && <Notice tone="green">{L("النسخة الموقّعة اترفعت ووصلت للمحامي للمقارنة.", "The signed copy was uploaded and sent to the lawyer for comparison.")}</Notice>}
        {sp.err === "page_quality" && <Notice tone="red">{L(`الصفحة ${sp.page ?? ""} مش واضحة — صوّرها تاني في إضاءة كويسة.`, `Page ${sp.page ?? ""} isn't clear — photograph it again in good light.`)}</Notice>}
        {sp.err === "pages" && <Notice tone="red">{L(`عدد الصفحات المرفوعة ${sp.got ?? "?"} والنسخة المتولّدة ${sp.want ?? "?"} — ارفع كل الصفحات.`, `You uploaded ${sp.got ?? "?"} pages but the generated copy has ${sp.want ?? "?"} — upload every page.`)}</Notice>}
        {sp.ok === "price_response" && <Notice tone="green">{L("ردّك على السعر اتبعت للوسيط.", "Your price response was sent to the broker.")}</Notice>}
        {sp.ok === "cancel_requested" && <Notice tone="amber">{L("طلب الإلغاء اتبعت للوسيط والإدارة — هيتواصلوا معاك.", "Your cancellation request was sent to the broker and admin.")}</Notice>}
        {sp.ok === "agent_requested" && <Notice tone="green">{L("اتبعت طلب مندوب للأدمن.", "A field agent request was sent to the admin.")}</Notice>}
        {sp.err && sp.err !== "page_quality" && sp.err !== "pages" && (
          <Notice tone="red">
            {sp.err in BLOCKER_TEXT ? BLOCKER_TEXT[sp.err as Blocker][ar ? 0 : 1] : (ERRORS[sp.err] ?? ERRORS.forbidden)[ar ? 0 : 1]}
          </Notice>
        )}

        {/* REL-01: الدور في الصفقة دي بالذات */}
        {side && (
          <p className="self-start">
            <Badge tone="navy">{side === "SELLER" ? L("أنت هنا: البائع", "You are: the seller") : L("أنت هنا: المشتري", "You are: the buyer")}</Badge>
          </p>
        )}
        <StageStepper stage={deal.stage} locale={locale} cancelled={deal.status === "CANCELLED"} />

        {/* TXN-01: 4 كروت ثابتة أعلى الغرفة */}
        <DealOverview
          locale={locale}
          facts={ovw}
          side={side}
          staffMoney={!side && p["deal.view_money"].allowed}
          plot={plot}
          codeVisible={codeVisible}
          price={toNum(deal.agreedPrice ?? deal.proposedPrice ?? deal.listing.price)}
          commission={deal.commission ? { sellerAmount: toNum(deal.commission.sellerAmount), buyerAmount: toNum(deal.commission.buyerAmount), sellerRatePct: toNum(deal.commission.sellerRatePct), buyerRatePct: toNum(deal.commission.buyerRatePct), status: deal.commission.status } : null}
          fees={dealFees}
          remainingUsd={deal.listing.remainingUsd ? toNum(deal.listing.remainingUsd) : null}
          fx={{ locked: !!(deal.lockedUsdEgpRate && deal.rateLockedAt), rate: deal.lockedUsdEgpRate ? toNum(deal.lockedUsdEgpRate) : indicativeRate, at: deal.rateLockedAt }}
          dealId={deal.id}
        />
        <div className="flex flex-wrap gap-2">
          <StatementLink locale={locale} dealId={deal.id} />
        </div>
        <DealTimeline locale={locale} facts={ovw} />

        {open && to && (
          <Card title={L(`الخطوة الجاية: ${label(DEAL_STAGE, to, locale)}`, `Next: ${label(DEAL_STAGE, to, locale)}`)}>
            {blockers.length ? (
              <ul className="flex flex-col gap-1.5">
                {blockers.map((b) => (
                  <li key={b} className="flex items-center gap-2">
                    <span aria-hidden="true" className="size-2 bg-[#C98A00]" />
                    {BLOCKER_TEXT[b][ar ? 0 : 1]}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-ok">{L("كل شروط المرحلة اتحققت.", "All conditions for this stage are met.")}</p>
            )}
            {p["deal.advance"].allowed && (
              <form action={advanceStage.bind(null, locale, id)} className="flex flex-wrap items-center gap-2">
                <AdminReason show={ov("deal.advance")} ar={ar} />
                <button type="submit" disabled={blockers.length > 0} className={btn.primary}>
                  {L(`انقل الصفقة لـ «${label(DEAL_STAGE, to, locale)}»`, `Move to “${label(DEAL_STAGE, to, locale)}”`)}
                </button>
              </form>
            )}
          </Card>
        )}

        <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <div className="flex flex-col gap-6">
            <Card
              title={<span id="contracts" className="scroll-mt-24">{L("العقود", "Contracts")}</span>}
              actions={
                p["contract.create"].allowed &&
                open &&
                neededContracts.map((t) => (
                  <form key={t} action={createContract.bind(null, locale, id, t)} className="flex gap-1">
                    <AdminReason show={ov("contract.create")} ar={ar} />
                    <button className={`${btn.small} border border-brand text-brand`}>+ {label(CONTRACT_TYPE, t, locale)}</button>
                  </form>
                ))
              }
            >
              {deal.contracts.length === 0 ? (
                <Empty>{L("لسه مفيش عقود.", "No contracts yet.")}</Empty>
              ) : (
                <ul className="flex flex-col divide-y divide-line">
                  {deal.contracts.map((c) => {
                    const sigs = (c.signatures as { role: string; signedAt: string }[]) ?? [];
                    const needs = requiredSigners(c.type);
                    const mySig = side && needs.includes(side) && !sigs.some((s) => s.role === side);
                    const signedCount = needs.filter((r) => sigs.some((s) => s.role === r)).length;
                    // DATA-02: حالة العقد = اعتماد المحامي للنص + توقيع كل طرف
                    const statusText =
                      c.status === "VOID"
                        ? L("ملغي", "Void")
                        : c.status === "VERIFIED"
                          ? L("اتوقّع واتحقق منه", "Signed and verified")
                          : c.status === "SIGNED"
                          ? L("اتوقّع من الطرفين · مستني التحقق", "Signed by both sides · awaiting verification")
                          : c.status === "PARTIALLY_SIGNED"
                          ? L("اتوقّع من طرف · مستني الطرف التاني", "Signed by one side · awaiting the other")
                          : c.status === "SENT_FOR_SIGNATURE"
                            ? L(`اعتمده المحامي · ${signedCount ? "مستني توقيع الطرف التاني" : "مستني توقيع الطرفين"}`, `Approved by lawyer · ${signedCount ? "awaiting the other signature" : "awaiting both signatures"}`)
                            : c.status === "APPROVED"
                              ? L("اعتمده المحامي · لسه ما اتبعتش للتوقيع", "Approved by lawyer · not yet sent for signature")
                              : c.status === "PENDING_LAWYER"
                                ? L("مستني مراجعة المحامي", "Awaiting lawyer review")
                                : L("مسودة — المحامي طلب تعديل", "Draft — lawyer requested changes");
                    return (
                      <li key={c.id} id={`contract-${c.id}`} className="flex scroll-mt-24 flex-col gap-2 py-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-semibold">
                            {label(CONTRACT_TYPE, c.type, locale)} <span className="text-xs text-muted">{c.templateVersion}</span>
                          </span>
                          <Badge tone={toneOf(c.status)}>{statusText}</Badge>
                        </div>
                        <div className="flex flex-wrap gap-3 text-sm text-muted">
                          {needs.map((r) => {
                            const s = sigs.find((x) => x.role === r);
                            return (
                              <span key={r}>
                                {r === "BUYER" ? L("المشتري", "Buyer") : L("البائع", "Seller")}: {s ? <span className="text-ok">✓ {date(s.signedAt, locale)}</span> : L("لسه", "pending")}
                              </span>
                            );
                          })}
                          {c.approvedBy && <span>{L(`اعتمده ${c.approvedBy.name}`, `Approved by ${c.approvedBy.name}`)}</span>}
                          {c.pdfDocumentId && <FileLink id={c.pdfDocumentId}>PDF</FileLink>}
                        </div>
                        {open && (
                          <div className="flex flex-wrap gap-2">
                            {p["contract.approve"].allowed && c.status === "PENDING_LAWYER" && (
                              <form action={lawyerDecision.bind(null, locale, id, c.id)} className="flex flex-wrap items-end gap-2">
                                <input aria-label={L("ملاحظات (إجبارية لطلب التعديل)", "Notes (required to request changes)")} name="notes" placeholder={L("ملاحظات (إجبارية لطلب التعديل)", "Notes (required to request changes)")} className={`${field} w-64`} />
                                <AdminReason show={ov("contract.approve")} ar={ar} />
                                <button name="decision" value="APPROVED" className={`${btn.small} bg-ok text-white`}>
                                  {L("اعتماد", "Approve")}
                                </button>
                                <button name="decision" value="CHANGES_REQUESTED" className={`${btn.small} border border-[#8A5A00] text-[#8A5A00]`}>
                                  {L("طلب تعديل", "Request changes")}
                                </button>
                              </form>
                            )}
                            {p["contract.create"].allowed && c.status === "DRAFT" && (
                              <form action={resubmitContract.bind(null, locale, id, c.id)} className="flex gap-1">
                                <AdminReason show={ov("contract.create")} ar={ar} />
                                <button className={`${btn.small} border border-brand text-brand`}>{L("ابعت للمحامي تاني", "Resend to lawyer")}</button>
                              </form>
                            )}
                            {p["contract.create"].allowed && c.status === "APPROVED" && (
                              <form action={sendForSignature.bind(null, locale, id, c.id)} className="flex gap-1">
                                <AdminReason show={ov("contract.create")} ar={ar} />
                                <button className={`${btn.small} bg-brand text-white`}>{L("ابعت للتوقيع الإلكتروني", "Send for e-signature")}</button>
                              </form>
                            )}
                            {/* CON-04/06: المسودة / النسخة الموقّعة / التحقق */}
                            <ContractSlots
                              locale={locale}
                              dealId={id}
                              c={c}
                              mySig={!!mySig}
                              canSign={p["contract.sign"].allowed}
                              canDownload={(!!side && requiredSigners(c.type).includes(side)) || [deal.brokerId, deal.lawyerId].includes(me.id) || me.role === "ADMIN"}
                              canUpload={(!!side && requiredSigners(c.type).includes(side)) || me.id === deal.brokerId || me.role === "ADMIN"}
                              onBehalf={!side && (me.id === deal.brokerId || me.role === "ADMIN")}
                              canVerify={p["contract.approve"].allowed}
                              clickwrap={clickwraps[c.id] ?? null}
                            />
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>

            <Card title={L("المستندات", "Documents")}>
              {docs.length === 0 ? (
                <Empty>{L("مفيش مستندات.", "No documents.")}</Empty>
              ) : (
                <ul className="flex flex-col divide-y divide-line">
                  {docs.filter((d) => d.type !== "OTHER").map((d) => (
                    <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                      <span className="flex flex-col">
                        {d.canOpen ? <FileLink id={d.id}>{label(DOC_TYPE, d.type, locale)}</FileLink> : <span>{label(DOC_TYPE, d.type, locale)}</span>}
                        <span className="text-xs text-muted">
                          {d.scope === "listing" ? L("ورق القطعة", "Plot papers") : d.uploadedBy?.name} · {date(d.createdAt, locale)}
                          {d.version > 1 && ` · v${d.version}`}
                          {!d.canOpen && side === "BUYER" && L(" · بيتفتح بعد توقيع العقد المبدئي", " · opens after the preliminary contract is signed")}
                        </span>
                      </span>
                      <Badge tone={toneOf(d.status)}>{label(DOC_STATUS, d.status, locale)}</Badge>
                    </li>
                  ))}
                </ul>
              )}
              {open && p["deal.upload_doc"].allowed && uploadTypes.length > 0 && (
                <form action={uploadDealDocument.bind(null, locale, id)} className="flex flex-wrap items-end gap-2 border-t border-line pt-3">
                  <label className={`${labelCls} min-w-44 flex-1`}>
                    {L("نوع المستند", "Document type")}
                    <select name="type" className={field}>
                      {uploadTypes.map((t) => (
                        <option key={t} value={t}>
                          {label(DOC_TYPE, t, locale)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className={`${labelCls} min-w-44 flex-1`}>
                    {L("الملف (PDF أو صورة (JPG/PNG/WebP) JPG/PNG/WebP)", "File (PDF or JPG/PNG/WebP image)")}
                    <input name="file" type="file" required accept="application/pdf,image/jpeg,image/png,image/webp" className="border border-dashed border-line p-2" />
                  </label>
                  <AdminReason show={ov("deal.upload_doc")} ar={ar} />
                  <button className={btn.secondary}>{L("ارفع", "Upload")}</button>
                </form>
              )}
            </Card>

            {/* BANK-01: الحساب اللي هتستلم عليه / يترد لك عليه */}
            {side && open && (
              <Card title={<span id="bank" className="scroll-mt-24">{side === "SELLER" ? L("الحساب اللي هتستلم عليه", "Account to receive payment") : L("الحساب اللي يترد لك عليه (لو حصل رد)", "Account for any refund")}</span>}>
                {myDealAccount ? (
                  <p className="flex flex-wrap items-center gap-2">
                    <span dir="ltr" className="tabular-nums">{myDealAccount.country}•• •••• •••• {myDealAccount.ibanLast4}</span>
                    <span>· {myDealAccount.bankName}</span>
                    <Badge tone={myDealAccount.status === "VERIFIED" ? "green" : "amber"}>{myDealAccount.status === "VERIFIED" ? L("متحقق منه", "Verified") : L("مستني تحقق المالية", "Awaiting finance verification")}</Badge>
                    {deal.bankLockedAt && <Badge tone="navy">{L("مثبّت على الصفقة", "Locked to the deal")}</Badge>}
                  </p>
                ) : (
                  <p className="text-sm text-[#8A5A00]">{L("لسه ما اخترتش حساب — الصرف ما بيتمش غير على حساب متحقق منه باسمك.", "No account chosen yet — payouts go only to a verified account in your name.")}</p>
                )}
                {deal.bankLockedAt ? (
                  <p className="text-sm text-muted">{L("الحساب اتثبت مع توقيع العقد الابتدائي — أي تغيير محتاج موافقة المالية.", "The account was locked when the preliminary contract was signed — changes need finance approval.")}</p>
                ) : myAccounts.length === 0 ? (
                  <Link href={`/${locale}/account/bank`} className={`${btn.secondary} self-start`}>{L("أضف حساب بنكي", "Add a bank account")}</Link>
                ) : (
                  <OtpConfirm locale={locale} action="bank.select" subjectId={id} fields={["accountId"]} preview={L("اختيار الحساب ده للصفقة", "Choosing this account for the deal")} submitLabel={L("اختار الحساب", "Choose account")} formAction={selectDealBank.bind(null, locale, id)}>
                    <label className={labelCls}>
                      {L("حساباتك", "Your accounts")}
                      <select name="accountId" defaultValue={myDealAccount?.id ?? myAccounts[0]?.id} className={field}>
                        {myAccounts.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.bankName} · {a.currency} · •••• {a.ibanLast4} {a.status === "VERIFIED" ? "✓" : L("(مستني تحقق)", "(pending)")}
                          </option>
                        ))}
                      </select>
                    </label>
                  </OtpConfirm>
                )}
                <p className="text-[13px] text-muted">{ar ? FEE_NOTICE[0] : FEE_NOTICE[1]}</p>
              </Card>
            )}

            {/* PRIV-01: الكشف للطرف الآخر بالموافقة */}
            {side && open && (() => {
              const mine = (side === "SELLER" ? dc.sellerDisclosed : dc.buyerDisclosed) ?? [];
              const want = side === "SELLER" ? ["documents", "name", "plotCode"] : ["name"];
              const FIELD: Record<string, string> = { name: L("اسمك", "your name"), plotCode: L("كود القطعة", "the plot code"), documents: L("مستندات القطعة (خطاب التخصيص، الإيصالات، إفادة الجهاز)", "the plot documents (allocation letter, receipts, authority statement)") };
              const text = want.map((f) => FIELD[f]).join(" + ");
              const granted = want.every((f) => mine.includes(f));
              return (
                <Card title={<span id="disclosure" className="scroll-mt-24">{L("اللي بيتعرض للطرف الآخر", "What the other party can see")}</span>}>
                  <p className="text-sm leading-6 text-muted">
                    {L("🔒 بياناتك سرية ومش بتتعرض للطرف الآخر غير بموافقتك، ومش بتتباع لأي جهة.", "🔒 Your data is confidential, shown to the other party only with your consent, and never sold.")}
                  </p>
                  {granted ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone="green">{L("وافقت", "Consented")}</Badge>
                      <span className="text-sm">{L(`بيتعرض: ${text}`, `Shown: ${text}`)}</span>
                      <form action={revokeDisclosure.bind(null, locale, id)}>
                        <button className={`${btn.small} border border-line`}>{L("اسحب الموافقة", "Withdraw consent")}</button>
                      </form>
                    </div>
                  ) : (
                    <OtpConfirm
                      locale={locale}
                      action="disclosure.consent"
                      subjectId={id}
                      fields={["fields"]}
                      preview={L(`هيتعرض للطرف الآخر: ${text} — موافق؟`, `The other party will see: ${text} — do you agree?`)}
                      submitLabel={L("موافق", "I agree")}
                      formAction={grantDisclosure.bind(null, locale, id)}
                    >
                      {want.map((f) => (
                        <input key={f} type="hidden" name="field" value={f} />
                      ))}
                      <input type="hidden" name="fields" value={want.join(",")} />
                    </OtpConfirm>
                  )}
                </Card>
              );
            })()}

            {/* DOC-01: مستندات أخرى — لكل طرف، مع مين رفع وإمتى. ممنوع الحذف: استبدال بنسخة أحدث */}
            <Card title={<span id="other-docs" className="scroll-mt-24">{L("مستندات أخرى", "Other documents")}</span>}>
              {docRequests.length > 0 && (
                <ul className="flex flex-col gap-2">
                  {docRequests.map((r) => (
                    <li key={r.id} className={`flex flex-col gap-2 border p-3 ${r.side === side ? "border-brand bg-[#EEF3FC]" : "border-line"}`}>
                      <span className="font-semibold">
                        {r.side === side ? L(`مطلوب منك رفع: ${r.title}`, `Please upload: ${r.title}`) : L(`مطلوب من ${r.side === "BUYER" ? "المشتري" : "البائع"}: ${r.title}`, `Requested from the ${r.side === "BUYER" ? "buyer" : "seller"}: ${r.title}`)}
                      </span>
                      {r.note && <span className="text-sm">{r.note}</span>}
                      <span className="text-[13px] text-muted">{dateTime(r.createdAt, locale)}</span>
                      {r.side === side && open && (
                        <form action={attachDealDocuments.bind(null, locale, id)} className="flex flex-col gap-2">
                          <input type="hidden" name="requestId" value={r.id} />
                          <MultiUpload locale={locale} defaultTitle={r.title} />
                          <button className={`${btn.primary} self-start`}>{L("ابعت المستند", "Submit document")}</button>
                        </form>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {otherDocs.length === 0 ? (
                <Empty>{L("مفيش مستندات إضافية لسه.", "No additional documents yet.")}</Empty>
              ) : (
                ([
                  ["BUYER", L("من المشتري", "From the buyer")],
                  ["SELLER", L("من البائع", "From the seller")],
                  ["TEAM", L("من فريق Resell", "From the Resell team")],
                ] as const).map(([k, title]) => {
                  const list = otherDocs.filter((d) => (d.uploadedById === deal.buyerId ? "BUYER" : d.uploadedById === deal.listing.sellerId ? "SELLER" : "TEAM") === k);
                  if (!list.length) return null;
                  return (
                    <div key={k} className="flex flex-col gap-1">
                      <h3 className="font-bold">{title}</h3>
                      <ul className="flex flex-col divide-y divide-line">
                        {list.map((d) => (
                          <li key={d.id} className="flex flex-col gap-1 py-2">
                            <span className="flex flex-wrap items-center gap-2">
                              {d.canOpen ? <FileLink id={d.id}>{d.title ?? d.fileName}</FileLink> : <span>{d.title ?? d.fileName}</span>}
                              {d.version > 1 && <Badge tone="blue">{L(`نسخة ${num(d.version, locale)}`, `v${d.version}`)}</Badge>}
                              {k !== "TEAM" && <Badge tone={d.visibility === "SHARED_WITH_COUNTERPARTY" ? "green" : "gray"}>{d.visibility === "SHARED_WITH_COUNTERPARTY" ? L("مشترك مع الطرف الآخر", "Shared with the other party") : L("خاص", "Private")}</Badge>}
                            </span>
                            <span className="text-[13px] text-muted">
                              {d.uploadedBy && (k === "TEAM" || namesVisible || d.uploadedById === me.id) ? d.uploadedBy.name : k === "BUYER" ? L("المشتري", "Buyer") : L("البائع", "Seller")} · {dateTime(d.createdAt, locale)}
                            </span>
                            {open && d.uploadedById === me.id && side && d.visibility !== "SHARED_WITH_COUNTERPARTY" && (
                              <details>
                                <summary className="min-h-11 cursor-pointer py-2 text-sm text-brand">{L("شارك مع الطرف الآخر", "Share with the other party")}</summary>
                                <OtpConfirm locale={locale} action="document.share" subjectId={id} fields={["documentId"]} preview={L(`مشاركة «${d.title ?? d.fileName}» مع الطرف الآخر`, `Share “${d.title ?? d.fileName}” with the other party`)} submitLabel={L("شارك", "Share")} formAction={shareDocument.bind(null, locale, id, d.id)}>
                                  <input type="hidden" name="documentId" value={d.id} />
                                </OtpConfirm>
                              </details>
                            )}
                            {open && p["deal.upload_doc"].allowed && (d.uploadedById === me.id || [deal.brokerId, deal.lawyerId, deal.agentId].includes(me.id) || me.role === "ADMIN") && (
                              <details>
                                <summary className="min-h-11 cursor-pointer py-2 text-sm text-brand">{L("استبدال بنسخة أحدث", "Replace with a newer version")}</summary>
                                <form action={replaceDealDocument.bind(null, locale, id, d.id)} className="flex flex-col gap-2">
                                  <MultiUpload locale={locale} single defaultTitle={d.title ?? undefined} />
                                  <button className={`${btn.secondary} self-start`}>{L("احفظ النسخة الجديدة", "Save new version")}</button>
                                </form>
                              </details>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })
              )}
              {open && p["deal.upload_doc"].allowed && (
                <form action={attachDealDocuments.bind(null, locale, id)} className="flex flex-col gap-2 border-t border-line pt-3">
                  <span className="font-semibold">{L("ارفع مستندات أخرى", "Upload other documents")}</span>
                  <MultiUpload locale={locale} />
                  <AdminReason show={ov("deal.upload_doc")} ar={ar} />
                  <button className={`${btn.secondary} self-start`}>{L("ضيف للصفقة", "Add to the deal")}</button>
                </form>
              )}
              {open && canRequestDoc && (
                <details className="border-t border-line pt-3">
                  <summary className="min-h-11 cursor-pointer py-2 font-semibold text-brand">{L("اطلب مستند من طرف", "Request a document from a party")}</summary>
                  <form action={requestDocument.bind(null, locale, id)} className="flex flex-col gap-2">
                    <label className={labelCls}>
                      {L("من مين؟", "From whom?")}
                      <select name="side" className={field}>
                        <option value="SELLER">{L("البائع", "Seller")}</option>
                        <option value="BUYER">{L("المشتري", "Buyer")}</option>
                      </select>
                    </label>
                    <label className={labelCls}>
                      {L("المستند المطلوب", "Document needed")}
                      <input name="title" required minLength={3} maxLength={120} placeholder={L("مثلاً: خطاب من الجهاز", "e.g. Letter from the authority")} className={field} />
                    </label>
                    <label className={labelCls}>
                      {L("ملاحظة (اختياري)", "Note (optional)")}
                      <input name="note" maxLength={500} className={field} />
                    </label>
                    <button className={`${btn.secondary} self-start`}>{L("ابعت الطلب", "Send request")}</button>
                  </form>
                </details>
              )}
            </Card>

            <Card title={L("سجل الصفقة", "Deal log")}>
              {open && p["deal.note"].allowed && (
                <form action={addNote.bind(null, locale, id)} className="flex flex-wrap gap-2">
                  <input aria-label={L("اكتب ملاحظة", "Write a note")} name="note" required placeholder={L("اكتب ملاحظة", "Write a note")} className={`${field} min-w-56 flex-1`} />
                  {p["deal.internal_note"].allowed && (
                    <label className="flex min-h-11 items-center gap-1.5 text-sm">
                      <input type="checkbox" name="internal" className="size-4" />
                      {L("داخلية (للفريق بس)", "Internal (team only)")}
                    </label>
                  )}
                  <button className={btn.secondary}>{L("أضف", "Add")}</button>
                </form>
              )}
              {/* TXN-01: فلتر «فلوس / مستندات / تواصل» */}
              <nav aria-label={L("فلتر السجل", "Log filter")} className="flex flex-wrap gap-2">
                {([[undefined, "الكل", "All"], ["money", "فلوس", "Money"], ["docs", "مستندات", "Documents"], ["comms", "تواصل", "Communication"], ["stage", "مراحل", "Stages"]] as const).map(([k, a, e]) => (
                  <Link key={a} href={`/${locale}/deals/${id}${k ? `?log=${k}` : ""}#log`} aria-current={logFilter === k ? "true" : undefined} className={`inline-flex min-h-11 items-center border px-3 text-sm font-semibold ${logFilter === k ? "border-navy bg-navy text-white" : "border-line"}`}>
                    {ar ? a : e}
                  </Link>
                ))}
              </nav>
              <ol id="log" className="flex scroll-mt-24 flex-col gap-3 border-s-2 border-line ps-4">
                {events.filter((e) => !logFilter || eventCategory(e.type, (e.data ?? {}) as Record<string, unknown>) === logFilter).map((e) => {
                  const data = (e.data ?? {}) as Record<string, unknown>;
                  const actorName = e.actor && (namesVisible || !side || e.actorId === me.id || [deal.brokerId, deal.lawyerId, deal.agentId].includes(e.actorId)) ? (e.actorId === me.id ? L("إنت", "You") : e.actor.name) : L("طرف في الصفقة", "A party");
                  return (
                    <li key={e.id} className="flex flex-col gap-0.5">
                      <span className="font-semibold">
                        {eventSentence({ type: e.type, toStage: e.toStage, data }, actorName, ar)}
                        {data.internal === true && <Badge tone="gray">{L("داخلية", "Internal")}</Badge>}
                      </span>
                      {typeof data.note === "string" && <span>{data.note}</span>}
                      {typeof data.notes === "string" && data.notes && <span>{data.notes}</span>}
                      {typeof data.reason === "string" && e.type === "CANCELLED" && (
                        <span>{CANCEL_REASONS.find((r) => r[0] === data.reason)?.[ar ? 1 : 2] ?? (data.reason === "sold_to_other" ? L("القطعة اتباعت لمشتري تاني", "Sold to another buyer") : "")}</span>
                      )}
                      <span className="text-xs text-muted">
                        {e.actor && (namesVisible || !side || e.actorId === me.id || [deal.brokerId, deal.lawyerId, deal.agentId].includes(e.actorId)) ? e.actor.name : L("طرف في الصفقة", "A party")} ·{" "}
                        {dateTime(e.createdAt, locale)}
                      </span>
                    </li>
                  );
                })}
              </ol>
            </Card>
          </div>

          <aside className="flex flex-col gap-6">
            <Card title={L("الأطراف والفريق", "Parties and team")}>
              <DL
                items={[
                  [L("المشتري", "Buyer"), side === "SELLER" && !namesVisible ? L("بيظهر بعد توقيع اتفاق العمولة", "Shown after the commission agreement is signed") : deal.buyer.name],
                  [L("البائع", "Seller"), side === "BUYER" && !namesVisible ? L("بيظهر بعد توقيع اتفاق العمولة", "Shown after the commission agreement is signed") : deal.listing.seller.name],
                  [L("الوسيط", "Broker"), deal.broker?.name ?? "—"],
                  [L("المحامي", "Lawyer"), deal.lawyer?.name ?? "—"],
                  [L("المندوب", "Field agent"), deal.agent?.name ?? "—"],
                ]}
              />
              {side && <p className="text-sm text-muted">{L("التواصل مع الطرف التاني عن طريق الوسيط بس.", "Contact with the other party is through the broker only.")}</p>}
              {p["deal.request_agent"].allowed && !deal.agentId && open && (
                <form action={requestAgent.bind(null, locale, id)}>
                  <button className={`${btn.small} border border-brand text-brand`}>{L("اطلب مندوب", "Request a field agent")}</button>
                </form>
              )}
              {p["deal.assign"].allowed && open && (
                <form action={assignTeam.bind(null, locale, id)} className="flex flex-col gap-2 border-t border-line pt-3">
                  {(["brokerId", "lawyerId", "agentId"] as const).map((k) => {
                    const roles = k === "brokerId" ? ["BROKER", "BROKER_LEAD"] : k === "lawyerId" ? ["LAWYER"] : ["AGENT"];
                    return (
                      <label key={k} className={labelCls}>
                        {k === "brokerId" ? L("الوسيط", "Broker") : k === "lawyerId" ? L("المحامي", "Lawyer") : L("المندوب", "Field agent")}
                        <select name={k} defaultValue={deal[k] ?? ""} className={field}>
                          <option value="">—</option>
                          {team
                            .filter((u) => roles.includes(u.role) && u.id !== deal.buyerId && u.id !== deal.listing.sellerId)
                            .map((u) => (
                              <option key={u.id} value={u.id}>
                                {u.name}
                              </option>
                            ))}
                        </select>
                      </label>
                    );
                  })}
                  <AdminReason show={ov("deal.assign")} ar={ar} />
                  <button className={btn.secondary}>{L("حفظ الفريق", "Save team")}</button>
                </form>
              )}
            </Card>

            {p["deal.view_money"].allowed && (
              <Card title={<span id="price" className="scroll-mt-24">{L("السعر", "Price")}</span>}>
                <DL
                  items={[
                    [L("السعر المطلوب", "Asking price"), money(deal.listing.price, deal.listing.currency, locale)],
                    [L("السعر المقترح", "Proposed price"), deal.proposedPrice ? money(deal.proposedPrice, "EGP", locale) : "—"],
                    [L("السعر المتفق", "Agreed price"), deal.agreedPrice ? money(deal.agreedPrice, deal.agreedCurrency, locale) : "—"],
                    [
                      L("سعر الصرف", "FX rate"),
                      // DEAL-01: «مقفول» بعد توقيع العقد الابتدائي، و«استرشادي» قبله
                      deal.lockedUsdEgpRate && deal.rateLockedAt
                        ? `${num(deal.lockedUsdEgpRate, locale, 2)} — ${L("مقفول بتاريخ", "locked on")} ${date(deal.rateLockedAt, locale)}${deal.exchangeRate ? ` (${L("سعر يوم", "rate of")} ${date(deal.exchangeRate.date, locale)})` : ""}`
                        : `${num(indicativeRate, locale, 2)} — ${L("استرشادي · بيتقفل لحظة توقيع الطرفين على العقد الابتدائي", "indicative · locks when both parties sign the preliminary contract")}`,
                    ],
                  ]}
                />
                {deal.proposedPrice && !deal.agreedPrice && (
                  <p className="text-sm">
                    {L("المشتري", "Buyer")}: {deal.buyerPriceOkAt ? <span className="text-ok">✓ {L("وافق", "confirmed")}</span> : L("لسه", "pending")} · {L("البائع", "Seller")}:{" "}
                    {deal.sellerPriceOkAt ? <span className="text-ok">✓ {L("وافق", "confirmed")}</span> : L("لسه", "pending")}
                  </p>
                )}
                {p["deal.confirm_price"].allowed && deal.proposedPrice && !deal.agreedPrice && !(side === "BUYER" ? deal.buyerPriceOkAt : deal.sellerPriceOkAt) && (
                  <div className="flex flex-col gap-3">
                    <OtpConfirm
                      locale={locale}
                      action="price.accept"
                      subjectId={id}
                      fields={["price"]}
                      preview={L(`موافقتك على سعر ${money(deal.proposedPrice, "EGP", locale)}`, `Your approval of ${money(deal.proposedPrice, "EGP", locale)}`)}
                      submitLabel={L(`أوافق على ${money(deal.proposedPrice, "EGP", locale)}`, `I confirm ${money(deal.proposedPrice, "EGP", locale)}`)}
                      formAction={confirmPrice.bind(null, locale, id)}
                    >
                      <input type="hidden" name="price" value={String(toNum(deal.proposedPrice))} />
                    </OtpConfirm>
                    <details className="text-sm">
                      <summary className="min-h-11 cursor-pointer py-2 text-brand">{L("مش موافق؟ ارفض أو قدّم عرض مقابل", "Not OK? Reject or counter-offer")}</summary>
                      <div className="mt-2 flex flex-col gap-3">
                        <OtpConfirm
                          locale={locale}
                          action="price.counter"
                          subjectId={id}
                          fields={["price"]}
                          preview={L("عرضك المقابل بالسعر اللي هتكتبه", "Your counter-offer at the price you enter")}
                          submitLabel={L("ابعت العرض المقابل", "Send counter-offer")}
                          formAction={respondPrice.bind(null, locale, id, "counter")}
                        >
                          <label className={labelCls}>
                            {L("سعرك (ج.م)", "Your price (EGP)")}
                            <input name="price" type="number" min={1} required className={field} />
                          </label>
                        </OtpConfirm>
                        <OtpConfirm
                          locale={locale}
                          action="price.reject"
                          subjectId={id}
                          preview={L(`رفضك لسعر ${money(deal.proposedPrice, "EGP", locale)}`, `Your rejection of ${money(deal.proposedPrice, "EGP", locale)}`)}
                          submitLabel={L("ارفض السعر", "Reject price")}
                          submitClass={btn.danger}
                          formAction={respondPrice.bind(null, locale, id, "reject")}
                        />
                      </div>
                    </details>
                  </div>
                )}
                {p["deal.propose_price"].allowed && !deal.agreedPrice && deal.stage === "COMMISSION_AGREEMENT" && (
                  <form action={proposePrice.bind(null, locale, id)} className="flex flex-wrap items-end gap-2">
                    <label className={`${labelCls} flex-1`}>
                      {L("اقترح سعر (ج.م)", "Propose a price (EGP)")}
                      <input name="price" type="number" min={1} required defaultValue={deal.proposedPrice ? toNum(deal.proposedPrice) : undefined} className={field} />
                    </label>
                    <AdminReason show={ov("deal.propose_price")} ar={ar} />
                    <button className={btn.secondary}>{L("ابعت للطرفين", "Send to both sides")}</button>
                  </form>
                )}
              </Card>
            )}

            {p["deposit.view"].allowed && (
              <Card title={<span id="deposit" className="scroll-mt-24">{L("العربون", "Deposit")}</span>}>
                <p className="text-sm text-muted">{L("الفلوس نفسها في حساب ضمان عند البنك، والمنصة بتتابع الحالة بس.", "The money sits in a bank escrow account; the platform only tracks its status.")}</p>
                {deal.deposits.map((d) => {
                  // DATA-02: الحالة من الحقيقة
                  const status =
                    d.escrowStatus === "AWAITING_TRANSFER"
                      ? d.receiptDocumentId
                        ? L("إيصال مرفوع، مستني تأكيد البنك", "Receipt uploaded, awaiting bank confirmation")
                        : L("مستني تحويل المشتري", "Awaiting buyer transfer")
                      : d.escrowStatus === "HELD"
                        ? L("محفوظ في البنك", "Held in escrow")
                        : d.escrowStatus === "RELEASED_TO_SELLER"
                          ? L("اتصرف للبائع", "Released to seller")
                          : L("اترد للمشتري", "Refunded to buyer");
                  const pending = d.approvals[0];
                  return (
                    <div key={d.id} className="flex flex-col gap-2 border-t border-line pt-2">
                      <div className="flex items-center justify-between gap-2">
                        <strong>{money(d.amount, d.currency, locale)}</strong>
                        <Badge tone={toneOf(d.escrowStatus)}>{status}</Badge>
                      </div>
                      <div className="text-xs text-muted">
                        {d.bankReference && <span dir="ltr">{d.bankReference} · </span>}
                        {d.receiptDocument ? <FileLink id={d.receiptDocument.id}>{L("إيصال التحويل", "Transfer receipt")}</FileLink> : L("مفيش إيصال لسه", "No receipt yet")}
                      </div>
                      {/* DEAL-03: تأكيدات الطرفين على العربون (بكود) */}
                      {d.buyerSentAt && <span className="text-sm text-ok">✓ {L("المشتري أكّد التحويل", "Buyer confirmed the transfer")} — {date(d.buyerSentAt, locale)}</span>}
                      {d.sellerReceivedAt && <span className="text-sm text-ok">✓ {L("البائع أكّد الاستلام", "Seller confirmed receipt")} — {date(d.sellerReceivedAt, locale)}</span>}
                      {side === "BUYER" && d.escrowStatus === "AWAITING_TRANSFER" && !d.buyerSentAt && (
                        <OtpConfirm locale={locale} action="deposit.sent" subjectId={id} fields={["depositId"]} preview={L(`إنك حوّلت العربون ${money(d.amount, d.currency, locale)} لحساب الضمان`, `That you transferred the deposit ${money(d.amount, d.currency, locale)} to escrow`)} submitLabel={L("حوّلت العربون", "I transferred the deposit")} formAction={partyDepositConfirm.bind(null, locale, id, d.id, "sent")}>
                          <input type="hidden" name="depositId" value={d.id} />
                        </OtpConfirm>
                      )}
                      {side === "SELLER" && d.escrowStatus === "RELEASED_TO_SELLER" && !d.sellerReceivedAt && (
                        <OtpConfirm locale={locale} action="deposit.received" subjectId={id} fields={["depositId"]} preview={L(`إنك استلمت ${money(d.amount, d.currency, locale)}`, `That you received ${money(d.amount, d.currency, locale)}`)} submitLabel={L("استلمت المبلغ", "I received the amount")} formAction={partyDepositConfirm.bind(null, locale, id, d.id, "received")}>
                          <input type="hidden" name="depositId" value={d.id} />
                        </OtpConfirm>
                      )}
                      {pending && (
                        <Notice tone="amber">
                          {L(`طلب ${pending.action === "RELEASED_TO_SELLER" ? "صرف للبائع" : "رد للمشتري"} مستني موافقة الأدمن`, `${pending.action === "RELEASED_TO_SELLER" ? "Release" : "Refund"} request awaiting admin approval`)}
                          {p["payment.approve"].allowed && pending.requestedById !== me.id && (
                            <form action={decidePayment.bind(null, locale, id, pending.id)} className="mt-2 flex flex-wrap gap-2">
                              <input aria-label={L("مصاريف التحويل الفعلية — على المستلم (ج.م)", "Actual transfer fee — paid by the recipient (EGP)")} name="payoutFeeEgp" type="number" min={0} step="0.01" placeholder={L("مصاريف التحويل (ج.م)", "Transfer fee (EGP)")} className={`${field} min-h-9 w-36`} />
                              <button name="decision" value="APPROVED" className={`${btn.small} bg-ok text-white`}>{L("وافق ونفّذ", "Approve and execute")}</button>
                              <button name="decision" value="REJECTED" className={`${btn.small} border border-[#A32020] text-[#A32020]`}>{L("ارفض", "Reject")}</button>
                            </form>
                          )}
                        </Notice>
                      )}
                      {(p["deposit.release"].allowed || p["deposit.refund"].allowed) && d.escrowStatus === "HELD" && <p className="text-[13px] text-muted">{ar ? FEE_NOTICE[0] : FEE_NOTICE[1]}</p>}
                      {d.payoutNetEgp && (
                        <span className="text-sm tabular-nums">
                          {L("اتحوّل", "Transferred")} {money(d.amount, d.currency, locale)} · {L("مصاريف التحويل (على المستلم)", "Transfer fee (recipient)")} {money(d.payoutFeeEgp, "EGP", locale)} · {L("الصافي", "Net")} {money(d.payoutNetEgp, "EGP", locale)}
                        </span>
                      )}
                      {!pending && (
                        <div className="flex flex-wrap gap-1.5">
                          {p["deposit.confirm"].allowed && d.escrowStatus === "AWAITING_TRANSFER" && (
                            <form action={confirmDeposit.bind(null, locale, id, d.id)} className="flex flex-wrap gap-1.5">
                              <input aria-label={L("رقم مرجع البنك", "Bank reference")} name="bankReference" required minLength={4} dir="ltr" placeholder={L("رقم مرجع البنك", "Bank reference")} className={`${field} min-h-9 w-40`} />
                              <AdminReason show={ov("deposit.confirm")} ar={ar} />
                              <button className={`${btn.small} border border-ok text-ok`}>{L("البنك أكّد الاستلام", "Bank confirmed")}</button>
                            </form>
                          )}
                          {p["deposit.release"].allowed && d.escrowStatus === "HELD" && (
                            <form action={settleDeposit.bind(null, locale, id, d.id, "RELEASED_TO_SELLER")} className="flex flex-wrap gap-1.5">
                              <input aria-label={L("مصاريف التحويل الفعلية — على المستلم (ج.م)", "Actual transfer fee — paid by the recipient (EGP)")} name="payoutFeeEgp" type="number" min={0} step="0.01" placeholder={L("مصاريف التحويل (ج.م)", "Transfer fee (EGP)")} className={`${field} min-h-9 w-36`} />
                              <AdminReason show={ov("deposit.release")} ar={ar} />
                              <button className={`${btn.small} border border-ok text-ok`}>{L("اصرف للبائع", "Release to seller")}</button>
                            </form>
                          )}
                          {p["deposit.refund"].allowed && d.escrowStatus === "HELD" && (
                            <form action={settleDeposit.bind(null, locale, id, d.id, "REFUNDED_TO_BUYER")} className="flex flex-wrap gap-1.5">
                              <input aria-label={L("مصاريف التحويل الفعلية — على المستلم (ج.م)", "Actual transfer fee — paid by the recipient (EGP)")} name="payoutFeeEgp" type="number" min={0} step="0.01" placeholder={L("مصاريف التحويل (ج.م)", "Transfer fee (EGP)")} className={`${field} min-h-9 w-36`} />
                              <AdminReason show={ov("deposit.refund")} ar={ar} />
                              <button className={`${btn.small} border border-[#A32020] text-[#A32020]`}>{L("رد للمشتري", "Refund buyer")}</button>
                            </form>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
                {p["deposit.record"].allowed && open && ["PRICE_AGREED", "PRELIMINARY_CONTRACT"].includes(deal.stage) && (
                  <form action={recordDeposit.bind(null, locale, id)} className="flex flex-wrap items-end gap-2 border-t border-line pt-3">
                    <label className={`${labelCls} flex-1`}>
                      {L("مبلغ العربون (ج.م)", "Deposit amount (EGP)")}
                      <input name="amount" type="number" min={1} required defaultValue={deal.agreedPrice ? Math.round(toNum(deal.agreedPrice) * 0.1) : undefined} className={field} />
                    </label>
                    <AdminReason show={ov("deposit.record")} ar={ar} />
                    <button className={btn.secondary}>{L("سجّل عربون", "Record deposit")}</button>
                  </form>
                )}
              </Card>
            )}

            {deal.commission && p["deal.view_money"].allowed && (
              <Card title={L("العمولة", "Commission")}>
                <div className="flex justify-end">
                  <Badge tone={toneOf(deal.commission.status)}>{label(COMMISSION_STATUS, deal.commission.status, locale)}</Badge>
                </div>
                <DL
                  items={[
                    ...(side !== "BUYER"
                      ? ([[L(`من البائع (${num(deal.commission.sellerRatePct, locale, 2)}%)`, `Seller (${num(deal.commission.sellerRatePct, locale, 2)}%)`), money(deal.commission.sellerAmount, deal.commission.currency, locale)]] as [string, string][])
                      : []),
                    ...(side !== "SELLER"
                      ? ([[L(`من المشتري (${num(deal.commission.buyerRatePct, locale, 2)}%)`, `Buyer (${num(deal.commission.buyerRatePct, locale, 2)}%)`), money(deal.commission.buyerAmount, deal.commission.currency, locale)]] as [string, string][])
                      : []),
                  ]}
                />
                <div className="flex flex-wrap gap-1.5">
                  {p["commission.collect"].allowed &&
                    (["INVOICED", "PAID"] as const)
                      .filter((s) => s !== deal.commission!.status)
                      .map((s) => (
                        <form key={s} action={setCommissionStatus.bind(null, locale, id, s)} className="flex gap-1">
                          {s === "PAID" && <input aria-label={L("مرجع التحصيل", "Payment reference")} name="reference" placeholder={L("مرجع التحصيل", "Payment reference")} className={`${field} min-h-9 w-36`} />}
                          <AdminReason show={ov("commission.collect")} ar={ar} />
                          <button className={`${btn.small} border border-line`}>{label(COMMISSION_STATUS, s, locale)}</button>
                        </form>
                      ))}
                  {p["commission.waive"].allowed && deal.commission.status !== "WAIVED" && (
                    <form action={setCommissionStatus.bind(null, locale, id, "WAIVED")}>
                      <button className={`${btn.small} border border-[#A32020] text-[#A32020]`}>{label(COMMISSION_STATUS, "WAIVED", locale)}</button>
                    </form>
                  )}
                </div>
              </Card>
            )}

            {open && (p["deal.hold"].allowed || p["deal.cancel"].allowed) && (
              <Card title={L("حالة الصفقة", "Deal status")}>
                <div className="flex flex-col gap-3">
                  {p["deal.hold"].allowed && (
                    <form action={setDealStatus.bind(null, locale, id, deal.status === "ACTIVE" ? "ON_HOLD" : "ACTIVE")} className="flex gap-2">
                      <AdminReason show={ov("deal.hold")} ar={ar} />
                      <button className={btn.secondary}>{deal.status === "ACTIVE" ? L("وقّف مؤقتاً", "Put on hold") : L("رجّعها شغالة", "Resume")}</button>
                    </form>
                  )}
                  {p["deal.cancel"].allowed && (
                    <form action={setDealStatus.bind(null, locale, id, "CANCELLED")} className="flex flex-col gap-2">
                      <label className={labelCls}>
                        {L("سبب الإلغاء", "Cancellation reason")}
                        <select name="reason" className={field}>
                          {CANCEL_REASONS.map(([k, a, e]) => (
                            <option key={k} value={k}>
                              {ar ? a : e}
                            </option>
                          ))}
                        </select>
                      </label>
                      <input aria-label={L("تفاصيل (بتظهر للطرفين)", "Details (shown to both sides)")} name="note" placeholder={L("تفاصيل (بتظهر للطرفين)", "Details (shown to both sides)")} className={field} />
                      <AdminReason show={ov("deal.cancel")} ar={ar} />
                      <button className={btn.danger}>{L("إلغاء الصفقة", "Cancel deal")}</button>
                    </form>
                  )}
                </div>
              </Card>
            )}

            {open && side && (
              <Card title={L("عايز تلغي الصفقة؟", "Want to cancel the deal?")}>
                <details>
                  <summary className="min-h-11 cursor-pointer py-2 text-sm text-brand">{L("اطلب إلغاء (بيروح للوسيط والإدارة)", "Request cancellation (goes to the broker and admin)")}</summary>
                  <OtpConfirm locale={locale} action="deal.cancel_request" subjectId={id} preview={L("طلبك إلغاء الصفقة دي", "Your request to cancel this deal")} submitLabel={L("ابعت طلب الإلغاء", "Send cancellation request")} submitClass={btn.danger} formAction={requestCancellation.bind(null, locale, id)} className="mt-2">
                    <label className={labelCls}>
                      {L("السبب (10 حروف على الأقل)", "Reason (at least 10 characters)")}
                      <textarea name="note" required minLength={10} rows={2} className={field} />
                    </label>
                  </OtpConfirm>
                </details>
              </Card>
            )}

            {/* ADM-EXP-01/03: ملف الصفقة كاملاً — بتأكيد هوية + سبب، وسجل التصديرات */}
            {p["export.deal"].allowed && (
              <Card title={<span id="export" className="scroll-mt-24">{L("تنزيل ملف الصفقة", "Download the deal file")}</span>}>
                {sp.ok === "export" && <Notice tone="green">{L("التصدير شغال في الخلفية — هيوصلك تنبيه بالرابط (مرة واحدة لمدة ساعة) وتنبيه منفصل بكلمة السر.", "The export runs in the background — you'll get a notification with the link (one use, one hour) and a separate one with the password.")}</Notice>}
                {sp.err === "export_reason" && <Notice tone="red">{L("اختار سبب التصدير (ولو «أخرى» اكتب الشرح).", "Choose an export reason (and explain if “Other”).")}</Notice>}
                <form action={requestExport.bind(null, locale, "DEAL", id)} className="flex flex-col gap-2">
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
                  <span className="text-[13px] text-muted">{L("هيطلب منك تأكيد هويتك بكود. الملف ZIP مشفّر بكلمة سر (افتحه بـ 7-Zip أو The Unarchiver)، وكل PDF عليه ختم باسمك.", "You'll be asked to confirm your identity with a code. The ZIP is password-encrypted (open with 7-Zip or The Unarchiver) and every PDF is stamped with your name.")}{me.role !== "ADMIN" && L(" نسخة المحامي من غير أرقام الحسابات البنكية الكاملة.", " The lawyer's copy excludes full bank account numbers.")}</span>
                  <button className={`${btn.secondary} self-start`}>{L("صدّر ملف الصفقة", "Export the deal file")}</button>
                </form>
                {exportsLog.length > 0 && (
                  <ul className="flex flex-col divide-y divide-line text-sm">
                    {exportsLog.map((x) => (
                      <li key={x.id} className="flex flex-wrap justify-between gap-2 py-2">
                        <span>
                          {x.requestedBy.name} — {REASON_AR[x.reason] ?? x.reason} — {x.status}
                          {x.sizeBytes ? ` — ${Math.round(x.sizeBytes / 1024)} KB — ${x.fileCount} ${L("ملف", "files")}` : ""}
                        </span>
                        <span className="text-[13px] text-muted">{dateTime(x.createdAt, locale)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            )}

            {p["deal.revert"].allowed && deal.stage !== "INTEREST" && (
              <Card title={L("إرجاع لمرحلة سابقة (أدمن)", "Revert to previous stage (admin)")}>
                <form action={revertStage.bind(null, locale, id)} className="flex flex-col gap-2">
                  <input aria-label={L("السبب", "Reason")} name="reason" required minLength={5} placeholder={L("السبب", "Reason")} className={field} />
                  <button className={btn.secondary}>{L("ارجع مرحلة", "Revert one stage")}</button>
                </form>
              </Card>
            )}

            <Link href={`/${locale}/listings/${deal.listingId}`} className={btn.ghost}>
              {L("صفحة القطعة ←", "Plot page →")}
            </Link>
          </aside>
        </div>
      </Container>
    </>
  );
}
