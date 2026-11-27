"use server";

// إجراءات غرفة الصفقة — كل فعل بيعدّي على سياسة الصلاحيات (PERM-01) قبل ما يتنفذ.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ContractType, DealEventType, DocumentType, Prisma, User } from "@prisma/client";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requireRecentAuth, requireUser } from "@/lib/auth";
import { factsOf, loadDealFor, type LoadedDeal } from "@/lib/access";
import { authorize, dealCtx, overrideReason, type Action } from "@/lib/authz";
import { allowedDealUploads, type UploadSide } from "@/lib/authz/policy";
import { blockersToAdvance, nextStage, requiredSigners, STAGES, stageIndex, type Stage } from "@/lib/deal-machine";
import { fileFromForm, readFile, saveFile } from "@/lib/storage";
import { imagesToPdf, pdfPageCount } from "@/lib/pdf-ar";
import { getSetting, templateVersion } from "@/lib/settings";
import { makePdf } from "@/lib/pdf";
import { toNum } from "@/lib/format";
import { isLocale, type Locale } from "@/i18n/config";
import { idsByRole, notify } from "@/lib/notifications";
import { CONTRACT_TYPE, DEAL_STAGE } from "@/lib/labels";
import { leastLoaded } from "@/lib/assign";
import { lockRateAt } from "@/lib/fx-lock";
import { fxLockUpdate } from "@/lib/fx-lock-rule";
import { referralReward } from "@/lib/referral-rules";
import { isDemoMode } from "@/lib/demo";
import { requireActionCode } from "@/lib/action-otp";
import { contractActionKey } from "@/lib/action-otp-core";
import { cleanTitle } from "@/lib/upload-rules";
import { payoutTarget } from "@/lib/bank";
import { dealVars, publishedFor } from "@/lib/contract-vars";
import { recordClickwrap } from "@/lib/clickwrap";
import { renderTemplate } from "@/lib/templates";
import { netAfterFees } from "@/lib/bank-rules";

const loc = (l: string): Locale => (isLocale(l) ? l : "ar");

async function ctx(locale: string, dealId: string, form?: FormData | null) {
  const l = loc(locale);
  const user = await requireUser(l, `/${l}/deals/${dealId}`);
  const deal = await loadDealFor(user, dealId);
  if (!deal) redirect(`/${l}/account?denied=1`);
  return { l, user, deal, back: returnTo(l, form) ?? `/${l}/deals/${dealId}` };
}

/** فحص الصلاحية من السياسة — الأدمن لو بيتدخل لازم سبب (overrideReason) */
async function guard(user: User, deal: LoadedDeal, action: Action, back: string, form?: FormData | null) {
  return authorize(user, action, { deal: dealCtx(deal) }, { back, reason: overrideReason(form) });
}

async function event(deal: LoadedDeal, user: User, type: DealEventType, data?: Prisma.InputJsonValue, stages?: { from: Stage; to: Stage }) {
  await db.dealEvent.create({
    data: { dealId: deal.id, type, actorId: user.id, data, fromStage: stages?.from, toStage: stages?.to },
  });
  await audit(user.id, `deal.${type.toLowerCase()}`, "Deal", deal.id, data);
}

const done = (l: string, id: string, q = "") => {
  revalidatePath(`/${l}/deals/${id}`);
  redirect(`/${l}/deals/${id}${q}`);
};

/** OPS-01: أفعال الفلوس ممكن تتعمل من شاشة المالية — يرجع لها (مسار داخلي بس) */
const returnTo = (l: string, form?: FormData | null) => {
  const r = String(form?.get("returnTo") ?? "");
  return r.startsWith(`/${l}/finance`) && !r.startsWith("//") ? r : null;
};
const finish = (l: string, id: string, form?: FormData | null, q = "") => {
  const r = returnTo(l, form);
  revalidatePath(`/${l}/finance`);
  if (!r) done(l, id, q);
  revalidatePath(`/${l}/deals/${id}`);
  redirect(q ? `${r}${r!.includes("?") ? "&" : "?"}${q.replace(/^\?/, "")}` : r!);
};

const partiesOf = (deal: LoadedDeal) => [deal.buyerId, deal.listing.sellerId];

/** MKT-06: الصفقة اتقفلت → مكافأة لصاحب الإحالة (لو فيه) وبتظهر في «حسابي» وفي المالية للصرف */
async function accrueReferralReward(deal: LoadedDeal, actor: User) {
  if (deal.isDemo && !isDemoMode()) return;
  const [buyer, seller] = await Promise.all([
    db.user.findUnique({ where: { id: deal.buyerId }, select: { id: true, phone: true, referredById: true } }),
    db.user.findUnique({ where: { id: deal.listing.sellerId }, select: { id: true, phone: true, referredById: true } }),
  ]);
  if (!buyer || !seller || (!buyer.referredById && !seller.referredById)) return;
  const refIds = [buyer.referredById, seller.referredById].filter((x): x is string => !!x);
  const refs = await db.user.findMany({ where: { id: { in: refIds } }, select: { id: true, phone: true, status: true } });
  const commissionTotal = deal.commission ? toNum(deal.commission.sellerAmount) + toNum(deal.commission.buyerAmount) : 0;
  const reward = referralReward({ buyer, seller, commissionTotal }, Object.fromEntries(refs.map((r) => [r.id, r])), await getSetting("referral.reward"));
  if (!reward) return;
  const created = await db.referralReward.upsert({ where: { dealId: deal.id }, create: { ...reward, dealId: deal.id }, update: {} });
  await audit(actor.id, "referral.reward_due", "ReferralReward", created.id, { dealId: deal.id, amount: reward.amount });
  await notify([reward.referrerId], {
    kind: "referral.reward",
    ar: ["مكافأة إحالة مستحقة لك", `${reward.amount.toLocaleString("en-US")} ج.م — صفقة اللي دعيته اتقفلت.`],
    en: ["A referral reward is due to you", `EGP ${reward.amount.toLocaleString("en-US")} — your referral's deal closed.`],
    link: `/account#referral`,
  });
}

// ─── المراحل ───

export async function advanceStage(locale: string, dealId: string, form?: FormData) {
  const { l, user, deal, back } = await ctx(locale, dealId);
  await guard(user, deal, "deal.advance", back, form);
  const blockers = blockersToAdvance(factsOf(deal));
  const to = nextStage(deal.stage as Stage);
  if (blockers.length || !to) done(l, dealId, `?err=${blockers[0] ?? "last_stage"}`);

  await db.deal.update({
    where: { id: dealId },
    data: { stage: to!, stageChangedAt: new Date(), ...(to === "CLOSED" ? { status: "COMPLETED", closedAt: new Date() } : {}) },
  });
  if (to === "PRICE_AGREED") await db.listing.update({ where: { id: deal.listingId }, data: { status: "IN_DEAL" } });
  if (to === "CLOSED") {
    await db.listing.update({ where: { id: deal.listingId }, data: { status: "SOLD" } });
    if (deal.commission) await db.commission.update({ where: { id: deal.commission.id }, data: { status: "INVOICED" } });
    await accrueReferralReward(deal, user);
    // MKT-14: طلب موافقة الطرفين على نشر قصة مختصرة
    await db.dealStory.upsert({ where: { dealId }, create: { dealId }, update: {} });
    await notify([deal.buyerId, deal.listing.sellerId], {
      kind: "story.consent",
      ar: ["مبروك قفل الصفقة! تسمح ننشر قصتها؟", "المدينة والمدة بس — من غير أسماء. وافق أو تجاهل من غرفة الصفقة."],
      en: ["Congratulations on closing! May we share the story?", "City and duration only — no names. Agree or ignore in the deal room."],
      link: `/deals/${dealId}#story`,
    });
    // باقي الصفقات على نفس القطعة بتتقفل، ويتسجل السبب عشان المشتري يعرف
    const others = await db.deal.findMany({ where: { listingId: deal.listingId, id: { not: dealId }, status: { in: ["ACTIVE", "ON_HOLD"] } } });
    for (const o of others) {
      await db.deal.update({ where: { id: o.id }, data: { status: "CANCELLED" } });
      await db.dealEvent.create({ data: { dealId: o.id, type: "CANCELLED", actorId: user.id, data: { reason: "sold_to_other" } } });
      await db.contract.updateMany({ where: { dealId: o.id, status: { notIn: ["SIGNED", "VERIFIED"] } }, data: { status: "VOID" } });
      await notify([o.buyerId], {
        kind: "deal.sold_to_other",
        ar: ["القطعة اللي كنت مهتم بيها اتباعت لمشتري تاني", "تقدر تدوّر على قطع شبهها في السجل."],
        en: ["A plot you were interested in was sold to another buyer", "Browse the register for similar plots."],
        link: `/deals/${o.id}`,
      });
    }
    await notify(await idsByRole("FINANCE"), {
      kind: "deposit.release_due",
      ar: ["صفقة اتقفلت — العربون جاهز للصرف للبائع", `#${dealId.slice(-6).toUpperCase()}`],
      en: ["A deal closed — the deposit is ready to release to the seller", `#${dealId.slice(-6).toUpperCase()}`],
      link: `/deals/${dealId}`,
    });
  }
  await event(deal, user, "STAGE_CHANGED", undefined, { from: deal.stage as Stage, to: to! });
  await notify(partiesOf(deal), {
    kind: "deal.stage",
    ar: [`صفقتك انتقلت لمرحلة «${DEAL_STAGE[to!][0]}»`],
    en: [`Your deal moved to “${DEAL_STAGE[to!][1]}”`],
    link: `/deals/${dealId}`,
  });
  // MKT-11: حدث «deal_closed» في الصفحة اللي جاية (لو فيه موافقة على التحليلات)
  done(l, dealId, to === "CLOSED" ? "?ev=deal_closed" : "");
}

/** الأدمن بس يرجّع الصفقة لمرحلة سابقة، بسبب مكتوب */
export async function revertStage(locale: string, dealId: string, form: FormData) {
  const { l, user, deal, back } = await ctx(locale, dealId);
  await guard(user, deal, "deal.revert", back, form);
  const reason = String(form.get("reason") ?? "").trim();
  const i = stageIndex(deal.stage);
  if (i <= 0 || reason.length < 5) done(l, dealId, "?err=reason_required");
  const to = STAGES[i - 1];
  await db.deal.update({ where: { id: dealId }, data: { stage: to, stageChangedAt: new Date(), ...(deal.status === "COMPLETED" ? { status: "ACTIVE", closedAt: null } : {}) } });
  await event(deal, user, "STAGE_CHANGED", { reverted: true, reason }, { from: deal.stage as Stage, to });
  done(l, dealId);
}

// ─── السعر: الوسيط يقترح، والطرفين يوافقوا، وبعدها يتسجل ───

export async function proposePrice(locale: string, dealId: string, form: FormData) {
  const { l, user, deal, back } = await ctx(locale, dealId);
  await guard(user, deal, "deal.propose_price", back, form);
  const price = Number(form.get("price"));
  if (!(price > 0)) done(l, dealId, "?err=price");
  await db.deal.update({ where: { id: dealId }, data: { proposedPrice: price, buyerPriceOkAt: null, sellerPriceOkAt: null } });
  await event(deal, user, "NOTE", { proposedPrice: price });
  await notify(partiesOf(deal), {
    kind: "deal.price_proposed",
    ar: ["الوسيط اقترح سعر — محتاج موافقتك", "افتح غرفة الصفقة ووافق أو اكتب ملاحظة."],
    en: ["The broker proposed a price — your confirmation is needed", "Open the deal room to confirm or leave a note."],
    link: `/deals/${dealId}`,
  });
  done(l, dealId);
}

export async function confirmPrice(locale: string, dealId: string, form?: FormData) {
  const { l, user, deal, back } = await ctx(locale, dealId);
  await guard(user, deal, "deal.confirm_price", back);
  if (!deal.proposedPrice) done(l, dealId);
  // DEAL-03: كود مربوط بالسعر ده بالذات
  await requireActionCode(user, "price.accept", dealId, { price: String(toNum(deal.proposedPrice)) }, form, back);
  const side = user.id === deal.buyerId ? "buyerPriceOkAt" : "sellerPriceOkAt";
  const updated = await db.deal.update({ where: { id: dealId }, data: { [side]: new Date() } });
  await event(deal, user, "NOTE", { priceConfirmed: toNum(deal.proposedPrice), by: side === "buyerPriceOkAt" ? "BUYER" : "SELLER" });

  // الطرفين وافقوا → السعر بيتسجل متفق، والعمولة بتتحسب بنسب النهارده (بتتنسخ في الصفقة)
  if (updated.buyerPriceOkAt && updated.sellerPriceOkAt) {
    const price = toNum(deal.proposedPrice);
    const rates = await getSetting("commission.rates");
    await db.deal.update({ where: { id: dealId }, data: { agreedPrice: price, agreedCurrency: "EGP" } });
    const commission = {
      sellerRatePct: rates.sellerPct,
      buyerRatePct: rates.buyerPct,
      sellerAmount: Math.round((price * rates.sellerPct) / 100),
      buyerAmount: Math.round((price * rates.buyerPct) / 100),
    };
    if (deal.commission) await db.commission.update({ where: { id: deal.commission.id }, data: commission });
    else await db.commission.create({ data: { dealId, ...commission } });
    await audit(user.id, "deal.price_agreed", "Deal", dealId, { agreedPrice: price });
    await notify([deal.brokerId, ...partiesOf(deal)], {
      kind: "deal.price_agreed",
      ar: ["الطرفين وافقوا على السعر واتسجل متفق"],
      en: ["Both sides confirmed the price; it is now recorded as agreed"],
      link: `/deals/${dealId}`,
    });
  }
  done(l, dealId);
}

// ─── العقود ───

export async function createContract(locale: string, dealId: string, type: ContractType, form?: FormData) {
  const { l, user, deal, back } = await ctx(locale, dealId);
  await guard(user, deal, "contract.create", back, form);
  if (deal.contracts.some((c) => c.type === type && c.status !== "VOID")) done(l, dealId);
  // PERM-04: المحامي أوتوماتيك على أقل محامي عنده شغل، ومش طرف في الصفقة
  let lawyerId = deal.lawyerId ?? deal.listing.assignedLawyerId;
  if (!lawyerId) {
    lawyerId = await leastLoaded("LAWYER", partiesOf(deal));
    if (lawyerId) {
      await db.deal.update({ where: { id: dealId }, data: { lawyerId } });
      await event(deal, user, "ASSIGNMENT_CHANGED", { lawyerId, auto: true });
    }
  } else if (!deal.lawyerId) {
    await db.deal.update({ where: { id: dealId }, data: { lawyerId } });
  }
  // CON-02: العقد بيترتبط بالنسخة المنشورة بالظبط (templateVersionId)
  const tv = await publishedFor({ contractType: type });
  const c = await db.contract.create({ data: { dealId, type, templateVersion: tv ? `v${tv.version}` : await templateVersion(type), templateVersionId: tv?.id, status: "PENDING_LAWYER" } });
  await event(deal, user, "CONTRACT_UPDATED", { contractId: c.id, type, status: "PENDING_LAWYER" });
  await notify([lawyerId], {
    kind: "contract.review_needed",
    ar: [`عقد مستني اعتمادك: ${CONTRACT_TYPE[type][0]}`, `صفقة #${dealId.slice(-6).toUpperCase()}`],
    en: [`Contract awaiting your approval: ${CONTRACT_TYPE[type][1]}`, `Deal #${dealId.slice(-6).toUpperCase()}`],
    link: `/deals/${dealId}`,
  });
  done(l, dealId);
}

export async function lawyerDecision(locale: string, dealId: string, contractId: string, form: FormData) {
  const { l, user, deal, back } = await ctx(locale, dealId);
  await guard(user, deal, "contract.approve", back, form);
  const contract = deal.contracts.find((c) => c.id === contractId);
  if (!contract || contract.status !== "PENDING_LAWYER") done(l, dealId);
  const decision = form.get("decision") === "APPROVED" ? "APPROVED" : "CHANGES_REQUESTED";
  const notes = String(form.get("notes") ?? "").trim() || null;
  // طلب التعديل لازم معاه ملاحظة (10 حروف على الأقل)
  if (decision !== "APPROVED" && (notes?.length ?? 0) < 10) done(l, dealId, "?err=note_required");
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
  const t = CONTRACT_TYPE[contract!.type];
  await notify([deal.brokerId], {
    kind: decision === "APPROVED" ? "contract.approved" : "contract.changes",
    ar: [decision === "APPROVED" ? `المحامي اعتمد ${t[0]} — ابعته للتوقيع` : `المحامي طلب تعديل في ${t[0]}`, notes ?? undefined],
    en: [decision === "APPROVED" ? `Lawyer approved the ${t[1]} — send it for signature` : `Lawyer requested changes to the ${t[1]}`, notes ?? undefined],
    link: `/deals/${dealId}`,
  });
  done(l, dealId);
}

export async function resubmitContract(locale: string, dealId: string, contractId: string, form?: FormData) {
  const { l, user, deal, back } = await ctx(locale, dealId);
  await guard(user, deal, "contract.create", back, form);
  const contract = deal.contracts.find((c) => c.id === contractId);
  if (!contract || contract.status !== "DRAFT") done(l, dealId);
  await db.contract.update({ where: { id: contractId }, data: { status: "PENDING_LAWYER" } });
  await event(deal, user, "CONTRACT_UPDATED", { contractId, type: contract!.type, status: "PENDING_LAWYER" });
  done(l, dealId);
}

export async function sendForSignature(locale: string, dealId: string, contractId: string, form?: FormData) {
  const { l, user, deal, back } = await ctx(locale, dealId);
  await guard(user, deal, "contract.create", back, form);
  const contract = deal.contracts.find((c) => c.id === contractId);
  if (!contract || contract.status !== "APPROVED") done(l, dealId);
  await db.contract.update({
    where: { id: contractId },
    data: { status: "SENT_FOR_SIGNATURE", providerEnvelopeId: `DEMO-${contractId.slice(-8).toUpperCase()}` },
  });
  await event(deal, user, "CONTRACT_UPDATED", { contractId, type: contract!.type, status: "SENT_FOR_SIGNATURE" });
  const signers = requiredSigners(contract!.type).map((r) => (r === "BUYER" ? deal.buyerId : deal.listing.sellerId));
  await notify(signers, {
    kind: "contract.sign_needed",
    ar: [`مطلوب توقيعك على ${CONTRACT_TYPE[contract!.type][0]}`, "افتح غرفة الصفقة ووقّع إلكترونياً."],
    en: [`Your signature is needed on the ${CONTRACT_TYPE[contract!.type][1]}`, "Open the deal room and sign electronically."],
    link: `/deals/${dealId}`,
  });
  done(l, dealId);
}

/** اكتمال توقيع عقد (إلكتروني أو ورقي): DEAL-01 قفل سعر الصرف + BANK-01 تثبيت الحسابات — مع العقد الابتدائي بس */
async function onFullySigned(user: User, deal: LoadedDeal, type: string) {
  if (type !== "PRELIMINARY_CONTRACT") return;
  if (!deal.rateLockedAt) {
    const locked = await lockRateAt(new Date());
    const upd = fxLockUpdate({ contractType: type, signingComplete: true, alreadyLockedAt: deal.rateLockedAt, rate: locked ? { id: locked.id, sell: toNum(locked.sell), source: locked.source } : null, now: new Date() });
    if (upd && locked) {
      await db.deal.update({ where: { id: deal.id }, data: upd });
      await audit(user.id, "deal.rate_locked", "Deal", deal.id, { rateId: locked.id, sell: toNum(locked.sell), rateDate: locked.date.toISOString(), source: locked.source });
    }
  }
  if (!deal.bankLockedAt) await db.deal.update({ where: { id: deal.id }, data: { bankLockedAt: new Date() } });
}

type Signature = { userId: string; role: "BUYER" | "SELLER"; signedAt: string; providerRef: string };

/** التوقيع للطرفين بس + حساب موثّق (5.5) — في التجربة زرار؛ على الإنتاج بيروح لمزوّد التوقيع المرخّص */
export async function signContract(locale: string, dealId: string, contractId: string, form?: FormData) {
  const { l, user, deal, back } = await ctx(locale, dealId);
  await guard(user, deal, "contract.sign", back);
  const contract = deal.contracts.find((c) => c.id === contractId);
  if (!contract || (contract.status !== "SENT_FOR_SIGNATURE" && contract.status !== "PARTIALLY_SIGNED")) done(l, dealId);
  const side = user.id === deal.buyerId ? "BUYER" : user.id === deal.listing.sellerId ? "SELLER" : null;
  if (!side || !requiredSigners(contract!.type).includes(side)) done(l, dealId, "?err=forbidden");
  const sigs = (contract!.signatures as Signature[]) ?? [];
  if (sigs.some((s) => s.role === side)) done(l, dealId);
  // CON-03: اتفاق العمولة بالموافقة الإلكترونية — المربع لازم يتعلّم
  if (contract!.type === "COMMISSION_AGREEMENT" && form?.get("agree") !== "on") done(l, dealId, `?err=agree#contract-${contractId}`);
  // DEAL-03: كود مربوط بالعقد ده (نوع الإجراء حسب النموذج)
  await requireActionCode(user, contractActionKey(contract!.type), dealId, { contractId }, form, back);
  if (contract!.type === "COMMISSION_AGREEMENT" && contract!.templateVersionId) {
    const tv = await db.templateVersion.findUnique({ where: { id: contract!.templateVersionId }, include: { template: true } });
    const rendered = tv ? renderTemplate(tv.bodyMarkdown, await dealVars(deal, tv.version, user.id)) : null;
    // ما بيتسجلش موافقة على نص ناقص بيانات
    if (!rendered?.ok) done(l, dealId, `?err=missing_data#contract-${contractId}`);
    await recordClickwrap(user, { kind: tv!.template.key, versionId: tv!.id, title: tv!.template.titleAr, version: tv!.version, text: rendered!.text, dealId });
  }
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
      // MKT-15: رقم القيد في سجل الوسطاء على كل عقد
      `Licensed brokerage - broker registry no.: ${(await getSetting("brokerRegistrationNumber")).value || "PENDING"}`,
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
        // نسخة العقد الموقّعة سجل مشترك للطرفين
        visibility: "SHARED_WITH_COUNTERPARTY",
      },
    });
    pdfDocumentId = doc.id;
  }
  await db.contract.update({
    where: { id: contractId },
    data: { signatures: all, ...(complete ? { status: "SIGNED", signedAt: new Date(), pdfDocumentId } : { status: "PARTIALLY_SIGNED" }) },
  });
  if (complete) await onFullySigned(user, deal, contract!.type);
  await event(deal, user, "CONTRACT_UPDATED", { contractId, type: contract!.type, signedBy: side, complete });
  if (complete) {
    await notify([deal.buyerId, deal.listing.sellerId, deal.brokerId], {
      kind: "contract.signed",
      ar: [`${CONTRACT_TYPE[contract!.type][0]} اتوقّع من الطرفين`, "نسخة PDF موجودة في مستندات الصفقة."],
      en: [`The ${CONTRACT_TYPE[contract!.type][1]} is signed by both sides`, "A PDF copy is in the deal documents."],
      link: `/deals/${dealId}`,
    });
  }
  // MKT-11: حدث «commission_signed» لما اتفاق العمولة يكمل
  done(l, dealId, complete && contract!.type === "COMMISSION_AGREEMENT" ? "?ev=commission_signed" : "");
}

/**
 * CON-04: المحامي بيتحقق من النسخة الموقّعة قبل ما المرحلة الجاية تتفتح (SIGNED → VERIFIED).
 * قائمة مطابقة إجبارية + مكان الأصل الورقي. شهادة مزوّد التوقيع (لما يتربط) بتعمل نفس الحاجة آلياً.
 */
// CON-06: التوقيعات موجودة، الأحرف الأولى على كل صفحة، مفيش شطب أو إضافة بخط اليد، التاريخ
const VERIFY_CHECKS = ["signatures", "initials", "no_handwriting", "date"] as const;
export async function verifyContract(locale: string, dealId: string, contractId: string, form: FormData) {
  const { l, user, deal, back } = await ctx(locale, dealId);
  await guard(user, deal, "contract.approve", back, form);
  const contract = deal.contracts.find((c) => c.id === contractId);
  if (!contract || contract.status !== "SIGNED") done(l, dealId);
  // الأحرف الأولى والكتابة بخط اليد بتخص النسخة الورقية بس
  const checks = contract!.signedVia === "PAPER" ? VERIFY_CHECKS : (["signatures", "date"] as const);
  const checklist = checks.map((k) => ({ key: k, passed: form.get(`chk_${k}`) === "on" }));
  if (checklist.some((c) => !c.passed)) done(l, dealId, "?err=verify_checklist");
  // CON-05: التوكيل لازم يكون «تقديم ومتابعة» مش «بيع» — لو فيه صلاحية بيع بيترفض
  if (contract!.type === "POWER_OF_ATTORNEY" && form.get("chk_filing_only") !== "on") done(l, dealId, "?err=poa_sale");
  // CON-06: مكان الأصل الورقي (مع العميل / في المكتب / اتشحن + رقم البوليصة)
  const where = String(form.get("paperWhere") ?? "");
  const extra = String(form.get("paperOriginalLocation") ?? "").trim().slice(0, 160);
  const paper = where ? `${{ client: "مع العميل", office: "في المكتب", shipped: "اتشحن" }[where] ?? where}${extra ? ` — ${extra}` : ""}` : extra || null;
  await db.contract.update({
    where: { id: contractId },
    data: { status: "VERIFIED", verifiedAt: new Date(), verifiedById: user.id, verificationMethod: "LAWYER", verificationChecklist: checklist, paperOriginalLocation: paper },
  });
  await event(deal, user, "CONTRACT_UPDATED", { contractId, type: contract!.type, status: "VERIFIED", paperOriginalLocation: paper });
  await notify([deal.brokerId, ...partiesOf(deal)], {
    kind: "contract.verified",
    ar: [`${CONTRACT_TYPE[contract!.type][0]} اتحقق منه`],
    en: [`The ${CONTRACT_TYPE[contract!.type][1]} was verified`],
    link: `/deals/${dealId}`,
  });
  done(l, dealId);
}

/** DEAL-03: رد الطرف على السعر المقترح — رفض أو عرض مقابل (بكود) */
export async function respondPrice(locale: string, dealId: string, kind: "reject" | "counter", form: FormData) {
  const { l, user, deal, back } = await ctx(locale, dealId);
  await guard(user, deal, "deal.confirm_price", back);
  if (!deal.proposedPrice || deal.agreedPrice) done(l, dealId);
  const side = user.id === deal.buyerId ? "BUYER" : "SELLER";
  if (kind === "reject") {
    await requireActionCode(user, "price.reject", dealId, { price: String(form.get("price") ?? "") }, form, back);
    if (String(form.get("price")) !== String(toNum(deal.proposedPrice))) done(l, dealId, "?err=otp_mismatch");
    await db.deal.update({ where: { id: dealId }, data: { buyerPriceOkAt: null, sellerPriceOkAt: null } });
    await event(deal, user, "NOTE", { priceRejected: toNum(deal.proposedPrice), by: side });
  } else {
    const price = Number(form.get("price"));
    if (!(price > 0)) done(l, dealId, "?err=price");
    await requireActionCode(user, "price.counter", dealId, { price: String(form.get("price")) }, form, back);
    await event(deal, user, "NOTE", { counterPrice: price, by: side });
  }
  await notify([deal.brokerId], {
    kind: "deal.price_response",
    ar: [kind === "reject" ? "طرف رفض السعر المقترح" : `طرف قدّم عرض مقابل: ${Number(form.get("price")).toLocaleString("en-US")} ج.م`],
    en: [kind === "reject" ? "A party rejected the proposed price" : `A party made a counter-offer: EGP ${Number(form.get("price")).toLocaleString("en-US")}`],
    link: `/deals/${dealId}`,
  });
  done(l, dealId, "?ok=price_response");
}

/** DEAL-03: المشتري «حوّلت العربون» / البائع «استلمت المبلغ» — تأكيدات الطرف (بكود) */
export async function partyDepositConfirm(locale: string, dealId: string, depositId: string, kind: "sent" | "received", form: FormData) {
  const { l, user, deal, back } = await ctx(locale, dealId);
  const dep = deal.deposits.find((x) => x.id === depositId);
  if (!dep) done(l, dealId);
  if (kind === "sent" && (user.id !== deal.buyerId || dep!.escrowStatus !== "AWAITING_TRANSFER" || dep!.buyerSentAt)) done(l, dealId, "?err=forbidden");
  if (kind === "received" && (user.id !== deal.listing.sellerId || dep!.escrowStatus !== "RELEASED_TO_SELLER" || dep!.sellerReceivedAt)) done(l, dealId, "?err=forbidden");
  await requireActionCode(user, kind === "sent" ? "deposit.sent" : "deposit.received", dealId, { depositId }, form, back);
  await db.deposit.update({ where: { id: depositId }, data: kind === "sent" ? { buyerSentAt: new Date() } : { sellerReceivedAt: new Date() } });
  await event(deal, user, "DEPOSIT_UPDATED", { depositId, [kind === "sent" ? "buyerSent" : "sellerReceived"]: true });
  if (kind === "sent") {
    await notify(await idsByRole("FINANCE"), {
      kind: "deposit.buyer_sent",
      ar: ["المشتري أكّد إنه حوّل العربون", "راجع البنك وأكّد الاستلام برقم المرجع."],
      en: ["The buyer confirmed they transferred the deposit", "Check the bank and confirm with the reference."],
      link: `/deals/${dealId}`,
    });
  }
  done(l, dealId);
}

/** DEAL-03: طلب إلغاء من طرف — بيروح للوسيط والأدمن (والإلغاء الفعلي بمحضر) */
export async function requestCancellation(locale: string, dealId: string, form: FormData) {
  const { l, user, deal, back } = await ctx(locale, dealId);
  if (user.id !== deal.buyerId && user.id !== deal.listing.sellerId) done(l, dealId, "?err=forbidden");
  if (deal.status !== "ACTIVE" && deal.status !== "ON_HOLD") done(l, dealId);
  const note = String(form.get("note") ?? "").trim().slice(0, 500);
  if (note.length < 10) done(l, dealId, "?err=note_required");
  await requireActionCode(user, "deal.cancel_request", dealId, {}, form, back);
  await event(deal, user, "NOTE", { cancelRequested: true, by: user.id === deal.buyerId ? "BUYER" : "SELLER", note });
  await notify([deal.brokerId, ...(await idsByRole("ADMIN"))], {
    kind: "deal.cancel_requested",
    ar: ["طرف طلب إلغاء الصفقة", note],
    en: ["A party requested to cancel the deal", note],
    link: `/deals/${dealId}`,
  });
  done(l, dealId, "?ok=cancel_requested");
}

// ─── العربون: المالي بس (الوسيط ما يلمسش الفلوس — 7.4) ───

export async function recordDeposit(locale: string, dealId: string, form: FormData) {
  const { l, user, deal, back } = await ctx(locale, dealId);
  await guard(user, deal, "deposit.record", back, form);
  const amount = Number(form.get("amount"));
  if (!(amount > 0)) done(l, dealId, "?err=amount");
  const d = await db.deposit.create({ data: { dealId, amount, currency: "EGP" } });
  await event(deal, user, "DEPOSIT_UPDATED", { depositId: d.id, amount, status: "AWAITING_TRANSFER" });
  done(l, dealId);
}

/** تأكيد وصول العربون للبنك — برقم مرجع البنك */
export async function confirmDeposit(locale: string, dealId: string, depositId: string, form: FormData) {
  const { l, user, deal, back } = await ctx(locale, dealId, form);
  await guard(user, deal, "deposit.confirm", back, form);
  const dep = deal.deposits.find((x) => x.id === depositId);
  const ref = String(form.get("bankReference") ?? "").trim();
  if (!dep || dep.escrowStatus !== "AWAITING_TRANSFER") finish(l, dealId, form);
  if (ref.length < 4) finish(l, dealId, form, "?err=bank_ref");
  await db.deposit.update({ where: { id: depositId }, data: { escrowStatus: "HELD", heldAt: new Date(), bankReference: ref } });
  await event(deal, user, "DEPOSIT_UPDATED", { depositId, status: "HELD", bankReference: ref });
  await notify(partiesOf(deal), {
    kind: "deposit.held",
    ar: ["العربون اتحفظ في حساب الضمان بالبنك"],
    en: ["The deposit is held in the bank escrow account"],
    link: `/deals/${dealId}`,
  });
  finish(l, dealId, form);
}

/**
 * صرف للبائع أو رد للمشتري. فوق حد الأربع عيون (PERM-09) المالي بيعمل طلب،
 * والصرف ما يتنفذش غير بعد موافقة أدمن. الأدمن نفسه بيصرف مباشرة.
 */
export async function settleDeposit(locale: string, dealId: string, depositId: string, to: "RELEASED_TO_SELLER" | "REFUNDED_TO_BUYER", form?: FormData) {
  const { l, user, deal, back } = await ctx(locale, dealId, form);
  await guard(user, deal, to === "RELEASED_TO_SELLER" ? "deposit.release" : "deposit.refund", back, form);
  // PERM-08: الصرف فعل حرج → تأكيد هوية في آخر 10 دقايق
  await requireRecentAuth(user, l, back);
  const dep = deal.deposits.find((x) => x.id === depositId);
  if (!dep || dep.escrowStatus !== "HELD") finish(l, dealId, form);
  // BANK-01: الصرف على حساب VERIFIED بتاع المستلم بس (في السيرفر، مش الواجهة بس)
  const target = await payoutTarget(deal, to);
  if (target.block) {
    await audit(user.id, "payment.blocked", "Deposit", depositId, { to, reason: target.block });
    finish(l, dealId, form, `?err=payout_${target.block}`);
  }
  // FEE-01: مصاريف التحويل الفعلية على المستلم
  const fee = Math.max(0, Number(form?.get("payoutFeeEgp") ?? 0) || 0);
  if (dep!.approvals.length) finish(l, dealId, form, "?err=approval_pending");
  const limit = (await getSetting("payments.fourEyes")).limitEgp;
  if (user.role !== "ADMIN" && toNum(dep!.amount) > limit) {
    const a = await db.paymentApproval.create({ data: { depositId, action: to, amount: dep!.amount, requestedById: user.id } });
    await audit(user.id, "payment.approval_requested", "PaymentApproval", a.id, { depositId, to, amount: toNum(dep!.amount) });
    await notify(await idsByRole("ADMIN"), {
      kind: "payment.approval_needed",
      ar: [`طلب صرف محتاج موافقتك: ${toNum(dep!.amount).toLocaleString("en-US")} ج.م`, `صفقة #${dealId.slice(-6).toUpperCase()}`],
      en: [`A payout needs your approval: EGP ${toNum(dep!.amount).toLocaleString("en-US")}`, `Deal #${dealId.slice(-6).toUpperCase()}`],
      link: `/deals/${dealId}`,
    });
    finish(l, dealId, form, "?ok=approval_requested");
  }
  await executeSettlement(user, deal, depositId, to, fee);
  finish(l, dealId, form, "?ok=settled");
}

async function executeSettlement(user: User, deal: LoadedDeal, depositId: string, to: "RELEASED_TO_SELLER" | "REFUNDED_TO_BUYER", fee = 0) {
  // BANK-01: دفاع تاني جوه التنفيذ نفسه (طريق الموافقة كمان)
  const target = await payoutTarget(deal, to);
  if (target.block) throw new Error(`payout blocked: ${target.block}`);
  const dep = deal.deposits.find((x) => x.id === depositId);
  const n = netAfterFees(toNum(dep?.amount), fee);
  // مرة واحدة بس: الصرف/الرد بيتم لو العربون لسه «محفوظ» لحظة التنفيذ (طلبين في نفس الوقت → واحد يعدّي)
  const moved = await db.deposit.updateMany({ where: { id: depositId, escrowStatus: "HELD" }, data: { escrowStatus: to, settledAt: new Date(), payoutBankAccountId: target.acc!.id, payoutFeeEgp: n.fee, payoutNetEgp: n.net } });
  if (moved.count !== 1) throw new Error("deposit already settled");
  await event(deal, user, "DEPOSIT_UPDATED", { depositId, status: to, amount: n.amount, fee: n.fee, net: n.net, account: `•••• ${target.acc!.ibanLast4}` });
  await notify([to === "RELEASED_TO_SELLER" ? deal.listing.sellerId : deal.buyerId], {
    kind: `deposit.${to.toLowerCase()}`,
    ar: [to === "RELEASED_TO_SELLER" ? "العربون اتصرف لك" : "العربون اترد لك بالكامل"],
    en: [to === "RELEASED_TO_SELLER" ? "The deposit was released to you" : "Your deposit was refunded in full"],
    link: `/deals/${deal.id}`,
  });
}

/** الأدمن يوافق أو يرفض طلب صرف فوق الحد */
export async function decidePayment(locale: string, dealId: string, approvalId: string, form: FormData) {
  const { l, user, deal, back } = await ctx(locale, dealId);
  await guard(user, deal, "payment.approve", back, form);
  await requireRecentAuth(user, l, back);
  const a = await db.paymentApproval.findUnique({ where: { id: approvalId } });
  if (!a || a.status !== "PENDING") done(l, dealId);
  if (a!.requestedById === user.id) done(l, dealId, "?err=forbidden");
  const approve = form.get("decision") === "APPROVED";
  const decided = await db.paymentApproval.updateMany({
    where: { id: approvalId, status: "PENDING" },
    data: { status: approve ? "APPROVED" : "REJECTED", decidedById: user.id, decidedAt: new Date(), note: String(form.get("note") ?? "") || null },
  });
  if (decided.count !== 1) done(l, dealId); // اتقرر بالفعل (ضغطتين)
  await audit(user.id, `payment.${approve ? "approved" : "rejected"}`, "PaymentApproval", approvalId, { depositId: a!.depositId, action: a!.action });
  if (approve) {
    const target = await payoutTarget(deal, a!.action as "RELEASED_TO_SELLER" | "REFUNDED_TO_BUYER");
    if (target.block) done(l, dealId, `?err=payout_${target.block}`);
    await executeSettlement(user, deal, a!.depositId, a!.action as "RELEASED_TO_SELLER" | "REFUNDED_TO_BUYER", Math.max(0, Number(form.get("payoutFeeEgp") ?? 0) || 0));
  }
  await notify([a!.requestedById], {
    kind: "payment.decided",
    ar: [approve ? "الأدمن وافق على طلب الصرف واتنفذ" : "الأدمن رفض طلب الصرف"],
    en: [approve ? "The admin approved and executed the payout" : "The admin rejected the payout request"],
    link: `/deals/${dealId}`,
  });
  done(l, dealId);
}

export async function setCommissionStatus(locale: string, dealId: string, status: "INVOICED" | "PAID" | "WAIVED", form?: FormData) {
  const { l, user, deal, back } = await ctx(locale, dealId, form);
  await guard(user, deal, status === "WAIVED" ? "commission.waive" : "commission.collect", back, form);
  if (!deal.commission) finish(l, dealId, form);
  const ref = String(form?.get("reference") ?? "").trim() || null;
  // OPS-01: التحصيل بتاريخ + مرجع
  const paidOn = String(form?.get("paidOn") ?? "");
  if (status === "PAID" && (!ref || ref.length < 3)) finish(l, dealId, form, "?err=reference");
  const paidAt = status === "PAID" ? (paidOn ? new Date(`${paidOn}T12:00:00Z`) : new Date()) : undefined;
  await db.commission.update({ where: { id: deal.commission!.id }, data: { status, ...(paidAt ? { paidAt, paymentRef: ref } : {}) } });
  await audit(user.id, "commission.status", "Commission", deal.commission!.id, { from: deal.commission!.status, to: status, reference: ref, paidAt: paidAt?.toISOString() ?? null });
  finish(l, dealId, form, "?ok=commission");
}

// ─── المستندات حسب المرحلة والدور (DATA-06) ───

function uploadSide(user: User, deal: LoadedDeal): UploadSide | null {
  if (user.role === "ADMIN") return "ADMIN";
  if (user.id === deal.buyerId) return "BUYER";
  if (user.id === deal.listing.sellerId) return "SELLER";
  if (user.id === deal.brokerId) return "BROKER";
  if (user.id === deal.agentId) return "AGENT";
  if (user.id === deal.lawyerId) return "LAWYER";
  if (user.role === "FINANCE") return "FINANCE";
  return null;
}

export async function uploadDealDocument(locale: string, dealId: string, form: FormData) {
  const { l, user, deal, back } = await ctx(locale, dealId);
  await guard(user, deal, "deal.upload_doc", back, form);
  const type = String(form.get("type")) as DocumentType;
  const side = uploadSide(user, deal);
  if (!side || !allowedDealUploads(side, deal.stage).includes(type)) {
    await audit(user.id, "authz.denied", "Deal", dealId, { action: "deal.upload_doc", type, stage: deal.stage });
    done(l, dealId, "?err=type");
  }
  const f = await fileFromForm(form, "file");
  if (!f.file) done(l, dealId, `?err=${"error" in f && f.error ? f.error : "file"}`);
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
      // خطاب الجهاز بيتعمد من المحامي المسند قبل ما الصفقة تتقفل
      status: type === "AUTHORITY_STATEMENT" ? "IN_REVIEW" : "UPLOADED",
      // PRIV-01: رفع الطرف خاص لحد ما يشاركه؛ رفع الفريق (إيصال التقديم، خطاب الجهاز) للطرفين
      visibility: side === "BUYER" || side === "SELLER" ? "PRIVATE" : "SHARED_WITH_COUNTERPARTY",
    },
  });
  if (type === "TRANSFER_RECEIPT") {
    const dep = deal.deposits.find((d) => d.escrowStatus === "AWAITING_TRANSFER" && !d.receiptDocumentId);
    if (dep) await db.deposit.update({ where: { id: dep.id }, data: { receiptDocumentId: doc.id } });
    await notify(await idsByRole("FINANCE"), {
      kind: "deposit.receipt_uploaded",
      ar: ["إيصال تحويل عربون اترفع — مستني تأكيد البنك"],
      en: ["A deposit transfer receipt was uploaded — awaiting bank confirmation"],
      link: `/deals/${dealId}`,
    });
  }
  if (type === "AUTHORITY_STATEMENT") {
    await notify([deal.lawyerId], {
      kind: "documents.review_needed",
      ar: ["خطاب الجهاز اترفع — مستني اعتمادك"],
      en: ["The authority letter was uploaded — awaiting your approval"],
      link: `/lawyer`,
    });
  }
  await event(deal, user, "DOCUMENT_ADDED", { documentId: doc.id, type });
  done(l, dealId);
}

// ─── الإسناد (PERM-04): الأدمن/مسؤول الوسطاء يسند، والوسيط يطلب مندوب ───

export async function assignTeam(locale: string, dealId: string, form: FormData) {
  const { l, user, deal, back } = await ctx(locale, dealId);
  await guard(user, deal, "deal.assign", back, form);
  const pick = (k: string) => String(form.get(k) ?? "") || null;
  const data = { brokerId: pick("brokerId") ?? deal.brokerId, lawyerId: pick("lawyerId"), agentId: pick("agentId") };
  // 7.2: الموظف اللي هو طرف في الصفقة ما يتسندش ليها
  if (Object.values(data).some((id) => id && partiesOf(deal).includes(id))) done(l, dealId, "?err=conflict");
  await db.deal.update({ where: { id: dealId }, data });
  await event(deal, user, "ASSIGNMENT_CHANGED", { before: { brokerId: deal.brokerId, lawyerId: deal.lawyerId, agentId: deal.agentId }, after: data });
  const changed = (["brokerId", "lawyerId", "agentId"] as const).filter((k) => data[k] !== deal[k]);
  await notify([...changed.flatMap((k) => [data[k], deal[k]]), ...partiesOf(deal)], {
    kind: "deal.assignment",
    ar: ["فريق الصفقة اتغيّر", `صفقة #${dealId.slice(-6).toUpperCase()}`],
    en: ["The deal team changed", `Deal #${dealId.slice(-6).toUpperCase()}`],
    link: `/deals/${dealId}`,
  });
  done(l, dealId);
}

export async function requestAgent(locale: string, dealId: string) {
  const { l, user, deal, back } = await ctx(locale, dealId);
  await guard(user, deal, "deal.request_agent", back);
  await event(deal, user, "NOTE", { agentRequested: true, internal: true });
  await notify([...(await idsByRole("ADMIN")), ...(await idsByRole("BROKER_LEAD"))], {
    kind: "deal.agent_requested",
    ar: [`${user.name} طلب مندوب لصفقة #${dealId.slice(-6).toUpperCase()}`],
    en: [`${user.name} requested a field agent for deal #${dealId.slice(-6).toUpperCase()}`],
    link: `/deals/${dealId}`,
  });
  done(l, dealId, "?ok=agent_requested");
}

// ─── الحالة: إيقاف مؤقت / رجوع / إلغاء ───

/** أسباب الإلغاء — بعضها بيستحق رد العربون */
const CANCEL_REASONS = ["authority_refused", "seller_withdrew", "documents_invalid", "buyer_withdrew", "no_agreement", "other"] as const;

export async function setDealStatus(locale: string, dealId: string, status: "ACTIVE" | "ON_HOLD" | "CANCELLED", form?: FormData) {
  const { l, user, deal, back } = await ctx(locale, dealId);
  await guard(user, deal, status === "CANCELLED" ? "deal.cancel" : "deal.hold", back, form);
  if (deal.status === "COMPLETED" || deal.status === "CANCELLED") done(l, dealId);
  const note = String(form?.get("note") ?? "").trim().slice(0, 500) || undefined;
  const reasonRaw = String(form?.get("reason") ?? "other");
  const reason = (CANCEL_REASONS as readonly string[]).includes(reasonRaw) ? reasonRaw : "other";
  if (status === "CANCELLED" && reason === "other" && !note) done(l, dealId, "?err=note_required");
  await db.deal.update({ where: { id: dealId }, data: { status } });
  if (status === "CANCELLED") {
    await db.contract.updateMany({ where: { dealId, status: { notIn: ["SIGNED", "VERIFIED"] } }, data: { status: "VOID" } });
    if (deal.commission) await db.commission.update({ where: { id: deal.commission.id }, data: { status: "WAIVED" } });
    if (deal.listing.status === "IN_DEAL") await db.listing.update({ where: { id: deal.listingId }, data: { status: "PUBLISHED" } });
  }
  await event(deal, user, status === "CANCELLED" ? "CANCELLED" : "NOTE", { status, ...(status === "CANCELLED" ? { reason } : {}), ...(note ? { note } : {}) });
  if (status === "CANCELLED") {
    await notify([deal.buyerId, deal.listing.sellerId, deal.brokerId], {
      kind: "deal.cancelled",
      ar: ["الصفقة اتلغت", note],
      en: ["The deal was cancelled", note],
      link: `/deals/${dealId}`,
    });
  }
  done(l, dealId);
}

/** MKT-14: موافقة طرف على نشر قصة الصفقة (والكود لو عايز) — الطرفين بس */
export async function storyConsent(locale: string, dealId: string, form: FormData) {
  const { l, user, deal, back } = await ctx(locale, dealId);
  const side = user.id === deal.buyerId ? "buyer" : user.id === deal.listing.sellerId ? "seller" : null;
  if (!side || deal.status !== "COMPLETED") redirect(`${back}?err=forbidden`);
  const agree = form.get("agree") === "yes";
  const showCode = form.get("showCode") === "on";
  const s = await db.dealStory.upsert({ where: { dealId }, create: { dealId }, update: {} });
  const mine = side === "buyer" ? { buyerConsentAt: agree ? new Date() : null, buyerShowCode: agree && showCode } : { sellerConsentAt: agree ? new Date() : null, sellerShowCode: agree && showCode };
  const buyerCode = side === "buyer" ? agree && showCode : s.buyerShowCode;
  const sellerCode = side === "seller" ? agree && showCode : s.sellerShowCode;
  // الكود بيظهر بس لو الطرفين وافقوا عليه — أي طرف يرفض بيقفله
  await db.dealStory.update({ where: { id: s.id }, data: { ...mine, showPlotCode: buyerCode && sellerCode } });
  await audit(user.id, agree ? "story.consent" : "story.decline", "DealStory", s.id, { side, showCode });
  done(l, dealId, "#story");
}

export async function addNote(locale: string, dealId: string, form: FormData) {
  const { l, user, deal, back } = await ctx(locale, dealId);
  const internal = form.get("internal") === "on";
  await guard(user, deal, internal ? "deal.internal_note" : "deal.note", back);
  const note = String(form.get("note") ?? "").trim().slice(0, 1000);
  if (note) await event(deal, user, "NOTE", { note, ...(internal ? { internal: true } : {}) });
  done(l, dealId);
}

// ─── DOC-01: «مستندات أخرى» — رفع متعدد بعنوان، استبدال بنسخة أحدث (ممنوع الحذف)، وطلب مستند ───

/** مسودات رفعها المستخدم بنفسه ولسه مش مربوطة بحاجة */
async function myDrafts(userId: string, ids: string[]) {
  return db.document.findMany({ where: { id: { in: ids }, ownerId: userId, uploadedById: userId, type: "OTHER", dealId: null, listingId: null, plotId: null, serviceRequestId: null } });
}

export async function attachDealDocuments(locale: string, dealId: string, form: FormData) {
  const { l, user, deal, back } = await ctx(locale, dealId);
  await guard(user, deal, "deal.upload_doc", back, form);
  const ids = form.getAll("docIds").map(String).slice(0, 20);
  const drafts = await myDrafts(user.id, ids);
  if (!drafts.length) done(l, dealId, "?err=file#other-docs");
  const titles = drafts.map((d) => cleanTitle(form.get(`title_${d.id}`)));
  if (titles.some((t) => !t)) done(l, dealId, "?err=title#other-docs");
  const requestId = String(form.get("requestId") ?? "");
  const side = user.id === deal.buyerId ? "BUYER" : user.id === deal.listing.sellerId ? "SELLER" : null;
  const req = requestId ? await db.documentRequest.findFirst({ where: { id: requestId, dealId, status: "OPEN", side: side ?? "-" } }) : null;
  for (const [i, d] of drafts.entries()) {
    await db.document.update({ where: { id: d.id }, data: { dealId, title: titles[i], visibility: side ? "PRIVATE" : "SHARED_WITH_COUNTERPARTY" } });
    await event(deal, user, "DOCUMENT_ADDED", { documentId: d.id, type: "OTHER", title: titles[i] });
  }
  if (req) {
    await db.documentRequest.update({ where: { id: req.id }, data: { status: "FULFILLED", documentId: drafts[0].id, fulfilledAt: new Date() } });
    await notify([req.requestedById], {
      kind: "document.request_fulfilled",
      ar: [`المستند المطلوب اترفع: ${req.title}`],
      en: [`The requested document was uploaded: ${req.title}`],
      link: `/deals/${dealId}#other-docs`,
    });
  }
  await notify([deal.brokerId, deal.lawyerId].filter((x): x is string => !!x && x !== user.id), {
    kind: "document.added",
    ar: [`${drafts.length} مستند جديد في الصفقة`, titles.join("، ")],
    en: [`${drafts.length} new document(s) in the deal`, titles.join(", ")],
    link: `/deals/${dealId}#other-docs`,
  });
  done(l, dealId, "#other-docs");
}

/** استبدال بنسخة أحدث — القديم بيفضل في السجل (SUPERSEDED)، مفيش حذف */
export async function replaceDealDocument(locale: string, dealId: string, documentId: string, form: FormData) {
  const { l, user, deal, back } = await ctx(locale, dealId);
  await guard(user, deal, "deal.upload_doc", back, form);
  const old = deal.documents.find((d) => d.id === documentId && d.status !== "SUPERSEDED");
  const staff = !!user && [deal.brokerId, deal.lawyerId, deal.agentId].includes(user.id);
  // بس «مستندات أخرى» — نسخ العقود والإيصالات ما بتتبدلش من هنا (وبتفضل مرتبطة بالعقد)
  if (!old || old.type !== "OTHER" || (old.uploadedById !== user.id && !staff && user.role !== "ADMIN")) done(l, dealId, "?err=forbidden#other-docs");
  const [draft] = await myDrafts(user.id, form.getAll("docIds").map(String).slice(0, 1));
  if (!draft) done(l, dealId, "?err=file#other-docs");
  const title = cleanTitle(form.get(`title_${draft.id}`)) ?? old!.title;
  const last = await db.document.findFirst({ where: { groupId: old!.groupId }, orderBy: { version: "desc" }, select: { version: true } });
  await db.$transaction([
    db.document.update({ where: { id: old!.id }, data: { status: "SUPERSEDED" } }),
    db.document.update({ where: { id: draft.id }, data: { dealId, type: old!.type, title, groupId: old!.groupId, version: (last?.version ?? old!.version) + 1, ownerId: old!.ownerId } }),
  ]);
  await event(deal, user, "DOCUMENT_ADDED", { documentId: draft.id, type: old!.type, title, replaces: old!.id, version: (last?.version ?? old!.version) + 1 });
  done(l, dealId, "#other-docs");
}

/** المحامي (أو الوسيط) يطلب مستند محدد من طرف → بيظهر له «مطلوب منك رفع: …» */
export async function requestDocument(locale: string, dealId: string, form: FormData) {
  const { l, user, deal, back } = await ctx(locale, dealId);
  if (![deal.lawyerId, deal.brokerId].includes(user.id) && user.role !== "ADMIN") done(l, dealId, "?err=forbidden");
  if (user.role === "ADMIN") await guard(user, deal, "deal.upload_doc", back, form);
  const side = form.get("side") === "SELLER" ? "SELLER" : "BUYER";
  const title = cleanTitle(form.get("title"));
  if (!title) done(l, dealId, "?err=title#other-docs");
  const note = String(form.get("note") ?? "").trim().slice(0, 500) || null;
  const r = await db.documentRequest.create({ data: { dealId, requestedById: user.id, side, title: title!, note } });
  await event(deal, user, "NOTE", { documentRequested: title, side, requestId: r.id });
  await notify([side === "BUYER" ? deal.buyerId : deal.listing.sellerId], {
    kind: "document.requested",
    ar: [`مطلوب منك رفع: ${title}`, note ?? undefined],
    en: [`Please upload: ${title}`, note ?? undefined],
    link: `/deals/${dealId}#other-docs`,
  });
  done(l, dealId, "#other-docs");
}

// ─── PRIV-01: الكشف بالموافقة ومشاركة مستند ───

const DISCLOSABLE = { SELLER: ["name", "plotCode", "documents"], BUYER: ["name"] } as const;

/** «هيتعرض للطرف الآخر: … — موافق؟» بكود تأكيد */
export async function grantDisclosure(locale: string, dealId: string, form: FormData) {
  const { l, user, deal, back } = await ctx(locale, dealId);
  const side = user.id === deal.buyerId ? "BUYER" : user.id === deal.listing.sellerId ? "SELLER" : null;
  if (!side) done(l, dealId, "?err=forbidden");
  const allowed: readonly string[] = DISCLOSABLE[side!];
  const fields = form.getAll("field").map(String).filter((f) => allowed.includes(f)).sort();
  if (!fields.length) done(l, dealId, "#disclosure");
  await requireActionCode(user, "disclosure.consent", dealId, { fields: fields.join(",") }, form, back);
  await db.disclosureConsent.create({ data: { userId: user.id, dealId, fields } });
  await event(deal, user, "NOTE", { disclosureGranted: fields, by: side });
  await notify([deal.brokerId, side === "SELLER" ? deal.buyerId : deal.listing.sellerId], {
    kind: "deal.disclosure",
    ar: [side === "SELLER" ? "البائع وافق على كشف بيانات للطرف الآخر" : "المشتري وافق على كشف اسمه"],
    en: [side === "SELLER" ? "The seller agreed to disclose details to the other party" : "The buyer agreed to disclose their name"],
    link: `/deals/${dealId}`,
  });
  done(l, dealId, "#disclosure");
}

/** سحب الموافقة — بيوقف الكشف من دلوقتي (العقود الموقّعة بتفضل محفوظة للمدة القانونية) */
export async function revokeDisclosure(locale: string, dealId: string) {
  const { l, user, deal } = await ctx(locale, dealId);
  const n = await db.disclosureConsent.updateMany({ where: { dealId, userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } });
  if (n.count) await event(deal, user, "NOTE", { disclosureRevoked: true });
  done(l, dealId, "#disclosure");
}

/** «شارك مع الطرف الآخر» — بكود تأكيد */
export async function shareDocument(locale: string, dealId: string, documentId: string, form: FormData) {
  const { l, user, deal, back } = await ctx(locale, dealId);
  const d = deal.documents.find((x) => x.id === documentId);
  if (!d || (d.ownerId !== user.id && d.uploadedById !== user.id)) done(l, dealId, "?err=forbidden#other-docs");
  await requireActionCode(user, "document.share", dealId, { documentId }, form, back);
  await db.document.update({ where: { id: documentId }, data: { visibility: "SHARED_WITH_COUNTERPARTY" } });
  await event(deal, user, "NOTE", { documentShared: d!.title ?? d!.type });
  done(l, dealId, "#other-docs");
}

/** BANK-01: كل طرف يختار الحساب اللي هيستلم عليه (أو يترد له عليه) — بكود؛ بعد توقيع نموذج 3 التغيير محتاج المالية */
export async function selectDealBank(locale: string, dealId: string, form: FormData) {
  const { l, user, deal, back } = await ctx(locale, dealId);
  const side = user.id === deal.buyerId ? "BUYER" : user.id === deal.listing.sellerId ? "SELLER" : null;
  if (!side) done(l, dealId, "?err=forbidden");
  if (deal.bankLockedAt) done(l, dealId, "?err=bank_locked#bank");
  const accountId = String(form.get("accountId") ?? "");
  const acc = await db.bankAccount.findFirst({ where: { id: accountId, userId: user.id, status: { in: ["PENDING", "VERIFIED"] } } });
  if (!acc) done(l, dealId, "?err=forbidden#bank");
  await requireActionCode(user, "bank.select", dealId, { accountId }, form, back);
  await db.deal.update({ where: { id: dealId }, data: side === "BUYER" ? { buyerBankAccountId: accountId } : { sellerBankAccountId: accountId } });
  await event(deal, user, "NOTE", { bankSelected: `•••• ${acc!.ibanLast4}`, by: side });
  done(l, dealId, "#bank");
}

// ─── CON-04/05/06: رفع النسخة الموقّعة (ورقي) + تحقق المحامي ───

/**
 * «ارفع النسخة الموقّعة»: PDF أو صور (بتتجمع PDF واحد بالترتيب). فحص قبل القبول:
 * عدد الصفحات = صفحات النسخة المتولّدة، كود المستند = آخر نسخة (مش ملغاة)، وضوح كل صفحة.
 * الأصل بيتحفظ زي ما هو مع البصمة، وأي رفع جديد نسخة إضافية — مفيش حذف.
 */
export async function uploadSignedContract(locale: string, dealId: string, contractId: string, form: FormData) {
  const { l, user, deal, back } = await ctx(locale, dealId);
  const contract = deal.contracts.find((c) => c.id === contractId);
  const anchor = `#contract-${contractId}`;
  if (!contract || !["SENT_FOR_SIGNATURE", "PARTIALLY_SIGNED"].includes(contract.status)) done(l, dealId, `?err=forbidden${anchor}`);
  const mySide = user.id === deal.buyerId ? "BUYER" : user.id === deal.listing.sellerId ? "SELLER" : null;
  const onBehalf = user.id === deal.brokerId || user.role === "ADMIN";
  if (user.role === "ADMIN") await guard(user, deal, "deal.upload_doc", back, form);
  const sideRaw = mySide ?? (onBehalf ? String(form.get("side") ?? "") : "");
  const side = sideRaw === "BUYER" || sideRaw === "SELLER" ? sideRaw : null;
  if (!side || !requiredSigners(contract!.type).includes(side)) done(l, dealId, `?err=forbidden${anchor}`);
  // الطرف نفسه: نفس صلاحية التوقيع (حساب موثّق، صفقة شغالة)
  if (mySide) await guard(user, deal, "contract.sign", back, form);
  // CON-05: التوكيل — رقمه ومكتب التوثيق إجباري
  const poaNumber = String(form.get("poaNumber") ?? "").trim().slice(0, 60);
  const poaNotary = String(form.get("poaNotary") ?? "").trim().slice(0, 120);
  const isPoa = contract!.type === "POWER_OF_ATTORNEY";
  if (isPoa && (poaNumber.length < 2 || poaNotary.length < 3)) done(l, dealId, `?err=poa_fields${anchor}`);
  // الكود: النسخة الحالية بس (مش ملغاة) — الكود المطبوع في التذييل أو المقروء من الـ QR
  const code = String(form.get("code") ?? "").trim().toUpperCase();
  if (!isPoa) {
    if (!contract!.draftCode) done(l, dealId, `?err=no_draft${anchor}`);
    // الكود فيه «v» صغيرة — المقارنة من غير حساسية لحالة الحروف
    if (code !== contract!.draftCode!.toUpperCase()) {
      const old = code ? await db.issuedDocument.findFirst({ where: { code: { equals: code, mode: "insensitive" } } }) : null;
      done(l, dealId, `?err=${old && old.contractId === contractId ? "code_old" : "code_wrong"}${anchor}`);
    }
  }
  const ids = form.getAll("docIds").map(String).slice(0, 40);
  const files = await db.document.findMany({ where: { id: { in: ids }, ownerId: user.id, uploadedById: user.id, type: "OTHER", dealId: null, listingId: null } });
  if (!files.length) done(l, dealId, `?err=file${anchor}`);
  files.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
  const blobs = [];
  for (const f of files) {
    const r = await readFile(f.storageKey, f.fileName, f.mimeType);
    const data = r?.kind === "bytes" ? r.data : r?.kind === "url" ? new Uint8Array(await (await fetch(r.url)).arrayBuffer()) : null;
    if (!data) done(l, dealId, `?err=file${anchor}`);
    blobs.push({ doc: f, data: data! });
  }
  let pdfBytes: Buffer;
  let pages: number;
  if (blobs.length === 1 && blobs[0].doc.mimeType === "application/pdf") {
    pdfBytes = Buffer.from(blobs[0].data);
    pages = (await pdfPageCount(pdfBytes)) ?? 0;
  } else {
    if (blobs.some((b) => !["image/jpeg", "image/png"].includes(b.doc.mimeType))) done(l, dealId, `?err=mix${anchor}`);
    const merged = await imagesToPdf(blobs.map((b) => ({ data: b.data, mime: b.doc.mimeType })));
    if (merged.lowQualityPage) done(l, dealId, `?err=page_quality&page=${merged.lowQualityPage}${anchor}`);
    pdfBytes = merged.bytes;
    pages = merged.pages;
  }
  if (!isPoa && contract!.draftPages && pages !== contract!.draftPages) done(l, dealId, `?err=pages&got=${pages}&want=${contract!.draftPages}${anchor}`);
  const saved = await saveFile(pdfBytes, "application/pdf", "contracts");
  const name = CONTRACT_TYPE[contract!.type]?.[0] ?? contract!.type;
  const signedDoc = await db.document.create({
    data: {
      type: isPoa ? "POWER_OF_ATTORNEY" : "CONTRACT_PDF",
      title: isPoa ? `التوكيل الموثق رقم ${poaNumber} — ${poaNotary}` : `النسخة الموقّعة — ${name} (${side === "BUYER" ? "المشتري" : "البائع"})`,
      ownerId: side === "BUYER" ? deal.buyerId : deal.listing.sellerId,
      uploadedById: user.id,
      dealId,
      storageKey: saved.key,
      sha256: saved.sha256,
      sizeBytes: saved.sizeBytes,
      fileName: `${contract!.draftCode ?? contractId}-signed.pdf`,
      mimeType: "application/pdf",
      status: "IN_REVIEW",
      visibility: "SHARED_WITH_COUNTERPARTY",
    },
  });
  // الأصل المرفوع بيتحفظ زي ما هو
  for (const [i, b] of blobs.entries()) await db.document.update({ where: { id: b.doc.id }, data: { dealId, title: `أصل مرفوع ${i + 1}/${blobs.length} — ${name}`, visibility: "PRIVATE" } });
  // «النسخة عليها توقيع الطرفين» للوسيط/الأدمن بس — الطرف بيسجّل توقيعه هو (المحامي بيتحقق بعدها)
  const both = isPoa || (!mySide && onBehalf && form.get("both") === "on");
  const roles = both ? requiredSigners(contract!.type) : [side!];
  const all = [...((contract!.signatures as Signature[]) ?? []).filter((s) => !roles.includes(s.role)), ...roles.map((r) => ({ userId: user.id, role: r, signedAt: new Date().toISOString(), providerRef: `PAPER-${signedDoc.id.slice(-6)}` }))];
  const complete = requiredSigners(contract!.type).every((r) => all.some((s) => s.role === r));
  await db.contract.update({
    where: { id: contractId },
    data: { signatures: all, status: complete ? "SIGNED" : "PARTIALLY_SIGNED", signedAt: complete ? new Date() : null, signedVia: "PAPER", signedUploadDocumentId: signedDoc.id, rejectReason: null, ...(isPoa ? { poaNumber, poaNotary } : {}) },
  });
  if (complete) await onFullySigned(user, deal, contract!.type);
  await event(deal, user, "CONTRACT_UPDATED", { contractId, type: contract!.type, signedBy: roles.join("+"), complete, via: "PAPER", onBehalf: !mySide || undefined, sha256: saved.sha256, pages });
  if (complete && deal.lawyerId) {
    await notify([deal.lawyerId], {
      kind: "contract.verify_needed",
      ar: [`نسخة موقّعة من ${name} محتاجة مراجعتك`, "قارنها بالنسخة المتولّدة صفحة بصفحة."],
      en: [`A signed ${name} needs your review`, "Compare it page by page with the generated copy."],
      link: `/deals/${dealId}${anchor}`,
    });
  }
  done(l, dealId, `?ok=signed_uploaded${anchor}`);
}

/** المحامي: «مرفوض + السبب» → يرجع للطرف بمهمة «أعد الرفع» */
export async function rejectSignedContract(locale: string, dealId: string, contractId: string, form: FormData) {
  const { l, user, deal, back } = await ctx(locale, dealId);
  await guard(user, deal, "contract.approve", back, form);
  const contract = deal.contracts.find((c) => c.id === contractId);
  if (!contract || contract.status !== "SIGNED" || contract.signedVia !== "PAPER") done(l, dealId);
  const reason = String(form.get("reason") ?? "").trim().slice(0, 300);
  if (reason.length < 5) done(l, dealId, `?err=note_required#contract-${contractId}`);
  await db.contract.update({ where: { id: contractId }, data: { status: "SENT_FOR_SIGNATURE", signatures: [], signedAt: null, rejectReason: reason } });
  for (const side of requiredSigners(contract!.type)) {
    await db.documentRequest.create({ data: { dealId, requestedById: user.id, side, title: `أعد رفع النسخة الموقّعة من ${CONTRACT_TYPE[contract!.type]?.[0]}`, note: reason } });
  }
  await event(deal, user, "CONTRACT_UPDATED", { contractId, type: contract!.type, decision: "CHANGES_REQUESTED", notes: reason });
  await notify(requiredSigners(contract!.type).map((s) => (s === "BUYER" ? deal.buyerId : deal.listing.sellerId)), {
    kind: "contract.reupload",
    ar: [`أعد رفع النسخة الموقّعة من ${CONTRACT_TYPE[contract!.type]?.[0]}`, reason],
    en: [`Please re-upload the signed ${CONTRACT_TYPE[contract!.type]?.[1]}`, reason],
    link: `/deals/${dealId}#contract-${contractId}`,
  });
  done(l, dealId, `#contract-${contractId}`);
}
