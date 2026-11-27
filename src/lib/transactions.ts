/**
 * TXN-02 — «معاملاتي»: كل الحركات المالية في الصفقات كصفوف موحّدة (منطق نقي، متغطي باختبار).
 * الاتجاه من منظور المستخدم: دفعت / استلمت / محجوز. للمالية: نفس الصفوف لكل المنصة.
 */
export type Direction = "PAID" | "RECEIVED" | "HELD";
export type TxStatus = "DUE" | "PAID" | "HELD" | "RELEASED" | "REFUNDED";
export type TxRow = { date: Date; dealId: string; item: string; amount: number; currency: string; direction: Direction | null; status: TxStatus; ref: string | null; overdue: boolean };

type DepositIn = { id: string; amount: number; currency: string; escrowStatus: string; bankReference: string | null; createdAt: Date; heldAt: Date | null; settledAt: Date | null; payoutNetEgp: number | null };
type CommissionIn = { sellerAmount: number; buyerAmount: number; status: string; createdAt: Date; paidAt?: Date | null } | null;
export type DealIn = { id: string; buyerId: string; sellerId: string; status: string; stage: string; deposits: DepositIn[]; commission: CommissionIn };

/** مهلة تحويل العربون (أيام) وتحصيل العمولة بعد الإغلاق — بعدها بيتعلّم «متأخر» */
export const DEPOSIT_DUE_DAYS = 7;
export const COMMISSION_DUE_DAYS = 14;

export function txRows(deal: DealIn, viewerId: string | null, now: Date): TxRow[] {
  const rows: TxRow[] = [];
  const side = viewerId === deal.buyerId ? "BUYER" : viewerId === deal.sellerId ? "SELLER" : null;
  for (const d of deal.deposits) {
    const status: TxStatus = d.escrowStatus === "HELD" ? "HELD" : d.escrowStatus === "RELEASED_TO_SELLER" ? "RELEASED" : d.escrowStatus === "REFUNDED_TO_BUYER" ? "REFUNDED" : "DUE";
    let direction: Direction | null = null;
    if (side === "BUYER") direction = status === "DUE" ? null : status === "HELD" ? "HELD" : status === "REFUNDED" ? "RECEIVED" : "PAID";
    if (side === "SELLER") direction = status === "RELEASED" ? "RECEIVED" : status === "HELD" ? "HELD" : null;
    if (side === "SELLER" && (status === "DUE" || status === "REFUNDED")) continue; // البائع ما لوش علاقة بعربون لسه ما اتدفعش أو اترد
    const overdue = status === "DUE" && deal.status === "ACTIVE" && now.getTime() - d.createdAt.getTime() > DEPOSIT_DUE_DAYS * 86_400_000;
    rows.push({ date: d.settledAt ?? d.heldAt ?? d.createdAt, dealId: deal.id, item: status === "REFUNDED" ? "رد العربون" : status === "RELEASED" ? "صرف العربون" : "العربون", amount: status === "RELEASED" || status === "REFUNDED" ? (d.payoutNetEgp ?? d.amount) : d.amount, currency: d.currency, direction, status, ref: d.bankReference, overdue });
  }
  const c = deal.commission;
  if (c) {
    const closed = deal.status === "COMPLETED" || deal.stage === "CLOSED";
    const due = c.status === "PENDING" || c.status === "INVOICED";
    const overdue = due && closed && now.getTime() - c.createdAt.getTime() > COMMISSION_DUE_DAYS * 86_400_000;
    const status: TxStatus = c.status === "PAID" ? "PAID" : "DUE";
    if (c.status !== "WAIVED") {
      // كل طرف بيشوف عمولته بس
      if (side !== "BUYER") rows.push({ date: c.paidAt ?? c.createdAt, dealId: deal.id, item: "عمولة البائع", amount: c.sellerAmount, currency: "EGP", direction: side === "SELLER" && status === "PAID" ? "PAID" : null, status, ref: null, overdue });
      if (side !== "SELLER") rows.push({ date: c.paidAt ?? c.createdAt, dealId: deal.id, item: "عمولة المشتري", amount: c.buyerAmount, currency: "EGP", direction: side === "BUYER" && status === "PAID" ? "PAID" : null, status, ref: null, overdue });
    }
  }
  return rows;
}

export function totals(rows: TxRow[]) {
  const sum = (dir: Direction) => rows.filter((r) => r.direction === dir && r.currency === "EGP").reduce((a, r) => a + r.amount, 0);
  return { paid: sum("PAID"), received: sum("RECEIVED"), held: sum("HELD") };
}
