import "server-only";
import { redirect } from "next/navigation";
import type { Prisma, User } from "@prisma/client";
import { audit } from "../audit";
import { stageIndex } from "../deal-machine";
import { can, type Action, type Ctx, type Decision, type Subject } from "./policy";

export { can } from "./policy";
export type { Action, Ctx } from "./policy";

/** مستخدم قاعدة البيانات → الشكل اللي السياسة بتفهمه */
export function subject(u: User | null): Subject {
  return u ? { id: u.id, role: u.role, accountLevel: u.accountLevel, status: u.status } : null;
}

const PLOT_REQUIRED = ["ALLOCATION_LETTER", "PAYMENT_RECEIPT", "AUTHORITY_STATEMENT"] as const;
type DocLite = { type: string; status: string };
type ContractLite = { type: string; status: string };

/** سياق العرض: الإسناد + هل الورق المطلوب كله معتمد + أعلى مرحلة صفقة شغالة */
export function listingCtx(l: {
  sellerId: string;
  submittedById?: string | null;
  assignedBrokerId?: string | null;
  assignedLawyerId?: string | null;
  status: string;
  documents?: DocLite[];
  deals?: { stage: string; status: string }[];
}): NonNullable<Ctx["listing"]> {
  const current = (l.documents ?? []).filter((d) => d.status !== "SUPERSEDED");
  return {
    sellerId: l.sellerId,
    submittedById: l.submittedById,
    assignedBrokerId: l.assignedBrokerId,
    assignedLawyerId: l.assignedLawyerId,
    status: l.status,
    requiredDocsApproved: PLOT_REQUIRED.every((t) => current.some((d) => d.type === t && d.status === "APPROVED")),
    maxActiveDealStage: Math.max(-1, ...(l.deals ?? []).filter((d) => d.status === "ACTIVE" || d.status === "ON_HOLD").map((d) => stageIndex(d.stage))),
  };
}

const signedByBoth = (cs: (ContractLite & { signatures?: unknown })[], type: string) => cs.some((c) => c.type === type && c.status === "SIGNED");

/** سياق الصفقة من صفقة محمّلة */
export function dealCtx(d: {
  buyerId: string;
  brokerId?: string | null;
  lawyerId?: string | null;
  agentId?: string | null;
  stage: string;
  status: string;
  buyerPriceOkAt?: Date | null;
  sellerPriceOkAt?: Date | null;
  listing: { sellerId: string; submittedById?: string | null };
  contracts?: ContractLite[];
  documents?: DocLite[];
  events?: { type: string; data: Prisma.JsonValue }[];
}): NonNullable<Ctx["deal"]> {
  const cancelReason = d.events?.find((e) => e.type === "CANCELLED")?.data as { reason?: string } | undefined;
  return {
    buyerId: d.buyerId,
    sellerId: d.listing.sellerId,
    submittedById: d.listing.submittedById,
    brokerId: d.brokerId,
    lawyerId: d.lawyerId,
    agentId: d.agentId,
    stage: d.stage,
    status: d.status,
    commissionSigned: signedByBoth(d.contracts ?? [], "COMMISSION_AGREEMENT"),
    prelimSigned: signedByBoth(d.contracts ?? [], "PRELIMINARY_CONTRACT"),
    priceConfirmed: !!d.buyerPriceOkAt && !!d.sellerPriceOkAt,
    approvalLetterApproved: (d.documents ?? []).some((x) => x.type === "AUTHORITY_STATEMENT" && x.status === "APPROVED"),
    filingReceiptUploaded: (d.documents ?? []).some((x) => x.type === "FILING_RECEIPT" && x.status !== "REJECTED"),
    refundable: ["authority_refused", "seller_withdrew", "documents_invalid"].includes(cancelReason?.reason ?? ""),
  };
}

const withQuery = (path: string, q: string) => `${path}${path.includes("?") ? "&" : "?"}${q}`;

/**
 * الحماية في كل server action: لو مرفوض → يتسجل في التدقيق ويرجع بـ err=forbidden.
 * لو الأدمن بيتدخل في شغل دور تاني → لازم سبب مكتوب، ويتسجل «تدخّل أدمن».
 */
export async function authorize(user: User | null, action: Action, ctx: Ctx, opts: { back: string; reason?: string | null }): Promise<Decision> {
  const d = can(subject(user), action, ctx);
  if (!d.allowed) {
    await audit(user?.id ?? null, "authz.denied", "Action", action, { reason: d.reason ?? "forbidden", back: opts.back });
    redirect(withQuery(opts.back, `err=${d.reason === "last_admin" ? "last_admin" : "forbidden"}`));
  }
  if (d.override) {
    const reason = opts.reason?.trim();
    if (!reason || reason.length < 5) redirect(withQuery(opts.back, "err=reason_required"));
    await audit(user!.id, "admin.override", "Action", action, { reason, back: opts.back });
  }
  return d;
}

/** سبب تدخّل الأدمن من الفورم (حقل overrideReason) */
export const overrideReason = (form?: FormData | null) => (form ? String(form.get("overrideReason") ?? "") : "");
