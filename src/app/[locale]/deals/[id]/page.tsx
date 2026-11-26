import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { ContractType } from "@prisma/client";
import { isLocale } from "@/i18n/config";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { factsOf, isStaff, loadDealFor } from "@/lib/access";
import { BLOCKER_TEXT, blockersToAdvance, buyerCanSeeFiles, buyerCanSeePlotCode, nextStage, requiredSigners, type Blocker } from "@/lib/deal-machine";
import { date, dateTime, money, num, toNum, tr } from "@/lib/format";
import {
  CITY,
  COMMISSION_STATUS,
  CONTRACT_STATUS,
  CONTRACT_TYPE,
  DEAL_EVENT,
  DEAL_STAGE,
  DEAL_STATUS,
  DOC_STATUS,
  DOC_TYPE,
  ESCROW_STATUS,
  label,
  toneOf,
} from "@/lib/labels";
import { Badge, Card, Container, DL, Empty, FileLink, Notice, PageHeader, btn, field, labelCls } from "@/components/ui";
import { StageStepper } from "@/components/StageStepper";
import {
  addNote,
  advanceStage,
  assignTeam,
  createContract,
  lawyerDecision,
  recordDeposit,
  resubmitContract,
  sendForSignature,
  setAgreedPrice,
  setCommissionStatus,
  setDealStatus,
  setDepositStatus,
  signContract,
  uploadDealDocument,
} from "../actions";

type Props = { params: Promise<{ locale: string; id: string }>; searchParams: Promise<{ err?: string; new?: string }> };

// العقد المطلوب في كل مرحلة
const CONTRACT_FOR_STAGE: Partial<Record<string, ContractType[]>> = {
  INTEREST: ["COMMISSION_AGREEMENT"],
  COMMISSION_AGREEMENT: ["COMMISSION_AGREEMENT"],
  PRICE_AGREED: ["PRELIMINARY_CONTRACT", "DEPOSIT_RECEIPT"],
  PRELIMINARY_CONTRACT: ["PRELIMINARY_CONTRACT", "DEPOSIT_RECEIPT"],
  TRANSFER_FILED: ["POWER_OF_ATTORNEY"],
};

export default async function DealRoom({ params, searchParams }: Props) {
  const { locale, id } = await params;
  if (!isLocale(locale)) notFound();
  const sp = await searchParams;
  const L = tr(locale);
  const me = await requireUser(locale, `/${locale}/deals/${id}`);
  const deal = await loadDealFor(me, id);
  if (!deal) redirect(`/${locale}/account?denied=1`);

  const staff = isStaff(me);
  const manager = me.role === "ADMIN" || me.role === "BROKER";
  const lawyer = me.role === "LAWYER" || me.role === "ADMIN";
  const finance = me.role === "FINANCE" || me.role === "ADMIN";
  const side = me.id === deal.buyerId ? "BUYER" : me.id === deal.listing.sellerId ? "SELLER" : null;
  const open = deal.status === "ACTIVE" || deal.status === "ON_HOLD";
  const facts = factsOf(deal);
  const blockers = blockersToAdvance(facts);
  const to = nextStage(facts.stage);
  const partiesVisible = buyerCanSeePlotCode(deal.stage, deal.contracts);
  const codeVisible = side !== "BUYER" || partiesVisible;
  const filesVisible = side !== "BUYER" || buyerCanSeeFiles(deal.stage, deal.contracts);
  const team = manager ? await db.user.findMany({ where: { role: { in: ["BROKER", "LAWYER", "AGENT"] } }, orderBy: { name: "asc" } }) : [];
  const neededContracts = (CONTRACT_FOR_STAGE[deal.stage] ?? []).filter((t) => !deal.contracts.some((c) => c.type === t && c.status !== "VOID"));
  const plot = deal.listing.plot;
  const ref = deal.id.slice(-6).toUpperCase();

  const docs = [
    ...deal.documents.map((d) => ({ ...d, scope: "deal" as const })),
    ...deal.listing.documents.filter((d) => d.type !== "SITE_PHOTO").map((d) => ({ ...d, uploadedBy: null, scope: "listing" as const })),
  ];

  return (
    <>
      <PageHeader
        crumbs={[
          { href: `/${locale}/${staff ? "broker?tab=deals" : "account"}`, label: staff ? L("الصفقات", "Deals") : L("حسابي", "My account") },
          { href: `/${locale}/deals/${id}`, label: `#${ref}` },
        ]}
        title={L(`غرفة الصفقة #${ref}`, `Deal room #${ref}`)}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <Badge tone={toneOf(deal.status)}>{label(DEAL_STATUS, deal.status, locale)}</Badge>
            {label(CITY, plot.city, locale)} — {plot.district} · {num(plot.areaSqm, locale)} {L("م²", "m²")}
            {codeVisible && (
              <span dir="ltr" className="border border-navy-soft px-1.5 text-sm">
                {plot.code}
              </span>
            )}
          </span>
        }
      />
      <Container className="flex flex-col gap-6">
        {sp.new && <Notice tone="green">{L("اهتمامك اتسجل، والوسيط هيكلمك على واتساب لاتفاق العمولة.", "Your interest is registered. The broker will contact you on WhatsApp about the commission agreement.")}</Notice>}
        {sp.err && (
          <Notice tone="red">
            {sp.err in BLOCKER_TEXT ? BLOCKER_TEXT[sp.err as Blocker][locale === "ar" ? 0 : 1] : L("الطلب ما اتنفذش — اتأكد من البيانات وصلاحيتك.", "That action didn't go through — check the details and your permissions.")}
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
                    {BLOCKER_TEXT[b][locale === "ar" ? 0 : 1]}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-ok">{L("كل الشروط اتحققت.", "All conditions are met.")}</p>
            )}
            {manager && (
              <form action={advanceStage.bind(null, locale, id)}>
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
                manager &&
                open &&
                neededContracts.map((t) => (
                  <form key={t} action={createContract.bind(null, locale, id, t)}>
                    <button className={`${btn.small} border border-brand text-brand`}>
                      + {label(CONTRACT_TYPE, t, locale)}
                    </button>
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
                    return (
                      <li key={c.id} className="flex flex-col gap-2 py-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-semibold">
                            {label(CONTRACT_TYPE, c.type, locale)} <span className="text-xs text-muted">{c.templateVersion}</span>
                          </span>
                          <Badge tone={toneOf(c.status)}>{label(CONTRACT_STATUS, c.status, locale)}</Badge>
                        </div>
                        <div className="flex flex-wrap gap-3 text-sm text-muted">
                          {needs.map((r) => {
                            const s = sigs.find((x) => x.role === r);
                            return (
                              <span key={r}>
                                {r === "BUYER" ? L("المشتري", "Buyer") : L("البائع", "Seller")}:{" "}
                                {s ? <span className="text-ok">✓ {date(s.signedAt, locale)}</span> : L("لسه", "pending")}
                              </span>
                            );
                          })}
                          {c.approvedBy && <span>{L(`اعتمده ${c.approvedBy.name}`, `Approved by ${c.approvedBy.name}`)}</span>}
                          {c.pdfDocumentId && <FileLink id={c.pdfDocumentId}>PDF</FileLink>}
                        </div>
                        {open && (
                          <div className="flex flex-wrap gap-2">
                            {lawyer && c.status === "PENDING_LAWYER" && (
                              <form action={lawyerDecision.bind(null, locale, id, c.id)} className="flex flex-wrap items-end gap-2">
                                <input name="notes" placeholder={L("ملاحظات المحامي", "Lawyer notes")} className={`${field} w-56`} />
                                <button name="decision" value="APPROVED" className={`${btn.small} bg-ok text-white`}>
                                  {L("اعتماد", "Approve")}
                                </button>
                                <button name="decision" value="CHANGES_REQUESTED" className={`${btn.small} border border-[#8A5A00] text-[#8A5A00]`}>
                                  {L("طلب تعديل", "Request changes")}
                                </button>
                              </form>
                            )}
                            {manager && c.status === "DRAFT" && (
                              <form action={resubmitContract.bind(null, locale, id, c.id)}>
                                <button className={`${btn.small} border border-brand text-brand`}>{L("ابعت للمحامي تاني", "Resend to lawyer")}</button>
                              </form>
                            )}
                            {manager && c.status === "APPROVED" && (
                              <form action={sendForSignature.bind(null, locale, id, c.id)}>
                                <button className={`${btn.small} bg-brand text-white`}>{L("ابعت للتوقيع الإلكتروني", "Send for e-signature")}</button>
                              </form>
                            )}
                            {c.status === "SENT_FOR_SIGNATURE" && mySig && (
                              <form action={signContract.bind(null, locale, id, c.id)}>
                                <button className={`${btn.small} bg-brand text-white`}>{L("وقّع إلكترونياً", "Sign electronically")}</button>
                              </form>
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
              {!filesVisible && (
                <Notice tone="amber">{L("ملفات القطعة بتتفتح لك بعد توقيع العقد المبدئي.", "Plot files open to you after the preliminary contract is signed.")}</Notice>
              )}
              {docs.length === 0 ? (
                <Empty>{L("مفيش مستندات.", "No documents.")}</Empty>
              ) : (
                <ul className="flex flex-col divide-y divide-line">
                  {docs.map((d) => (
                    <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                      <span className="flex flex-col">
                        {filesVisible || d.ownerId === me.id ? <FileLink id={d.id}>{label(DOC_TYPE, d.type, locale)}</FileLink> : <span>{label(DOC_TYPE, d.type, locale)}</span>}
                        <span className="text-xs text-muted">
                          {d.scope === "listing" ? L("ورق القطعة", "Plot papers") : d.uploadedBy?.name} · {date(d.createdAt, locale)}
                          {d.version > 1 && ` · v${d.version}`}
                        </span>
                      </span>
                      <Badge tone={toneOf(d.status)}>{label(DOC_STATUS, d.status, locale)}</Badge>
                    </li>
                  ))}
                </ul>
              )}
              {open && (
                <form action={uploadDealDocument.bind(null, locale, id)} className="flex flex-wrap items-end gap-2 border-t border-line pt-3">
                  <label className={`${labelCls} min-w-44 flex-1`}>
                    {L("نوع المستند", "Document type")}
                    <select name="type" className={field}>
                      {["TRANSFER_RECEIPT", "AUTHORITY_STATEMENT", "POWER_OF_ATTORNEY", "SITE_PHOTO", "PAYMENT_RECEIPT", "OTHER"].map((t) => (
                        <option key={t} value={t}>
                          {label(DOC_TYPE, t, locale)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className={`${labelCls} min-w-44 flex-1`}>
                    {L("الملف", "File")}
                    <input name="file" type="file" required accept="application/pdf,image/*" className="border border-dashed border-line p-2" />
                  </label>
                  <button className={btn.secondary}>{L("ارفع", "Upload")}</button>
                </form>
              )}
            </Card>

            <Card title={L("سجل الصفقة", "Deal log")}>
              {open && (
                <form action={addNote.bind(null, locale, id)} className="flex gap-2">
                  <input name="note" placeholder={L("اكتب ملاحظة للفريق والأطراف", "Write a note for the team and parties")} className={field} />
                  <button className={btn.secondary}>{L("أضف", "Add")}</button>
                </form>
              )}
              <ol className="flex flex-col gap-3 border-s-2 border-line ps-4">
                {deal.events.map((e) => {
                  const data = (e.data ?? {}) as Record<string, unknown>;
                  return (
                    <li key={e.id} className="flex flex-col gap-0.5">
                      <span className="font-semibold">
                        {label(DEAL_EVENT, e.type, locale)}
                        {e.toStage && ` → ${label(DEAL_STAGE, e.toStage, locale)}`}
                        {typeof data.type === "string" && ` · ${label(data.type in CONTRACT_TYPE ? CONTRACT_TYPE : DOC_TYPE, data.type, locale)}`}
                      </span>
                      {typeof data.note === "string" && <span>{data.note}</span>}
                      {typeof data.notes === "string" && data.notes && <span>{data.notes}</span>}
                      <span className="text-xs text-muted">
                        {e.actor?.name ?? L("النظام", "System")} · {dateTime(e.createdAt, locale)}
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
                  [L("المشتري", "Buyer"), side === "SELLER" && !partiesVisible ? L("بيظهر بعد اتفاق العمولة", "Shown after commission agreement") : deal.buyer.name],
                  [L("البائع", "Seller"), side === "BUYER" && !partiesVisible ? L("بيظهر بعد اتفاق العمولة", "Shown after commission agreement") : deal.listing.seller.name],
                  [L("الوسيط", "Broker"), deal.broker?.name ?? "—"],
                  [L("المحامي", "Lawyer"), deal.lawyer?.name ?? "—"],
                  [L("المندوب", "Field agent"), deal.agent?.name ?? "—"],
                ]}
              />
              {manager && open && (
                <form action={assignTeam.bind(null, locale, id)} className="flex flex-col gap-2 border-t border-line pt-3">
                  {(["brokerId", "lawyerId", "agentId"] as const).map((k) => {
                    const role = k === "brokerId" ? "BROKER" : k === "lawyerId" ? "LAWYER" : "AGENT";
                    return (
                      <label key={k} className={labelCls}>
                        {k === "brokerId" ? L("الوسيط", "Broker") : k === "lawyerId" ? L("المحامي", "Lawyer") : L("المندوب", "Field agent")}
                        <select name={k} defaultValue={deal[k] ?? ""} className={field}>
                          <option value="">—</option>
                          {team
                            .filter((u) => u.role === role)
                            .map((u) => (
                              <option key={u.id} value={u.id}>
                                {u.name}
                              </option>
                            ))}
                        </select>
                      </label>
                    );
                  })}
                  <button className={btn.secondary}>{L("حفظ الفريق", "Save team")}</button>
                </form>
              )}
            </Card>

            <Card title={L("السعر", "Price")}>
              <DL
                items={[
                  [L("السعر المطلوب", "Asking price"), money(deal.listing.price, deal.listing.currency, locale)],
                  [L("السعر المتفق", "Agreed price"), deal.agreedPrice ? money(deal.agreedPrice, deal.agreedCurrency, locale) : "—"],
                  [
                    L("سعر الصرف المثبّت", "Locked FX rate"),
                    deal.lockedUsdEgpRate ? `${num(deal.lockedUsdEgpRate, locale, 2)} (${date(deal.exchangeRate?.date, locale)})` : "—",
                  ],
                ]}
              />
              {manager && open && ["COMMISSION_AGREEMENT", "PRICE_AGREED"].includes(deal.stage) && (
                <form action={setAgreedPrice.bind(null, locale, id)} className="flex items-end gap-2">
                  <label className={`${labelCls} flex-1`}>
                    {L("السعر المتفق (ج.م)", "Agreed price (EGP)")}
                    <input name="price" type="number" min={1} required defaultValue={deal.agreedPrice ? toNum(deal.agreedPrice) : undefined} className={field} />
                  </label>
                  <button className={btn.secondary}>{L("سجّل وثبّت الصرف", "Save and lock FX")}</button>
                </form>
              )}
            </Card>

            <Card title={L("العربون", "Deposit")}>
              <p className="text-sm text-muted">{L("الفلوس نفسها في حساب ضمان عند البنك، والمنصة بتتابع الحالة بس.", "The money sits in a bank escrow account; the platform only tracks its status.")}</p>
              {deal.deposits.map((d) => (
                <div key={d.id} className="flex flex-col gap-2 border-t border-line pt-2">
                  <div className="flex items-center justify-between gap-2">
                    <strong>{money(d.amount, d.currency, locale)}</strong>
                    <Badge tone={toneOf(d.escrowStatus)}>{label(ESCROW_STATUS, d.escrowStatus, locale)}</Badge>
                  </div>
                  <div className="text-xs text-muted">
                    {d.bankReference && <span dir="ltr">{d.bankReference} · </span>}
                    {d.receiptDocument ? <FileLink id={d.receiptDocument.id}>{L("إيصال التحويل", "Transfer receipt")}</FileLink> : L("مفيش إيصال لسه", "No receipt yet")}
                  </div>
                  {(finance || manager) && open && (
                    <div className="flex flex-wrap gap-1.5">
                      {d.escrowStatus === "AWAITING_TRANSFER" && (
                        <form action={setDepositStatus.bind(null, locale, id, d.id, "HELD")}>
                          <button className={`${btn.small} border border-ok text-ok`}>{L("البنك أكّد الاستلام", "Bank confirmed")}</button>
                        </form>
                      )}
                      {d.escrowStatus === "HELD" && deal.stage === "AUTHORITY_APPROVED" && (
                        <form action={setDepositStatus.bind(null, locale, id, d.id, "RELEASED_TO_SELLER")}>
                          <button className={`${btn.small} border border-ok text-ok`}>{L("اصرف للبائع", "Release to seller")}</button>
                        </form>
                      )}
                      {d.escrowStatus === "HELD" && (
                        <form action={setDepositStatus.bind(null, locale, id, d.id, "REFUNDED_TO_BUYER")}>
                          <button className={`${btn.small} border border-[#A32020] text-[#A32020]`}>{L("رد للمشتري", "Refund buyer")}</button>
                        </form>
                      )}
                    </div>
                  )}
                </div>
              ))}
              {(finance || manager) && open && ["PRICE_AGREED", "PRELIMINARY_CONTRACT"].includes(deal.stage) && (
                <form action={recordDeposit.bind(null, locale, id)} className="flex items-end gap-2 border-t border-line pt-3">
                  <label className={`${labelCls} flex-1`}>
                    {L("مبلغ العربون (ج.م)", "Deposit amount (EGP)")}
                    <input
                      name="amount"
                      type="number"
                      min={1}
                      required
                      defaultValue={deal.agreedPrice ? Math.round(toNum(deal.agreedPrice) * 0.1) : undefined}
                      className={field}
                    />
                  </label>
                  <button className={btn.secondary}>{L("سجّل عربون", "Record deposit")}</button>
                </form>
              )}
            </Card>

            {deal.commission && (staff || side) && (
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
                {finance && (
                  <div className="flex flex-wrap gap-1.5">
                    {(["INVOICED", "PAID", "WAIVED"] as const)
                      .filter((s) => s !== deal.commission!.status)
                      .map((s) => (
                        <form key={s} action={setCommissionStatus.bind(null, locale, id, s)}>
                          <button className={`${btn.small} border border-line`}>{label(COMMISSION_STATUS, s, locale)}</button>
                        </form>
                      ))}
                  </div>
                )}
              </Card>
            )}

            {manager && open && (
              <Card title={L("حالة الصفقة", "Deal status")}>
                <div className="flex flex-wrap gap-2">
                  {deal.status === "ACTIVE" ? (
                    <form action={setDealStatus.bind(null, locale, id, "ON_HOLD")}>
                      <button className={btn.secondary}>{L("وقّف مؤقتاً", "Put on hold")}</button>
                    </form>
                  ) : (
                    <form action={setDealStatus.bind(null, locale, id, "ACTIVE")}>
                      <button className={btn.secondary}>{L("رجّعها شغالة", "Resume")}</button>
                    </form>
                  )}
                  <form action={setDealStatus.bind(null, locale, id, "CANCELLED")} className="flex w-full flex-wrap gap-2">
                    <input name="reason" required placeholder={L("سبب الإلغاء (بيظهر للطرفين)", "Reason (shown to both sides)")} className={`${field} flex-1`} />
                    <button className={btn.danger}>{L("إلغاء الصفقة", "Cancel deal")}</button>
                  </form>
                </div>
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
