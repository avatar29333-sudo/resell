import "server-only";
import type { Prisma, User } from "@prisma/client";

// PERM-02 — تقييد الاستعلامات: القوايم نفسها ما ترجعش بيانات مش مسموحة (مش بس صفحة التفاصيل).
// كل دالة بترجع where لـ Prisma. NONE = مفيش نتايج.
const NONE = { id: "__none__" };

/** الصفقات اللي المستخدم يشوفها (5.4) */
export function scopeDealsFor(u: User | null, opts: { brokersCanReadAll?: boolean } = {}): Prisma.DealWhereInput {
  if (!u) return NONE;
  switch (u.role) {
    case "ADMIN":
    case "BROKER_LEAD":
    case "FINANCE":
      return {};
    case "BROKER":
      return opts.brokersCanReadAll ? {} : { brokerId: u.id };
    case "LAWYER":
      return { lawyerId: u.id };
    case "AGENT":
      return { agentId: u.id, stage: { in: ["TRANSFER_FILED", "AUTHORITY_APPROVED", "CLOSED"] } };
    case "PARTNER_BROKER":
      return { OR: [{ buyerId: u.id }, { listing: { sellerId: u.id } }, { listing: { submittedById: u.id } }] };
    default:
      return { OR: [{ buyerId: u.id }, { listing: { sellerId: u.id } }] };
  }
}

/** العروض الخاصة (مش منشورة) اللي المستخدم يشوفها */
export function scopePrivateListingsFor(u: User | null): Prisma.ListingWhereInput {
  if (!u) return NONE;
  switch (u.role) {
    case "ADMIN":
    case "BROKER_LEAD":
      return {};
    case "BROKER":
      return { assignedBrokerId: u.id };
    case "LAWYER":
      return { OR: [{ assignedLawyerId: u.id }, { deals: { some: { lawyerId: u.id } } }] };
    case "PARTNER_BROKER":
      return { OR: [{ sellerId: u.id }, { submittedById: u.id }] };
    case "CLIENT":
      return { sellerId: u.id };
    default:
      return NONE;
  }
}

/** طلبات الخدمة (5.7) */
export function scopeServiceRequestsFor(u: User | null): Prisma.ServiceRequestWhereInput {
  if (!u) return NONE;
  switch (u.role) {
    case "ADMIN":
    case "BROKER":
    case "BROKER_LEAD":
      return {};
    case "AGENT":
      return { assignedToId: u.id };
    default:
      return { OR: [{ requesterId: u.id }, { contactPhone: u.phone }] };
  }
}

/** طابور التوثيق (KYC): الوسيط ما يشوفش نفسه ولا أطراف صفقاته المسندة (7.3) */
export function scopeKycQueueFor(u: User | null): Prisma.KycProfileWhereInput {
  if (!u) return NONE;
  if (u.role === "ADMIN") return { status: "PENDING" };
  if (u.role !== "BROKER" && u.role !== "BROKER_LEAD") return NONE;
  return {
    status: "PENDING",
    userId: { not: u.id },
    user: {
      dealsAsBuyer: { none: { brokerId: u.id, status: { in: ["ACTIVE", "ON_HOLD"] } } },
      listings: { none: { deals: { some: { brokerId: u.id, status: { in: ["ACTIVE", "ON_HOLD"] } } } } },
    },
  };
}

/** المستخدمين: الأدمن بس */
export function scopeUsersFor(u: User | null): Prisma.UserWhereInput {
  return u?.role === "ADMIN" ? {} : NONE;
}

/** سجل التدقيق: الأدمن الكل، والمالي أحداث الفلوس بس */
export function scopeAuditFor(u: User | null): Prisma.AuditLogWhereInput {
  if (u?.role === "ADMIN") return {};
  if (u?.role === "FINANCE")
    return { OR: [{ action: { startsWith: "deal.deposit" } }, { action: { startsWith: "deposit." } }, { action: { startsWith: "commission." } }, { action: { startsWith: "payment." } }, { action: { startsWith: "fx." } }] };
  return { action: "__none__" };
}
