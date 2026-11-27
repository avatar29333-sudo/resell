import "server-only";
import type { User } from "@prisma/client";
import { db } from "./db";
import { STAFF_ROLES } from "./auth";
import { type DealFacts, type Stage } from "./deal-machine";
import { can, dealCtx, listingCtx, subject } from "./authz";
import type { Ctx } from "./authz/policy";
import { audit } from "./audit";
import { getSetting } from "./settings";

export const isStaff = (u: User | null) => !!u && STAFF_ROLES.includes(u.role);

const KYC_TYPES = ["NATIONAL_ID", "PASSPORT", "SELFIE"];

/**
 * مين يقدر يفتح مستند — كل القرار من سياسة الصلاحيات (SEC-06 / PERM-01).
 * صور الهوية: الأدمن + الوسيط وهو بيراجع التوثيق. باقي المستندات: حسب العلاقة والمرحلة.
 */
export async function canViewDocument(user: User | null, docId: string) {
  const doc = await db.document.findUnique({
    where: { id: docId },
    include: {
      listing: { include: { documents: { select: { type: true, status: true } }, deals: { select: { stage: true, status: true } } } },
      deal: { include: { contracts: true, documents: { select: { type: true, status: true } }, listing: true, events: { where: { type: "CANCELLED" } } } },
    },
  });
  if (!doc) return null;
  // صور الموقع المعتمدة لعرض منشور = صور تسويقية، أي حد يشوفها
  if (doc.type === "SITE_PHOTO" && doc.status === "APPROVED" && ["PUBLISHED", "IN_DEAL"].includes(doc.listing?.status ?? "")) return doc;
  if (!user) return null;

  const base: Ctx = { document: { type: doc.type, ownerId: doc.ownerId, uploadedById: doc.uploadedById, status: doc.status } };
  if (doc.listing) base.listing = listingCtx(doc.listing);

  // ملفات الهوية: مربوطة بملف توثيق
  if (KYC_TYPES.includes(doc.type)) {
    const kyc = await db.kycProfile.findFirst({ where: { OR: [{ idDocumentId: doc.id }, { selfieDocumentId: doc.id }] } });
    const targetId = kyc?.userId ?? doc.ownerId;
    base.target = { id: targetId, kycPending: kyc?.status === "PENDING" };
    // تعارض مصالح (7.3): الوسيط اللي عنده صفقة شغالة الشخص ده طرف فيها
    if (user && (user.role === "BROKER" || user.role === "BROKER_LEAD")) {
      base.conflict = !!(await db.deal.findFirst({
        where: { brokerId: user.id, status: { in: ["ACTIVE", "ON_HOLD"] }, OR: [{ buyerId: targetId }, { listing: { sellerId: targetId } }] },
        select: { id: true },
      }));
    }
  }

  const contexts: Ctx[] = [];
  if (doc.deal) contexts.push({ ...base, deal: dealCtx(doc.deal) });
  // مستند قطعة: نجرب كل صفقة المستخدم طرف فيها على نفس العرض
  if (doc.listingId && !doc.deal) {
    const deals = await db.deal.findMany({
      where: { listingId: doc.listingId, OR: [{ buyerId: user.id }, { brokerId: user.id }, { lawyerId: user.id }, { agentId: user.id }] },
      include: { contracts: true, documents: { select: { type: true, status: true } }, listing: true, events: { where: { type: "CANCELLED" } } },
    });
    for (const d of deals) contexts.push({ ...base, deal: dealCtx(d) });
  }
  contexts.push(base);

  if (contexts.some((c) => can(subject(user), "document.view", c).allowed)) return doc;
  await audit(user.id, "authz.denied", "Document", doc.id, { action: "document.view", type: doc.type });
  return null;
}

export type LoadedDeal = NonNullable<Awaited<ReturnType<typeof loadDeal>>>;

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
    hasAuthorityApprovalDoc: deal.documents.some((d) => d.type === "AUTHORITY_STATEMENT" && d.status === "APPROVED"),
    hasFilingReceipt: deal.documents.some((d) => d.type === "FILING_RECEIPT" && d.status !== "REJECTED"),
    priceConfirmed: !!deal.buyerPriceOkAt && !!deal.sellerPriceOkAt,
  };
}

async function loadDeal(dealId: string) {
  return db.deal.findUnique({
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
      deposits: { orderBy: { createdAt: "asc" }, include: { receiptDocument: true, approvals: { where: { status: "PENDING" } } } },
      commission: true,
      events: { orderBy: { createdAt: "desc" }, include: { actor: true } },
    },
  });
}

/** مين يدخل غرفة الصفقة — حسب السياسة (deal.view) */
export async function loadDealFor(user: User, dealId: string) {
  const deal = await loadDeal(dealId);
  if (!deal) return null;
  const brokersCanReadAll = user.role === "BROKER" && (await getSetting("deals.unassignedBrokers")).access === "read";
  const allowed = can(subject(user), "deal.view", { deal: dealCtx(deal), brokersCanReadAll }).allowed;
  if (!allowed) {
    await audit(user.id, "authz.denied", "Deal", dealId, { action: "deal.view" });
    return null;
  }
  return deal;
}

/** TXN-01: بيانات «وضوح المعاملة» من الصفقة المحمّلة */
export function overviewOf(deal: LoadedDeal): import("./deal-overview").OverviewInput {
  const f = factsOf(deal);
  const n = (v: unknown) => (v == null ? null : Number(String(v)));
  const entered = [...deal.events].filter((e) => e.type === "STAGE_CHANGED" && e.toStage === deal.stage).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0]?.createdAt;
  return {
    ...f,
    proposedPrice: n(deal.proposedPrice),
    buyerPriceOkAt: deal.buyerPriceOkAt,
    sellerPriceOkAt: deal.sellerPriceOkAt,
    contracts: deal.contracts.map((c) => ({ id: c.id, type: c.type, status: c.status, signatures: ((c.signatures as { role: string }[] | null) ?? []).map((s) => ({ role: s.role })) })),
    deposits: deal.deposits.map((d) => ({ id: d.id, amount: n(d.amount) ?? 0, escrowStatus: d.escrowStatus, buyerSentAt: d.buyerSentAt, sellerReceivedAt: d.sellerReceivedAt, bankReference: d.bankReference, heldAt: d.heldAt, settledAt: d.settledAt })),
    stageEnteredAt: entered ?? deal.createdAt,
  };
}
