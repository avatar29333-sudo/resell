import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { ContractType } from "@prisma/client";
import { isLocale } from "@/i18n/config";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { factsOf, loadDealFor } from "@/lib/access";
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
  uploadDealDocument,
} from "../actions";

type Props = { params: Promise<{ locale: string; id: string }>; searchParams: Promise<{ err?: string; ok?: string; new?: string; ev?: string }> };

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
  const namesVisible = partyNameVisible({ viewerIsParty: !!side, commissionSigned: !!dc.commissionSigned, dealOpen: open });
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
    canOpen: can(subject(me), "document.view", { ...lc, document: { type: d.type, ownerId: d.ownerId, uploadedById: d.uploadedById, status: d.status } }).allowed,
  }));
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
        {sp.ok === "agent_requested" && <Notice tone="green">{L("اتبعت طلب مندوب للأدمن.", "A field agent request was sent to the admin.")}</Notice>}
        {sp.err && (
          <Notice tone="red">
            {sp.err in BLOCKER_TEXT ? BLOCKER_TEXT[sp.err as Blocker][ar ? 0 : 1] : (ERRORS[sp.err] ?? ERRORS.forbidden)[ar ? 0 : 1]}
          </Notice>
        )}

        <StageStepper stage={deal.stage} locale={locale} cancelled={deal.status === "CANCELLED"} />

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
              title={L("العقود", "Contracts")}
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
                      <li key={c.id} className="flex flex-col gap-2 py-3">
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
                            {c.status === "SENT_FOR_SIGNATURE" && mySig && (
                              p["contract.sign"].allowed ? (
                                <form action={signContract.bind(null, locale, id, c.id)}>
                                  <button className={`${btn.small} bg-brand text-white`}>{L("وقّع إلكترونياً", "Sign electronically")}</button>
                                </form>
                              ) : (
                                <span className="text-sm text-[#8A5A00]">{L("وثّق هويتك الأول عشان تقدر توقّع.", "Verify your ID first to be able to sign.")}</span>
                              )
                            )}
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
                  {docs.map((d) => (
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
              <ol className="flex flex-col gap-3 border-s-2 border-line ps-4">
                {events.map((e) => {
                  const data = (e.data ?? {}) as Record<string, unknown>;
                  return (
                    <li key={e.id} className="flex flex-col gap-0.5">
                      <span className="font-semibold">
                        {label(DEAL_EVENT, e.type, locale)}
                        {e.toStage && ` → ${label(DEAL_STAGE, e.toStage, locale)}`}
                        {typeof data.type === "string" && ` · ${label(data.type in CONTRACT_TYPE ? CONTRACT_TYPE : DOC_TYPE, data.type, locale)}`}
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
              <Card title={L("السعر", "Price")}>
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
                  <form action={confirmPrice.bind(null, locale, id)}>
                    <button className={btn.primary}>{L(`أوافق على ${money(deal.proposedPrice, "EGP", locale)}`, `I confirm ${money(deal.proposedPrice, "EGP", locale)}`)}</button>
                  </form>
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
              <Card title={L("العربون", "Deposit")}>
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
                      {pending && (
                        <Notice tone="amber">
                          {L(`طلب ${pending.action === "RELEASED_TO_SELLER" ? "صرف للبائع" : "رد للمشتري"} مستني موافقة الأدمن`, `${pending.action === "RELEASED_TO_SELLER" ? "Release" : "Refund"} request awaiting admin approval`)}
                          {p["payment.approve"].allowed && pending.requestedById !== me.id && (
                            <form action={decidePayment.bind(null, locale, id, pending.id)} className="mt-2 flex flex-wrap gap-2">
                              <button name="decision" value="APPROVED" className={`${btn.small} bg-ok text-white`}>{L("وافق ونفّذ", "Approve and execute")}</button>
                              <button name="decision" value="REJECTED" className={`${btn.small} border border-[#A32020] text-[#A32020]`}>{L("ارفض", "Reject")}</button>
                            </form>
                          )}
                        </Notice>
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
                            <form action={settleDeposit.bind(null, locale, id, d.id, "RELEASED_TO_SELLER")} className="flex gap-1.5">
                              <AdminReason show={ov("deposit.release")} ar={ar} />
                              <button className={`${btn.small} border border-ok text-ok`}>{L("اصرف للبائع", "Release to seller")}</button>
                            </form>
                          )}
                          {p["deposit.refund"].allowed && d.escrowStatus === "HELD" && (
                            <form action={settleDeposit.bind(null, locale, id, d.id, "REFUNDED_TO_BUYER")} className="flex gap-1.5">
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
