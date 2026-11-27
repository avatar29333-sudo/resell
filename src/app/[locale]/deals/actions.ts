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
import { fileFromForm, saveFile } from "@/lib/storage";
import { getSetting, templateVersion } from "@/lib/settings";
import { makePdf } from "@/lib/pdf";
import { toNum } from "@/lib/format";
import { isLocale, type Locale } from "@/i18n/config";
import { idsByRole, notify } from "@/lib/notifications";
import { CONTRACT_TYPE, DEAL_STAGE } from "@/lib/labels";
import { leastLoaded } from "@/lib/assign";
import { lockRateAt } from "@/lib/fx-lock";
import { referralReward } from "@/lib/referral-rules";
import { isDemoMode } from "@/lib/demo";

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
      await db.contract.updateMany({ where: { dealId: o.id, status: { not: "SIGNED" } }, data: { status: "VOID" } });
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

export async function confirmPrice(locale: string, dealId: string) {
  const { l, user, deal, back } = await ctx(locale, dealId);
  await guard(user, deal, "deal.confirm_price", back);
  if (!deal.proposedPrice) done(l, dealId);
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
  const c = await db.contract.create({ data: { dealId, type, templateVersion: await templateVersion(type), status: "PENDING_LAWYER" } });
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

type Signature = { userId: string; role: "BUYER" | "SELLER"; signedAt: string; providerRef: string };

/** التوقيع للطرفين بس + حساب موثّق (5.5) — في التجربة زرار؛ على الإنتاج بيروح لمزوّد التوقيع المرخّص */
export async function signContract(locale: string, dealId: string, contractId: string) {
  const { l, user, deal, back } = await ctx(locale, dealId);
  await guard(user, deal, "contract.sign", back);
  const contract = deal.contracts.find((c) => c.id === contractId);
  if (!contract || contract.status !== "SENT_FOR_SIGNATURE") done(l, dealId);
  const side = user.id === deal.buyerId ? "BUYER" : user.id === deal.listing.sellerId ? "SELLER" : null;
  if (!side || !requiredSigners(contract!.type).includes(side)) done(l, dealId, "?err=forbidden");
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
      },
    });
    pdfDocumentId = doc.id;
  }
  await db.contract.update({
    where: { id: contractId },
    data: { signatures: all, ...(complete ? { status: "SIGNED", signedAt: new Date(), pdfDocumentId } : {}) },
  });
  // DATA-01: سعر الصرف بيتثبت مرة واحدة لحظة اكتمال توقيع العقد المبدئي
  if (complete && contract!.type === "PRELIMINARY_CONTRACT" && !deal.rateLockedAt) {
    const locked = await lockRateAt(new Date());
    if (locked) {
      await db.deal.update({ where: { id: dealId }, data: { lockedUsdEgpRate: locked.sell, exchangeRateId: locked.id, rateLockedAt: new Date() } });
      await audit(user.id, "deal.rate_locked", "Deal", dealId, { rateId: locked.id, sell: toNum(locked.sell), rateDate: locked.date.toISOString() });
    }
  }
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
  await executeSettlement(user, deal, depositId, to);
  finish(l, dealId, form, "?ok=settled");
}

async function executeSettlement(user: User, deal: LoadedDeal, depositId: string, to: "RELEASED_TO_SELLER" | "REFUNDED_TO_BUYER") {
  await db.deposit.update({ where: { id: depositId }, data: { escrowStatus: to, settledAt: new Date() } });
  await event(deal, user, "DEPOSIT_UPDATED", { depositId, status: to });
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
  await db.paymentApproval.update({
    where: { id: approvalId },
    data: { status: approve ? "APPROVED" : "REJECTED", decidedById: user.id, decidedAt: new Date(), note: String(form.get("note") ?? "") || null },
  });
  await audit(user.id, `payment.${approve ? "approved" : "rejected"}`, "PaymentApproval", approvalId, { depositId: a!.depositId, action: a!.action });
  if (approve) await executeSettlement(user, deal, a!.depositId, a!.action as "RELEASED_TO_SELLER" | "REFUNDED_TO_BUYER");
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
    await db.contract.updateMany({ where: { dealId, status: { not: "SIGNED" } }, data: { status: "VOID" } });
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
