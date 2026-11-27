import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "./db";
import { toNum } from "./format";
import { txRows, type TxRow } from "./transactions";

/** TXN-02: تحميل الصفقات وتحويلها لصفوف حركات مالية */
export async function loadTx(where: Prisma.DealWhereInput, viewerId: string | null, now = new Date()): Promise<TxRow[]> {
  const deals = await db.deal.findMany({ where, include: { listing: { select: { sellerId: true } }, deposits: true, commission: true }, orderBy: { createdAt: "desc" }, take: 2000 });
  return deals
    .flatMap((d) =>
      txRows(
        {
          id: d.id,
          buyerId: d.buyerId,
          sellerId: d.listing.sellerId,
          status: d.status,
          stage: d.stage,
          deposits: d.deposits.map((x) => ({ id: x.id, amount: toNum(x.amount), currency: x.currency, escrowStatus: x.escrowStatus, bankReference: x.bankReference, createdAt: x.createdAt, heldAt: x.heldAt, settledAt: x.settledAt, payoutNetEgp: x.payoutNetEgp ? toNum(x.payoutNetEgp) : null })),
          commission: d.commission ? { sellerAmount: toNum(d.commission.sellerAmount), buyerAmount: toNum(d.commission.buyerAmount), status: d.commission.status, createdAt: d.commission.createdAt } : null,
        },
        viewerId,
        now,
      ),
    )
    .sort((a, b) => b.date.getTime() - a.date.getTime());
}
