import "server-only";
import type { User } from "@prisma/client";
import { db } from "./db";
import { STAFF_ROLES } from "./auth";
import { buyerCanSeeFiles, type DealFacts, type Stage } from "./deal-machine";

export const isStaff = (u: User | null) => !!u && STAFF_ROLES.includes(u.role);

/** مين يقدر يفتح مستند — بيتفحص في الخادم قبل ما الملف يطلع */
export async function canViewDocument(user: User | null, docId: string) {
  const doc = await db.document.findUnique({
    where: { id: docId },
    include: { listing: true, deal: { include: { contracts: true } } },
  });
  if (!doc) return null;
  // صور الموقع المعتمدة لعرض منشور = صور تسويقية، أي حد يشوفها
  if (doc.type === "SITE_PHOTO" && doc.status === "APPROVED" && ["PUBLISHED", "IN_DEAL"].includes(doc.listing?.status ?? "")) return doc;
  if (!user) return null;
  if (isStaff(user) || doc.ownerId === user.id || doc.uploadedById === user.id) return doc;

  // المشتري: ملفات القطعة بعد العقد المبدئي بس
  const listingId = doc.listingId ?? doc.deal?.listingId;
  if (listingId) {
    const deals = await db.deal.findMany({
      where: { listingId, buyerId: user.id, status: { in: ["ACTIVE", "ON_HOLD", "COMPLETED"] } },
      include: { contracts: true },
    });
    if (deals.some((d) => buyerCanSeeFiles(d.stage, d.contracts))) return doc;
  }
  // البائع يشوف مستندات صفقات قطعته
  if (doc.deal) {
    const listing = await db.listing.findUnique({ where: { id: doc.deal.listingId } });
    if (listing?.sellerId === user.id || doc.deal.buyerId === user.id) return doc;
  }
  return null;
}

export type LoadedDeal = NonNullable<Awaited<ReturnType<typeof loadDealFor>>>;

/** الحقايق اللي محتاجها الـ state machine من صفقة محمّلة */
export function factsOf(deal: LoadedDeal): DealFacts {
  return {
    stage: deal.stage as Stage,
    status: deal.status,
    hasBroker: !!deal.brokerId,
    hasAgent: !!deal.agentId,
    agreedPrice: deal.agreedPrice ? Number(deal.agreedPrice.toString()) : null,
    contracts: deal.contracts.map((c) => ({ type: c.type, status: c.status })),
    deposits: deal.deposits.map((d) => ({ escrowStatus: d.escrowStatus })),
    hasAuthorityApprovalDoc: deal.documents.some((d) => d.type === "AUTHORITY_STATEMENT" && d.status !== "REJECTED"),
  };
}

/** مين يدخل غرفة الصفقة */
export async function loadDealFor(user: User, dealId: string) {
  const deal = await db.deal.findUnique({
    where: { id: dealId },
    include: {
      listing: { include: { plot: true, seller: true, documents: { where: { status: { not: "SUPERSEDED" } } } } },
      buyer: true,
      broker: true,
      lawyer: true,
      agent: true,
      exchangeRate: true,
      contracts: { orderBy: { createdAt: "asc" }, include: { approvedBy: true } },
      documents: { orderBy: { createdAt: "desc" }, include: { uploadedBy: true } },
      deposits: { orderBy: { createdAt: "asc" }, include: { receiptDocument: true } },
      commission: true,
      events: { orderBy: { createdAt: "desc" }, include: { actor: true } },
    },
  });
  if (!deal) return null;
  const allowed = isStaff(user) || deal.buyerId === user.id || deal.listing.sellerId === user.id;
  return allowed ? deal : null;
}
