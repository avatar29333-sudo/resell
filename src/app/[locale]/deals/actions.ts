"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ContractType, DealEventType, DocumentType, EscrowStatus, Prisma, Role, User } from "@prisma/client";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requireUser } from "@/lib/auth";
import { factsOf, loadDealFor } from "@/lib/access";
import { blockersToAdvance, nextStage, requiredSigners, type Stage } from "@/lib/deal-machine";
import { fileFromForm, saveFile } from "@/lib/storage";
import { getSetting, templateVersion } from "@/lib/settings";
import { latestRate } from "@/lib/listing";
import { makePdf } from "@/lib/pdf";
import { toNum } from "@/lib/format";
import { isLocale, type Locale } from "@/i18n/config";

type Deal = NonNullable<Awaited<ReturnType<typeof loadDealFor>>>;

const loc = (l: string): Locale => (isLocale(l) ? l : "ar");
const MANAGERS: Role[] = ["ADMIN", "BROKER"];

async function ctx(locale: string, dealId: string, roles?: Role[]) {
  const l = loc(locale);
  const user = await requireUser(l, `/${l}/deals/${dealId}`);
  const deal = await loadDealFor(user, dealId);
  if (!deal) redirect(`/${l}/account?denied=1`);
  if (roles && !roles.includes(user.role)) redirect(`/${l}/deals/${dealId}?err=role`);
  return { l, user, deal };
}

async function event(deal: Deal, user: User, type: DealEventType, data?: Prisma.InputJsonValue, stages?: { from: Stage; to: Stage }) {
  await db.dealEvent.create({
    data: { dealId: deal.id, type, actorId: user.id, data, fromStage: stages?.from, toStage: stages?.to },
  });
  await audit(user.id, `deal.${type.toLowerCase()}`, "Deal", deal.id, data);
}

const done = (l: string, id: string, q = "") => {
  revalidatePath(`/${l}/deals/${id}`);
  redirect(`/${l}/deals/${id}${q}`);
};

export async function advanceStage(locale: string, dealId: string) {
  const { l, user, deal } = await ctx(locale, dealId, MANAGERS);
  const blockers = blockersToAdvance(factsOf(deal));
  const to = nextStage(deal.stage as Stage);
  if (blockers.length || !to) done(l, dealId, `?err=${blockers[0] ?? "last_stage"}`);

  await db.deal.update({
    where: { id: dealId },
    data: {
      stage: to!,
      stageChangedAt: new Date(),
      ...(to === "CLOSED" ? { status: "COMPLETED", closedAt: new Date() } : {}),
    },
  });
  if (to === "PRICE_AGREED" || to === "PRELIMINARY_CONTRACT") await db.listing.update({ where: { id: deal.listingId }, data: { status: "IN_DEAL" } });
  if (to === "CLOSED") {
    await db.listing.update({ where: { id: deal.listingId }, data: { status: "SOLD" } });
    if (deal.commission) await db.commission.update({ where: { id: deal.commission.id }, data: { status: "INVOICED" } });
    // باقي الصفقات على نفس القطعة بتتقفل، ويتسجل السبب عشان المشتري يعرف
    const others = await db.deal.findMany({ where: { listingId: deal.listingId, id: { not: dealId }, status: { in: ["ACTIVE", "ON_HOLD"] } } });
    for (const o of others) {
      await db.deal.update({ where: { id: o.id }, data: { status: "CANCELLED" } });
      await db.dealEvent.create({ data: { dealId: o.id, type: "CANCELLED", actorId: user.id, data: { reason: "sold_to_other" } } });
      await db.contract.updateMany({ where: { dealId: o.id, status: { not: "SIGNED" } }, data: { status: "VOID" } });
    }
  }
  await event(deal, user, "STAGE_CHANGED", undefined, { from: deal.stage as Stage, to: to! });
  done(l, dealId);
}

/** الوسيط بيسجّل السعر المتفق → سعر الصرف بيتثبت والعمولة بتتحسب بنسب النهارده */
export async function setAgreedPrice(locale: string, dealId: string, form: FormData) {
  const { l, user, deal } = await ctx(locale, dealId, MANAGERS);
  const price = Number(form.get("price"));
  if (!(price > 0)) done(l, dealId, "?err=price");
  const rate = await latestRate();
  const rates = await getSetting("commission.rates");
  await db.deal.update({
    where: { id: dealId },
    data: { agreedPrice: price, agreedCurrency: "EGP", lockedUsdEgpRate: rate?.sell, exchangeRateId: rate?.id },
  });
  const commission = {
    sellerRatePct: rates.sellerPct,
    buyerRatePct: rates.buyerPct,
    sellerAmount: Math.round((price * rates.sellerPct) / 100),
    buyerAmount: Math.round((price * rates.buyerPct) / 100),
  };
  if (deal.commission) await db.commission.update({ where: { id: deal.commission.id }, data: commission });
  else await db.commission.create({ data: { dealId, ...commission } });
  await event(deal, user, "NOTE", { agreedPrice: price, lockedRate: rate ? toNum(rate.sell) : null });
  done(l, dealId);
}

export async function createContract(locale: string, dealId: string, type: ContractType) {
  const { l, user, deal } = await ctx(locale, dealId, MANAGERS);
  if (deal.contracts.some((c) => c.type === type && c.status !== "VOID")) done(l, dealId);
  const c = await db.contract.create({
    data: { dealId, type, templateVersion: await templateVersion(type), status: "PENDING_LAWYER" },
  });
  await event(deal, user, "CONTRACT_UPDATED", { contractId: c.id, type, status: "PENDING_LAWYER" });
  done(l, dealId);
}

export async function lawyerDecision(locale: string, dealId: string, contractId: string, form: FormData) {
  const { l, user, deal } = await ctx(locale, dealId, ["LAWYER", "ADMIN"]);
  const contract = deal.contracts.find((c) => c.id === contractId);
  if (!contract || contract.status !== "PENDING_LAWYER") done(l, dealId);
  const decision = form.get("decision") === "APPROVED" ? "APPROVED" : "CHANGES_REQUESTED";
  const notes = String(form.get("notes") ?? "").trim() || null;
  await db.review.create({
    data: {
      contractId,
      lawyerId: user.id,
      decision,
      notes,
      checklist: [
        { key: "parties", label: "بيانات الأطراف مطابقة للهويات", passed: true },
        { key: "plot", label: "بيانات القطعة مطابقة لخطاب التخصيص", passed: true },
        { key: "authority", label: "التصرف معلّق على موافقة الجهاز", passed: decision === "APPROVED" },
      ],
    },
  });
  await db.contract.update({
    where: { id: contractId },
    data: decision === "APPROVED" ? { status: "APPROVED", approvedById: user.id, approvedAt: new Date() } : { status: "DRAFT" },
  });
  await event(deal, user, "CONTRACT_UPDATED", { contractId, type: contract!.type, decision, notes });
  done(l, dealId);
}

export async function resubmitContract(locale: string, dealId: string, contractId: string) {
  const { l, user, deal } = await ctx(locale, dealId, MANAGERS);
  const contract = deal.contracts.find((c) => c.id === contractId);
  if (!contract || contract.status !== "DRAFT") done(l, dealId);
  await db.contract.update({ where: { id: contractId }, data: { status: "PENDING_LAWYER" } });
  await event(deal, user, "CONTRACT_UPDATED", { contractId, type: contract!.type, status: "PENDING_LAWYER" });
  done(l, dealId);
}

export async function sendForSignature(locale: string, dealId: string, contractId: string) {
  const { l, user, deal } = await ctx(locale, dealId, MANAGERS);
  const contract = deal.contracts.find((c) => c.id === contractId);
  if (!contract || contract.status !== "APPROVED") done(l, dealId);
  await db.contract.update({
    where: { id: contractId },
    data: { status: "SENT_FOR_SIGNATURE", providerEnvelopeId: `DEMO-${contractId.slice(-8).toUpperCase()}` },
  });
  await event(deal, user, "CONTRACT_UPDATED", { contractId, type: contract!.type, status: "SENT_FOR_SIGNATURE" });
  done(l, dealId);
}

type Signature = { userId: string; role: "BUYER" | "SELLER"; signedAt: string; providerRef: string };

/** التوقيع — في التجربة زرار؛ على الإنتاج بيروح لمزوّد التوقيع المرخّص */
export async function signContract(locale: string, dealId: string, contractId: string) {
  const { l, user, deal } = await ctx(locale, dealId);
  const contract = deal.contracts.find((c) => c.id === contractId);
  if (!contract || contract.status !== "SENT_FOR_SIGNATURE") done(l, dealId);
  const side = user.id === deal.buyerId ? "BUYER" : user.id === deal.listing.sellerId ? "SELLER" : null;
  if (!side || !requiredSigners(contract!.type).includes(side)) done(l, dealId, "?err=role");
  const sigs = (contract!.signatures as Signature[]) ?? [];
  if (sigs.some((s) => s.role === side)) done(l, dealId);
  const all = [...sigs, { userId: user.id, role: side!, signedAt: new Date().toISOString(), providerRef: `DEMO-SIG-${Date.now()}` }];
  const complete = requiredSigners(contract!.type).every((r) => all.some((s) => s.role === r));

  let pdfDocumentId: string | undefined;
  if (complete) {
    const pdf = makePdf(`Resell - ${contract!.type.replace(/_/g, " ")}`, [
      `# Contract ${contract!.id.slice(-8).toUpperCase()}  (template ${contract!.templateVersion})`,
      `Plot: ${deal.listing.plot.city} / ${deal.listing.plot.code}`,
      `Area: ${toNum(deal.listing.plot.areaSqm)} m2`,
      deal.agreedPrice ? `Agreed price: EGP ${toNum(deal.agreedPrice).toLocaleString("en-US")}` : "",
      "",
      "# Signatures",
      ...all.map((s) => `${s.role}: user ${s.userId.slice(-6)} - ${s.signedAt} - ${s.providerRef}`),
      "",
      "Subject to prior approval of the city authority for any transfer.",
    ]);
    const s = await saveFile(pdf, "application/pdf", "contracts");
    const doc = await db.document.create({
      data: {
        type: "CONTRACT_PDF",
        ownerId: deal.listing.sellerId,
        uploadedById: user.id,
        dealId,
        storageKey: s.key,
        sha256: s.sha256,
        sizeBytes: s.sizeBytes,
        fileName: `${contract!.type.toLowerCase()}-${contract!.id.slice(-6)}.pdf`,
        mimeType: "application/pdf",
        status: "APPROVED",
      },
    });
    pdfDocumentId = doc.id;
  }
  await db.contract.update({
    where: { id: contractId },
    data: { signatures: all, ...(complete ? { status: "SIGNED", signedAt: new Date(), pdfDocumentId } : {}) },
  });
  await event(deal, user, "CONTRACT_UPDATED", { contractId, type: contract!.type, signedBy: side, complete });
  done(l, dealId);
}

export async function recordDeposit(locale: string, dealId: string, form: FormData) {
  const { l, user, deal } = await ctx(locale, dealId, ["ADMIN", "BROKER", "FINANCE"]);
  const amount = Number(form.get("amount"));
  if (!(amount > 0)) done(l, dealId, "?err=amount");
  const d = await db.deposit.create({ data: { dealId, amount, currency: "EGP" } });
  await event(deal, user, "DEPOSIT_UPDATED", { depositId: d.id, amount, status: "AWAITING_TRANSFER" });
  done(l, dealId);
}

export async function setDepositStatus(locale: string, dealId: string, depositId: string, status: EscrowStatus) {
  const { l, user, deal } = await ctx(locale, dealId, ["ADMIN", "FINANCE", "BROKER"]);
  const dep = deal.deposits.find((x) => x.id === depositId);
  if (!dep) done(l, dealId);
  await db.deposit.update({
    where: { id: depositId },
    data: {
      escrowStatus: status,
      ...(status === "HELD" ? { heldAt: new Date(), bankReference: dep!.bankReference ?? `ESC-${Date.now().toString().slice(-7)}` } : {}),
      ...(status === "RELEASED_TO_SELLER" || status === "REFUNDED_TO_BUYER" ? { settledAt: new Date() } : {}),
    },
  });
  await event(deal, user, "DEPOSIT_UPDATED", { depositId, status });
  done(l, dealId);
}

export async function setCommissionStatus(locale: string, dealId: string, status: "PENDING" | "INVOICED" | "PAID" | "WAIVED") {
  const { l, user, deal } = await ctx(locale, dealId, ["ADMIN", "FINANCE"]);
  if (!deal.commission) done(l, dealId);
  await db.commission.update({ where: { id: deal.commission!.id }, data: { status, ...(status === "PAID" ? { paidAt: new Date() } : {}) } });
  await audit(user.id, "commission.status", "Commission", deal.commission!.id, { status });
  done(l, dealId);
}

const DEAL_DOC_TYPES: DocumentType[] = ["TRANSFER_RECEIPT", "AUTHORITY_STATEMENT", "POWER_OF_ATTORNEY", "SITE_PHOTO", "PAYMENT_RECEIPT", "OTHER"];

export async function uploadDealDocument(locale: string, dealId: string, form: FormData) {
  const { l, user, deal } = await ctx(locale, dealId);
  const type = String(form.get("type")) as DocumentType;
  if (!DEAL_DOC_TYPES.includes(type)) done(l, dealId, "?err=type");
  const f = await fileFromForm(form, "file");
  if (!f.file) done(l, dealId, "?err=file");
  const s = await saveFile(f.file!.data, f.file!.type);
  const doc = await db.document.create({
    data: {
      type,
      ownerId: user.id,
      uploadedById: user.id,
      dealId,
      plotId: deal.listing.plotId,
      storageKey: s.key,
      sha256: s.sha256,
      sizeBytes: s.sizeBytes,
      fileName: f.file!.name,
      mimeType: f.file!.type,
    },
  });
  // إيصال التحويل بيتربط بآخر عربون مستني
  if (type === "TRANSFER_RECEIPT") {
    const dep = deal.deposits.find((d) => d.escrowStatus === "AWAITING_TRANSFER" && !d.receiptDocumentId);
    if (dep) await db.deposit.update({ where: { id: dep.id }, data: { receiptDocumentId: doc.id } });
  }
  await event(deal, user, "DOCUMENT_ADDED", { documentId: doc.id, type });
  done(l, dealId);
}

export async function assignTeam(locale: string, dealId: string, form: FormData) {
  const { l, user, deal } = await ctx(locale, dealId, MANAGERS);
  const pick = (k: string) => String(form.get(k) ?? "") || null;
  const data = { lawyerId: pick("lawyerId"), agentId: pick("agentId"), brokerId: pick("brokerId") ?? deal.brokerId };
  await db.deal.update({ where: { id: dealId }, data });
  await event(deal, user, "ASSIGNMENT_CHANGED", data);
  done(l, dealId);
}

export async function setDealStatus(locale: string, dealId: string, status: "ACTIVE" | "ON_HOLD" | "CANCELLED", form?: FormData) {
  const { l, user, deal } = await ctx(locale, dealId, MANAGERS);
  const note = String(form?.get("reason") ?? "").trim().slice(0, 500) || undefined;
  if (deal.status === "COMPLETED" || deal.status === "CANCELLED") done(l, dealId);
  await db.deal.update({ where: { id: dealId }, data: { status } });
  if (status === "CANCELLED") {
    await db.contract.updateMany({ where: { dealId, status: { not: "SIGNED" } }, data: { status: "VOID" } });
    if (deal.commission) await db.commission.update({ where: { id: deal.commission.id }, data: { status: "WAIVED" } });
    if (deal.listing.status === "IN_DEAL") await db.listing.update({ where: { id: deal.listingId }, data: { status: "PUBLISHED" } });
  }
  await event(deal, user, status === "CANCELLED" ? "CANCELLED" : "NOTE", { status, ...(note ? { note } : {}) });
  done(l, dealId);
}

export async function addNote(locale: string, dealId: string, form: FormData) {
  const { l, user, deal } = await ctx(locale, dealId);
  const note = String(form.get("note") ?? "").trim().slice(0, 1000);
  if (note) await event(deal, user, "NOTE", { note });
  done(l, dealId);
}
