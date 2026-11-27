import Link from "next/link";
import { notFound } from "next/navigation";
import { isLocale } from "@/i18n/config";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { can, dealCtx, subject } from "@/lib/authz";
import { errorText } from "@/lib/errors";
import { PAYOUT_ERRORS, decryptIban } from "@/lib/bank";
import { audit } from "@/lib/audit";
import { date, money, num, toNum, tr } from "@/lib/format";
import { heldTotalAt, monthEnd, reconcileDiff } from "@/lib/reconcile";
import { CITY, COMMISSION_STATUS, DEAL_STAGE, DEAL_STATUS, label, toneOf } from "@/lib/labels";
import { Badge, Card, Container, Empty, FileLink, Notice, PageHeader, Stat, Table, Tabs, btn, field, labelCls } from "@/components/ui";
import { ConfirmButton } from "@/components/ConfirmButton";
import { confirmDeposit, setCommissionStatus, settleDeposit } from "../deals/actions";
import { pageMeta } from "@/lib/meta";
import { decideBankAccount, payReferral, saveReconciliation } from "./actions";

type Props = { params: Promise<{ locale: string }>; searchParams: Promise<{ tab?: string; status?: string; err?: string; ok?: string }> };

const FIN_ERRORS: Record<string, [string, string]> = {
  self: ["ما ينفعش تتحقق من حسابك أنت.", "You can't verify your own account."],
  reason: ["اكتب سبب الرفض.", "Write a rejection reason."],
  name_check: ["الاسم مش مطابق — لازم تأكد إنك راجعته يدوياً.", "The name doesn't match — confirm you checked it manually."],
  ...Object.fromEntries(Object.entries(PAYOUT_ERRORS).map(([k, v]) => [`payout_${k}`, v])),
  bank_ref: ["اكتب رقم مرجع البنك (4 حروف على الأقل).", "Enter the bank reference (at least 4 characters)."],
  reference: ["اكتب مرجع التحصيل (3 حروف على الأقل).", "Enter the collection reference (at least 3 characters)."],
  approval_pending: ["فيه طلب صرف مستني موافقة الأدمن.", "A payout request is already awaiting admin approval."],
  reconcile: ["اختار الشهر واكتب رقم كشف البنك.", "Choose the month and enter the bank statement figure."],
};
const FIN_OK: Record<string, [string, string]> = {
  settled: ["اتنفذ واتسجل في سجل التدقيق.", "Done and recorded in the audit log."],
  bank: ["قرار الحساب البنكي اتسجل وصاحبه اتبلّغ.", "Bank account decision saved and the owner notified."],
  approval_requested: ["المبلغ فوق حد الأربع عيون — اتبعت طلب موافقة للأدمن.", "Above the four-eyes limit — an approval request was sent to the admin."],
  commission: ["حالة العمولة اتحدّثت.", "Commission status updated."],
  matched: ["المطابقة سليمة — رقم البنك = رقم النظام.", "Reconciled — the bank figure matches the system."],
  diff: ["اتسجلت المطابقة وفيه فرق — راجع الجدول.", "Reconciliation saved with a difference — see the table."],
};

/** OPS-01 — شاشة المالية: العرابين، العمولات، والمطابقة الشهرية */
export const generateMetadata = ({ params }: { params: Promise<{ locale: string }> }) => pageMeta(params, "المالية", "Finance", { noindex: true });

export default async function FinancePage({ params, searchParams }: Props) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();
  const locale = raw;
  const sp = await searchParams;
  const L = tr(locale);
  const ar = locale === "ar";
  const me = await requireUser(locale, `/${locale}/finance`, ["FINANCE", "ADMIN"]);
  const tab = ["deposits", "commissions", "referrals", "reconcile", "banks"].includes(sp.tab ?? "") ? sp.tab! : "deposits";
  const base = `/${locale}/finance`;

  const pendingBanks = await db.bankAccount.count({ where: { status: "PENDING" } });
  const [awaiting, held, pendingApprovals, due] = await Promise.all([
    db.deposit.count({ where: { escrowStatus: "AWAITING_TRANSFER" } }),
    db.deposit.aggregate({ where: { escrowStatus: "HELD" }, _sum: { amount: true }, _count: true }),
    db.paymentApproval.count({ where: { status: "PENDING" } }),
    db.commission.findMany({ where: { status: { in: ["PENDING", "INVOICED"] } }, select: { sellerAmount: true, buyerAmount: true } }),
  ]);
  const dueTotal = due.reduce((s, c) => s + toNum(c.sellerAmount) + toNum(c.buyerAmount), 0);

  return (
    <>
      <PageHeader title={L("المالية", "Finance")} subtitle={L("العرابين، العمولات، والمطابقة الشهرية مع البنك. كل فعل بتأكيد ومتسجل.", "Deposits, commissions and the monthly bank reconciliation. Every action is confirmed and logged.")} />
      <Container className="flex flex-col gap-6">
        {sp.err && <Notice tone="red">{errorText(sp.err, ar, FIN_ERRORS)}</Notice>}
        {sp.ok && FIN_OK[sp.ok] && <Notice tone={sp.ok === "diff" || sp.ok === "approval_requested" ? "amber" : "green"}>{FIN_OK[sp.ok][ar ? 0 : 1]}</Notice>}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label={L("عرابين مستنية تأكيد البنك", "Deposits awaiting bank confirmation")} value={num(awaiting, locale)} href={`${base}?tab=deposits`} />
          <Stat label={L("محفوظ في البنك", "Held at the bank")} value={money(held._sum.amount ?? 0, "EGP", locale)} hint={L(`${num(held._count, locale)} عربون`, `${held._count} deposits`)} />
          <Stat label={L("طلبات صرف مستنية الأدمن", "Payouts awaiting admin")} value={num(pendingApprovals, locale)} />
          <Stat label={L("عمولات مستحقة", "Commission due")} value={money(dueTotal, "EGP", locale)} href={`${base}?tab=commissions`} />
        </div>
        <Tabs
          current={tab}
          tabs={[
            { key: "deposits", label: L("العرابين", "Deposits"), href: `${base}?tab=deposits`, count: awaiting },
            { key: "commissions", label: L("العمولات", "Commissions"), href: `${base}?tab=commissions` },
            { key: "referrals", label: L("مكافآت الإحالة", "Referral rewards"), href: `${base}?tab=referrals` },
            { key: "reconcile", label: L("المطابقة الشهرية", "Monthly reconciliation"), href: `${base}?tab=reconcile` },
            { key: "banks", label: L("حسابات بانتظار التحقق", "Accounts awaiting verification"), href: `${base}?tab=banks`, count: pendingBanks },
          ]}
        />
        {tab === "deposits" && <Deposits />}
        {tab === "referrals" && <Referrals />}
        {tab === "commissions" && <Commissions />}
        {tab === "reconcile" && <Reconcile />}
        {tab === "banks" && <Banks />}
      </Container>
    </>
  );

  async function Deposits() {
    const rows = await db.deposit.findMany({
      where: { escrowStatus: { in: ["AWAITING_TRANSFER", "HELD"] } },
      include: {
        approvals: { where: { status: "PENDING" } },
        deal: { include: { listing: { include: { plot: true } }, contracts: { select: { type: true, status: true } }, documents: { select: { type: true, status: true } }, events: { where: { type: "CANCELLED" } } } },
      },
      orderBy: { createdAt: "asc" },
    });
    const ret = `${base}?tab=deposits`;
    if (rows.length === 0) return <Empty>{L("مفيش عرابين مستنية أي فعل.", "No deposits need action.")}</Empty>;
    return (
      <Table head={[L("الصفقة", "Deal"), L("المبلغ", "Amount"), L("الحالة", "Status"), L("الإجراء", "Action")]}>
        {rows.map((d) => {
          const ctx = { deal: dealCtx(d.deal) };
          const c = (a: "deposit.confirm" | "deposit.release" | "deposit.refund") => can(subject(me), a, ctx);
          const confirm = c("deposit.confirm");
          const release = c("deposit.release");
          const refund = c("deposit.refund");
          const amount = money(d.amount, d.currency, locale);
          return (
            <tr key={d.id}>
              <td>
                <Link href={`/${locale}/deals/${d.dealId}`} className="font-semibold text-brand">
                  #{d.dealId.slice(-6).toUpperCase()} · {label(CITY, d.deal.listing.plot.city, locale)}
                </Link>
                <div className="text-xs text-muted">
                  {label(DEAL_STAGE, d.deal.stage, locale)} · {label(DEAL_STATUS, d.deal.status, locale)}
                </div>
              </td>
              <td className="font-semibold">{amount}</td>
              <td>
                {d.escrowStatus === "AWAITING_TRANSFER" ? (
                  <Badge tone="amber">{L("إيصال مرفوع، مستني تأكيد البنك", "Receipt uploaded, awaiting bank confirmation")}</Badge>
                ) : (
                  <Badge tone="green">
                    {L("محفوظ في البنك", "Held at the bank")} {d.bankReference && <span dir="ltr">· {d.bankReference}</span>}
                  </Badge>
                )}
                {d.approvals.length > 0 && <div className="mt-1 text-xs text-[#8A5A00]">{L("طلب صرف مستني موافقة الأدمن", "Payout awaiting admin approval")}</div>}
              </td>
              <td>
                {d.escrowStatus === "AWAITING_TRANSFER" && confirm.allowed && (
                  <form action={confirmDeposit.bind(null, locale, d.dealId, d.id)} className="flex flex-wrap items-center gap-1.5">
                    <input type="hidden" name="returnTo" value={ret} />
                    <input aria-label={L("رقم مرجع البنك", "Bank reference")} name="bankReference" required minLength={4} placeholder={L("رقم مرجع البنك", "Bank reference")} dir="ltr" className={`${field} min-h-9 w-40`} />
                    {confirm.override && <input aria-label={L("سبب تدخّل الأدمن", "Admin override reason")} name="overrideReason" required minLength={5} placeholder={L("سبب تدخّل الأدمن", "Admin override reason")} className={`${field} min-h-9 w-44`} />}
                    <ConfirmButton message={L(`تأكيد وصول ${amount} للبنك؟`, `Confirm ${amount} arrived at the bank?`)} className={`${btn.small} bg-ok text-white`}>
                      {L("أكّد الوصول", "Confirm arrival")}
                    </ConfirmButton>
                  </form>
                )}
                {d.escrowStatus === "HELD" && d.approvals.length === 0 && (release.allowed || refund.allowed) && (
                  <div className="flex flex-wrap gap-1.5">
                    {release.allowed && (
                      <form action={settleDeposit.bind(null, locale, d.dealId, d.id, "RELEASED_TO_SELLER")} className="flex flex-wrap gap-1">
                        <input type="hidden" name="returnTo" value={ret} />
                        <input aria-label={L("مصاريف التحويل الفعلية — على المستلم (ج.م)", "Actual transfer fee — paid by the recipient (EGP)")} name="payoutFeeEgp" type="number" min={0} step="0.01" placeholder={L("مصاريف التحويل (ج.م)", "Transfer fee (EGP)")} className={`${field} min-h-9 w-32`} />
                        {release.override && <input aria-label={L("سبب تدخّل الأدمن", "Admin override reason")} name="overrideReason" required minLength={5} placeholder={L("سبب تدخّل الأدمن", "Admin override reason")} className={`${field} min-h-9 w-44`} />}
                        <ConfirmButton message={L(`صرف ${amount} للبائع؟ الفعل ده مش بيترجع.`, `Release ${amount} to the seller? This can't be undone.`)} className={`${btn.small} bg-brand text-white`}>
                          {L("صرف للبائع", "Release to seller")}
                        </ConfirmButton>
                      </form>
                    )}
                    {refund.allowed && (
                      <form action={settleDeposit.bind(null, locale, d.dealId, d.id, "REFUNDED_TO_BUYER")} className="flex flex-wrap gap-1">
                        <input type="hidden" name="returnTo" value={ret} />
                        <input aria-label={L("مصاريف التحويل الفعلية — على المستلم (ج.م)", "Actual transfer fee — paid by the recipient (EGP)")} name="payoutFeeEgp" type="number" min={0} step="0.01" placeholder={L("مصاريف التحويل (ج.م)", "Transfer fee (EGP)")} className={`${field} min-h-9 w-32`} />
                        {refund.override && <input aria-label={L("سبب تدخّل الأدمن", "Admin override reason")} name="overrideReason" required minLength={5} placeholder={L("سبب تدخّل الأدمن", "Admin override reason")} className={`${field} min-h-9 w-44`} />}
                        <ConfirmButton message={L(`رد ${amount} للمشتري؟ الفعل ده مش بيترجع.`, `Refund ${amount} to the buyer? This can't be undone.`)} className={`${btn.small} border border-[#A32020] text-[#A32020]`}>
                          {L("رد للمشتري", "Refund to buyer")}
                        </ConfirmButton>
                      </form>
                    )}
                  </div>
                )}
                {d.escrowStatus === "HELD" && !release.allowed && !refund.allowed && d.approvals.length === 0 && (
                  <span className="text-xs text-muted">{L("الصرف بعد قفل الصفقة واعتماد خطاب الجهاز، والرد لو اتلغت لسبب يستحق الرد.", "Release after closing with the approval letter; refund if cancelled for a refundable reason.")}</span>
                )}
              </td>
            </tr>
          );
        })}
      </Table>
    );
  }

  async function Commissions() {
    const status = ["PENDING", "INVOICED", "PAID", "WAIVED"].includes(sp.status ?? "") ? sp.status! : undefined;
    const rows = await db.commission.findMany({
      where: status ? { status: status as never } : {},
      include: { deal: { include: { listing: { include: { plot: true } } } } },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    const ret = `${base}?tab=commissions${status ? `&status=${status}` : ""}`;
    const today = new Date().toISOString().slice(0, 10);
    return (
      <Card
        title={L("العمولات", "Commissions")}
        actions={
          <a href={`/api/finance/commissions${status ? `?status=${status}` : ""}`} className={`${btn.small} border border-brand text-brand`}>
            {L("تصدير CSV", "Export CSV")}
          </a>
        }
      >
        <nav className="flex flex-wrap gap-1.5">
          {[undefined, "PENDING", "INVOICED", "PAID", "WAIVED"].map((s) => (
            <Link key={s ?? "all"} href={`${base}?tab=commissions${s ? `&status=${s}` : ""}`} className={`inline-flex min-h-9 items-center border px-2.5 text-sm ${s === status ? "border-navy bg-navy text-white" : "border-line"}`}>
              {s ? label(COMMISSION_STATUS, s, locale) : L("الكل", "All")}
            </Link>
          ))}
        </nav>
        {rows.length === 0 ? (
          <Empty>{L("مفيش عمولات.", "No commissions.")}</Empty>
        ) : (
          <Table head={[L("الصفقة", "Deal"), L("المبلغ", "Amount"), L("الحالة", "Status"), L("التحصيل", "Collection")]}>
            {rows.map((r) => {
              const total = toNum(r.sellerAmount) + toNum(r.buyerAmount);
              return (
                <tr key={r.id}>
                  <td>
                    <Link href={`/${locale}/deals/${r.dealId}`} className="font-semibold text-brand">
                      #{r.dealId.slice(-6).toUpperCase()} · {label(CITY, r.deal.listing.plot.city, locale)}
                    </Link>
                    <div className="text-xs text-muted">{label(DEAL_STAGE, r.deal.stage, locale)}</div>
                  </td>
                  <td>
                    {money(total, r.currency, locale)}
                    <div className="text-xs text-muted">
                      {L("بائع", "Seller")} {num(r.sellerRatePct, locale, 2)}% · {L("مشتري", "Buyer")} {num(r.buyerRatePct, locale, 2)}%
                    </div>
                  </td>
                  <td>
                    <Badge tone={toneOf(r.status)}>{label(COMMISSION_STATUS, r.status, locale)}</Badge>
                    {r.paidAt && (
                      <div className="text-xs text-muted">
                        {date(r.paidAt, locale)} {r.paymentRef && <span dir="ltr">· {r.paymentRef}</span>}
                      </div>
                    )}
                  </td>
                  <td>
                    {(r.status === "PENDING" || r.status === "INVOICED") && total > 0 && (
                      <form action={setCommissionStatus.bind(null, locale, r.dealId, "PAID")} className="flex flex-wrap items-center gap-1.5">
                        <input type="hidden" name="returnTo" value={ret} />
                        <input name="paidOn" type="date" defaultValue={today} max={today} required className={`${field} min-h-9 w-40`} aria-label={L("تاريخ التحصيل", "Collection date")} />
                        <input aria-label={L("مرجع التحويل/الإيصال", "Transfer / receipt ref")} name="reference" required minLength={3} placeholder={L("مرجع التحويل/الإيصال", "Transfer / receipt ref")} dir="ltr" className={`${field} min-h-9 w-40`} />
                        {me.role === "ADMIN" && <input aria-label={L("سبب تدخّل الأدمن", "Admin override reason")} name="overrideReason" required minLength={5} placeholder={L("سبب تدخّل الأدمن", "Admin override reason")} className={`${field} min-h-9 w-44`} />}
                        <ConfirmButton message={L(`تسجيل تحصيل ${money(total, r.currency, locale)}؟`, `Record collection of ${money(total, r.currency, locale)}?`)} className={`${btn.small} bg-ok text-white`}>
                          {L("اتحصّلت", "Collected")}
                        </ConfirmButton>
                      </form>
                    )}
                  </td>
                </tr>
              );
            })}
          </Table>
        )}
      </Card>
    );
  }

  /** MKT-06: مكافآت الإحالة المستحقة — المالي بيصرفها بمرجع */
  async function Referrals() {
    const rows = await db.referralReward.findMany({ include: { referrer: { select: { name: true, phone: true } }, referred: { select: { name: true } } }, orderBy: [{ status: "asc" }, { createdAt: "desc" }], take: 200 });
    if (rows.length === 0) return <Empty>{L("مفيش مكافآت إحالة لسه.", "No referral rewards yet.")}</Empty>;
    return (
      <Table head={[L("صاحب الإحالة", "Referrer"), L("المُحال", "Referred"), L("الصفقة", "Deal"), L("المبلغ", "Amount"), L("الحالة", "Status")]}>
        {rows.map((r) => (
          <tr key={r.id}>
            <td>
              {r.referrer.name}
              <div dir="ltr" className="text-xs text-muted">
                {r.referrer.phone}
              </div>
            </td>
            <td>{r.referred.name}</td>
            <td>
              <Link href={`/${locale}/deals/${r.dealId}`} className="text-brand">
                #{r.dealId.slice(-6).toUpperCase()}
              </Link>
            </td>
            <td className="font-semibold">{money(r.amount, "EGP", locale)}</td>
            <td>
              {r.status === "PAID" ? (
                <Badge tone="green">
                  {L("اتصرفت", "Paid")} {r.paidAt && `· ${date(r.paidAt, locale)}`} {r.paymentRef && <span dir="ltr">· {r.paymentRef}</span>}
                </Badge>
              ) : (
                <form action={payReferral.bind(null, locale, r.id)} className="flex flex-wrap items-center gap-1.5">
                  <input name="reference" required minLength={3} dir="ltr" placeholder={L("مرجع التحويل", "Transfer ref")} aria-label={L("مرجع التحويل", "Transfer ref")} className={`${field} min-h-9 w-36`} />
                  <ConfirmButton message={L(`صرف ${money(r.amount, "EGP", locale)} لـ ${r.referrer.name}؟`, `Pay ${money(r.amount, "EGP", locale)} to ${r.referrer.name}?`)} className={`${btn.small} bg-ok text-white`}>
                    {L("اتصرفت", "Mark paid")}
                  </ConfirmButton>
                </form>
              )}
            </td>
          </tr>
        ))}
      </Table>
    );
  }

  /** BANK-01: الرقم كامل للمالية بس، وكل عرض بيتسجل في سجل التدقيق */
  async function Banks() {
    const rows = await db.bankAccount.findMany({ where: { status: "PENDING" }, orderBy: { createdAt: "asc" }, include: { user: { select: { name: true, phone: true } }, proofDocument: { select: { id: true } } } });
    for (const r of rows) await audit(me.id, "bank.view_full", "BankAccount", r.id);
    return (
      <Card title={L("حسابات بانتظار التحقق", "Accounts awaiting verification")}>
        {rows.length === 0 ? (
          <p className="text-muted">{L("مفيش حسابات مستنية.", "Nothing waiting.")}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-line">
            {rows.map((r) => (
              <li key={r.id} className="flex flex-col gap-2 py-3 text-sm">
                <span className="font-semibold">
                  {r.user.name} — {r.bankName} · {r.currency}
                </span>
                <span dir="ltr" className="text-start tabular-nums">
                  {decryptIban(r.ibanEnc).replace(/(.{4})/g, "$1 ")} {r.swiftBic ? `· ${r.swiftBic}` : ""}
                </span>
                <span>
                  {L("صاحب الحساب", "Holder")}: {r.holderName}{" "}
                  {r.nameMatches ? <Badge tone="green">{L("مطابق للاسم الموثّق", "Matches verified name")}</Badge> : <Badge tone="red">{L("مش مطابق — راجع يدوياً", "Mismatch — review manually")}</Badge>}
                </span>
                <span>{r.proofDocument ? <FileLink id={r.proofDocument.id}>{L("إثبات الملكية", "Proof of ownership")}</FileLink> : <span className="text-[#A32020]">{L("مفيش إثبات ملكية", "No proof uploaded")}</span>}</span>
                <form action={decideBankAccount.bind(null, locale, r.id)} className="flex flex-wrap items-end gap-2">
                  {!r.nameMatches && (
                    <label className="flex min-h-11 items-center gap-2">
                      <input type="checkbox" name="nameChecked" className="size-5" /> {L("راجعت الاسم يدوياً مع إثبات الملكية", "I checked the name against the proof")}
                    </label>
                  )}
                  <input name="reason" placeholder={L("سبب الرفض", "Rejection reason")} aria-label={L("سبب الرفض", "Rejection reason")} className={`${field} min-h-11 w-56`} />
                  <button name="decision" value="VERIFIED" className={`${btn.small} bg-ok text-white`}>{L("تحقق", "Verify")}</button>
                  <button name="decision" value="REJECTED" className={`${btn.small} border border-[#A32020] text-[#A32020]`}>{L("ارفض", "Reject")}</button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </Card>
    );
  }

  async function Reconcile() {
    const thisMonth = new Date().toISOString().slice(0, 7);
    const prev = new Date();
    prev.setUTCDate(1);
    prev.setUTCMonth(prev.getUTCMonth() - 1);
    const lastMonth = prev.toISOString().slice(0, 7);
    const [deposits, history] = await Promise.all([
      db.deposit.findMany({ where: { currency: "EGP" }, select: { amount: true, heldAt: true, settledAt: true } }),
      db.reconciliation.findMany({ include: { enteredBy: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 24 }),
    ]);
    const lite = deposits.map((d) => ({ amount: toNum(d.amount), heldAt: d.heldAt, settledAt: d.settledAt }));
    return (
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title={L("مطابقة شهر", "Reconcile a month")}>
          <p className="text-sm text-muted">
            {L("النظام بيحسب إجمالي العرابين اللي كانت محفوظة في البنك آخر الشهر، وإنت بتكتب الرقم من كشف حساب الضمان.", "The system totals deposits held at the bank at month end; you enter the figure from the escrow account statement.")}
          </p>
          <DlRow k={L(`محفوظ آخر ${lastMonth}`, `Held at end of ${lastMonth}`)} v={money(heldTotalAt(lite, monthEnd(lastMonth)), "EGP", locale)} />
          <DlRow k={L(`محفوظ دلوقتي (${thisMonth})`, `Held now (${thisMonth})`)} v={money(heldTotalAt(lite, new Date()), "EGP", locale)} />
          <form action={saveReconciliation.bind(null, locale)} className="flex flex-wrap items-end gap-2">
            <label className={labelCls}>
              {L("الشهر", "Month")}
              <input name="month" type="month" required defaultValue={lastMonth} max={thisMonth} className={`${field} w-44`} />
            </label>
            <label className={labelCls}>
              {L("رقم كشف البنك (ج.م)", "Bank statement figure (EGP)")}
              <input name="bankTotal" type="number" min={0} step="0.01" required className={`${field} w-48`} />
            </label>
            <label className={`${labelCls} w-full`}>
              {L("ملاحظة (اختياري)", "Note (optional)")}
              <input name="note" className={field} />
            </label>
            <ConfirmButton message={L("تسجيل المطابقة؟", "Save this reconciliation?")} className={btn.primary}>
              {L("سجّل المطابقة", "Save reconciliation")}
            </ConfirmButton>
          </form>
        </Card>
        <Card title={L("سجل المطابقات", "Reconciliation history")}>
          {history.length === 0 ? (
            <Empty>{L("لسه مفيش مطابقات.", "No reconciliations yet.")}</Empty>
          ) : (
            <Table head={[L("الشهر", "Month"), L("النظام", "System"), L("البنك", "Bank"), L("الفرق", "Difference"), L("بواسطة", "By")]}>
              {history.map((h) => {
                const { diff, matched } = reconcileDiff(toNum(h.systemTotal), toNum(h.bankTotal));
                return (
                  <tr key={h.id}>
                    <td dir="ltr" className="text-start">
                      {h.month}
                    </td>
                    <td>{money(h.systemTotal, "EGP", locale)}</td>
                    <td>{money(h.bankTotal, "EGP", locale)}</td>
                    <td>
                      <Badge tone={matched ? "green" : "red"}>{matched ? L("مطابق", "Matched") : money(diff, "EGP", locale)}</Badge>
                      {h.note && <div className="text-xs text-muted">{h.note}</div>}
                    </td>
                    <td className="text-xs">
                      {h.enteredBy.name}
                      <div className="text-muted">{date(h.createdAt, locale)}</div>
                    </td>
                  </tr>
                );
              })}
            </Table>
          )}
        </Card>
      </div>
    );
  }
}

function DlRow({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between border-b border-line py-1.5 text-sm">
      <span className="text-muted">{k}</span>
      <span className="font-semibold">{v}</span>
    </div>
  );
}
