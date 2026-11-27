import { BLOCKER_TEXT, STAGES, TRANSITIONS, blockersToAdvance, isSignedStatus, requiredSigners, stageIndex, type Blocker, type DealFacts, type Stage } from "./deal-machine";

/**
 * TXN-01 — وضوح المعاملة (منطق نقي، متغطي باختبار):
 * «المطلوب منك الآن»، التفصيل المالي لكل طرف، شريط العربون، الخط الزمني، والسجل بلغة مفهومة.
 */

export type Side = "BUYER" | "SELLER";
type Tx = readonly [string, string];

export type OverviewInput = Omit<DealFacts, "contracts" | "deposits"> & {
  proposedPrice: number | null;
  buyerPriceOkAt: Date | null;
  sellerPriceOkAt: Date | null;
  contracts: { id: string; type: string; status: string; signatures: { role: string }[] }[];
  deposits: { id: string; amount: number; escrowStatus: string; buyerSentAt: Date | null; sellerReceivedAt: Date | null; bankReference: string | null; heldAt: Date | null; settledAt: Date | null }[];
  /** تاريخ دخول المرحلة الحالية */
  stageEnteredAt: Date;
  /** DOC-01: مستندات طلبها المحامي/الوسيط ولسه ما اترفعتش */
  docRequests?: { side: string; title: string }[];
};

/** مين مسؤول عن كل شرط ناقص */
export const BLOCKER_OWNER: Record<Blocker, Tx> = {
  not_active: ["الإدارة", "Admin"],
  last_stage: ["—", "—"],
  need_broker: ["الإدارة", "Admin"],
  need_commission_signed: ["البائع والمشتري", "Seller and buyer"],
  need_price_confirmed: ["البائع والمشتري", "Seller and buyer"],
  need_agreed_price: ["الوسيط", "Broker"],
  need_preliminary_signed: ["البائع والمشتري", "Seller and buyer"],
  need_deposit_held: ["المشتري ثم المالية", "Buyer, then finance"],
  need_agent: ["الإدارة", "Admin"],
  need_filing_receipt: ["المندوب", "Field agent"],
  need_approval_doc: ["المندوب والمحامي", "Field agent and lawyer"],
  need_preliminary_verified: ["المحامي", "Lawyer"],
  need_deposit_contract_verified: ["البائع والمشتري ثم المحامي", "Both parties, then the lawyer"],
  need_buyer_undertaking: ["المشتري", "Buyer"],
};

/** مهلة كل مرحلة بالأيام (من تاريخ دخولها) — بتظهر عدّاد «باقي X يوم» */
export const STAGE_SLA_DAYS: Partial<Record<Stage, number>> = {
  INTEREST: 7,
  COMMISSION_AGREEMENT: 7,
  PRICE_AGREED: 10,
  PRELIMINARY_CONTRACT: 14,
  TRANSFER_FILED: 60, // رد الجهاز
  AUTHORITY_APPROVED: 14,
};

export const daysLeft = (due: Date, now: Date) => Math.ceil((due.getTime() - now.getTime()) / 86_400_000);
export const isUrgent = (days: number) => days < 3;

export function stageDue(stage: Stage, enteredAt: Date) {
  const d = STAGE_SLA_DAYS[stage];
  return d ? new Date(enteredAt.getTime() + d * 86_400_000) : null;
}

const CT: Record<string, Tx> = {
  COMMISSION_AGREEMENT: ["اتفاق العمولة", "the commission agreement"],
  PRELIMINARY_CONTRACT: ["العقد الابتدائي", "the preliminary contract"],
  DEPOSIT_RECEIPT: ["محضر العربون", "the deposit agreement"],
  POWER_OF_ATTORNEY: ["توكيل التقديم", "the filing power of attorney"],
  BUYER_UNDERTAKING: ["تعهد المشتري", "the buyer undertaking"],
  CLOSING: ["محضر الإغلاق", "the closing record"],
  CANCELLATION: ["محضر الإلغاء", "the cancellation record"],
};
const ct = (t: string, ar: boolean) => (CT[t] ?? [t, t])[ar ? 0 : 1];

export type NextAction = { mine: true; text: string; anchor: string; dueAt: Date | null } | { mine: false; text: string; dueAt: Date | null };

/** «المطلوب منك الآن» — إجراء واحد للطرف اللي فاتح الصفحة، أو «في انتظار: …» */
export function nextActionFor(f: OverviewInput, side: Side | null, ar: boolean): NextAction | null {
  if (f.status === "CANCELLED" || f.status === "COMPLETED") return null;
  const due = stageDue(f.stage, f.stageEnteredAt);
  if (side) {
    const toSign = f.contracts.find(
      (c) => (c.status === "SENT_FOR_SIGNATURE" || c.status === "PARTIALLY_SIGNED") && requiredSigners(c.type).includes(side) && !c.signatures.some((s) => s.role === side),
    );
    if (toSign) return { mine: true, text: ar ? `وقّع ${ct(toSign.type, true)}` : `Sign ${ct(toSign.type, false)}`, anchor: "#contracts", dueAt: due };
    const docReq = f.docRequests?.find((r) => r.side === side);
    if (docReq) return { mine: true, text: ar ? `مطلوب منك رفع: ${docReq.title}` : `Please upload: ${docReq.title}`, anchor: "#other-docs", dueAt: due };
    const myOk = side === "BUYER" ? f.buyerPriceOkAt : f.sellerPriceOkAt;
    if (f.proposedPrice && !f.agreedPrice && !myOk)
      return { mine: true, text: ar ? `وافق على السعر المقترح ${f.proposedPrice.toLocaleString("en-US")} ج.م أو ارفضه` : `Confirm or reject the proposed price EGP ${f.proposedPrice.toLocaleString("en-US")}`, anchor: "#price", dueAt: due };
    const dep = f.deposits.find((d) => d.escrowStatus === "AWAITING_TRANSFER");
    if (side === "BUYER" && dep && !dep.buyerSentAt)
      return { mine: true, text: ar ? `حوّل العربون ${dep.amount.toLocaleString("en-US")} ج.م لحساب الضمان وأكّد` : `Transfer the deposit EGP ${dep.amount.toLocaleString("en-US")} to escrow and confirm`, anchor: "#deposit", dueAt: due };
    const rel = f.deposits.find((d) => d.escrowStatus === "RELEASED_TO_SELLER" && !d.sellerReceivedAt);
    if (side === "SELLER" && rel) return { mine: true, text: ar ? "أكّد إنك استلمت مبلغ العربون" : "Confirm you received the deposit", anchor: "#deposit", dueAt: null };
  }
  const blockers = blockersToAdvance(f).filter((b) => b !== "last_stage");
  if (!blockers.length) return f.stage === "CLOSED" ? null : { mine: false, text: ar ? "في انتظار: الوسيط — نقل الصفقة للمرحلة الجاية" : "Waiting for: the broker — move the deal to the next stage", dueAt: due };
  const b = blockers[0];
  return { mine: false, text: ar ? `في انتظار: ${BLOCKER_OWNER[b][0]} — ${BLOCKER_TEXT[b][0]}` : `Waiting for: ${BLOCKER_OWNER[b][1]} — ${BLOCKER_TEXT[b][1]}`, dueAt: due };
}

// ─── التفصيل المالي ───

export type MoneyStatus = "DUE" | "PAID" | "HELD" | "RELEASED" | "REFUNDED" | "ESTIMATE";
export type MoneyLine = { label: Tx; amount: number; currency: "EGP" | "USD"; payer: Tx; payee: Tx; status: MoneyStatus; ref?: string | null; sign: 1 | -1 };

export type Fees = { transferFeeEgp: number; notaryFeeEgp: number };

/**
 * البائع: الثمن − عمولته − رسومه = الصافي.  المشتري: الثمن + عمولته + رسوم التنازل والتوثيق، وبعدها الأقساط المتبقية للجهاز.
 * كل طرف بيشوف عمولته هو بس.
 */
export function moneyFor(
  side: Side,
  i: {
    price: number;
    commission: { sellerAmount: number; buyerAmount: number; sellerRatePct: number; buyerRatePct: number; status: string } | null;
    deposits: OverviewInput["deposits"];
    fees: Fees;
    remainingUsd: number | null;
  },
) {
  const lines: MoneyLine[] = [];
  const cStatus: MoneyStatus = i.commission?.status === "PAID" ? "PAID" : "DUE";
  const held = i.deposits.find((d) => d.escrowStatus !== "REFUNDED_TO_BUYER");
  const depStatus = (d?: OverviewInput["deposits"][number]): MoneyStatus =>
    !d ? "DUE" : d.escrowStatus === "HELD" ? "HELD" : d.escrowStatus === "RELEASED_TO_SELLER" ? "RELEASED" : d.escrowStatus === "REFUNDED_TO_BUYER" ? "REFUNDED" : "DUE";
  if (side === "SELLER") {
    lines.push({ label: ["ثمن القطعة", "Plot price"], amount: i.price, currency: "EGP", payer: ["المشتري", "Buyer"], payee: ["أنت", "You"], status: "DUE", sign: 1 });
    if (held) lines.push({ label: ["منه: العربون", "Of which: deposit"], amount: held.amount, currency: "EGP", payer: ["المشتري (عبر حساب الضمان)", "Buyer (via escrow)"], payee: ["أنت", "You"], status: depStatus(held), ref: held.bankReference, sign: 1 });
    if (i.commission) lines.push({ label: [`عمولة المنصة (${i.commission.sellerRatePct}%)`, `Platform commission (${i.commission.sellerRatePct}%)`], amount: i.commission.sellerAmount, currency: "EGP", payer: ["أنت", "You"], payee: ["Resell", "Resell"], status: cStatus, sign: -1 });
    const net = i.price - (i.commission?.sellerAmount ?? 0);
    return { lines, total: { label: ["صافي هتستلمه", "Net you receive"] as Tx, amount: net } };
  }
  lines.push({ label: ["ثمن القطعة", "Plot price"], amount: i.price, currency: "EGP", payer: ["أنت", "You"], payee: ["البائع", "Seller"], status: "DUE", sign: 1 });
  if (held) lines.push({ label: ["منه: العربون", "Of which: deposit"], amount: held.amount, currency: "EGP", payer: ["أنت", "You"], payee: ["حساب الضمان بالبنك", "Bank escrow"], status: depStatus(held), ref: held.bankReference, sign: 1 });
  if (i.commission) lines.push({ label: [`عمولة المنصة (${i.commission.buyerRatePct}%)`, `Platform commission (${i.commission.buyerRatePct}%)`], amount: i.commission.buyerAmount, currency: "EGP", payer: ["أنت", "You"], payee: ["Resell", "Resell"], status: cStatus, sign: 1 });
  lines.push({ label: ["رسوم التنازل في الجهاز (تقديري)", "Authority transfer fee (estimate)"], amount: i.fees.transferFeeEgp, currency: "EGP", payer: ["أنت", "You"], payee: ["الجهاز", "City authority"], status: "ESTIMATE", sign: 1 });
  lines.push({ label: ["رسوم التوثيق (تقديري)", "Notary fees (estimate)"], amount: i.fees.notaryFeeEgp, currency: "EGP", payer: ["أنت", "You"], payee: ["الشهر العقاري", "Notary office"], status: "ESTIMATE", sign: 1 });
  const total = i.price + (i.commission?.buyerAmount ?? 0) + i.fees.transferFeeEgp + i.fees.notaryFeeEgp;
  const after = i.remainingUsd ? { label: ["الأقساط المتبقية للجهاز (بتتدفع للجهاز مباشرة، مش للمنصة)", "Remaining installments to the authority (paid to the authority, not the platform)"] as Tx, amount: i.remainingUsd, currency: "USD" as const } : null;
  return { lines, total: { label: ["إجمالي هتدفعه الآن", "Total you pay now"] as Tx, amount: total }, after };
}

// ─── شريط العربون ───

export type DepositStep = { key: "unpaid" | "held" | "released" | "refunded"; label: Tx; state: "done" | "current" | "todo" };
export function depositBar(d: OverviewInput["deposits"][number] | undefined): DepositStep[] {
  const s = d?.escrowStatus ?? "NONE";
  const end: DepositStep["key"] = s === "REFUNDED_TO_BUYER" ? "refunded" : "released";
  const order: DepositStep["key"][] = ["unpaid", "held", end];
  const cur = s === "HELD" ? 1 : s === "RELEASED_TO_SELLER" || s === "REFUNDED_TO_BUYER" ? 2 : 0;
  const LBL: Record<DepositStep["key"], Tx> = {
    unpaid: ["لم يُدفع", "Not paid"],
    held: ["في حساب الضمان", "In escrow"],
    released: ["مُفرج عنه للبائع", "Released to seller"],
    refunded: ["مرتجع للمشتري", "Refunded to buyer"],
  };
  return order.map((k, i) => ({ key: k, label: LBL[k], state: i < cur ? "done" : i === cur ? (cur === 2 ? "done" : "current") : "todo" }));
}

// ─── الخط الزمني ───

export const STAGE_DOCS: Record<Stage, string[]> = {
  INTEREST: ["COMMISSION_AGREEMENT"],
  COMMISSION_AGREEMENT: [],
  PRICE_AGREED: ["PRELIMINARY_CONTRACT"],
  PRELIMINARY_CONTRACT: ["DEPOSIT_RECEIPT", "BUYER_UNDERTAKING", "POWER_OF_ATTORNEY"],
  TRANSFER_FILED: [],
  AUTHORITY_APPROVED: ["CLOSING"],
  CLOSED: [],
};

export function timeline(f: OverviewInput) {
  const cur = stageIndex(f.stage);
  return STAGES.map((s, i) => {
    const conds = s === "CLOSED" ? [] : TRANSITIONS[s].map((t) => ({ key: t.check, ok: t.ok(f), owner: BLOCKER_OWNER[t.check], text: BLOCKER_TEXT[t.check] }));
    const docs = STAGE_DOCS[s].map((type) => {
      const c = f.contracts.find((x) => x.type === type && x.status !== "VOID");
      return { type, status: c?.status ?? null };
    });
    return { stage: s, index: i + 1, state: i < cur ? ("done" as const) : i === cur ? ("current" as const) : ("todo" as const), conds, docs, dueAt: i === cur ? stageDue(s, f.stageEnteredAt) : null };
  });
}

export const docStageLabel = (status: string | null): Tx =>
  status === null
    ? ["لسه ما اتعملش", "Not created"]
    : status === "VERIFIED"
      ? ["متحقق منه", "Verified"]
      : isSignedStatus(status)
        ? ["موقّع", "Signed"]
        : status === "PARTIALLY_SIGNED"
          ? ["موقّع جزئياً", "Partially signed"]
          : status === "SENT_FOR_SIGNATURE"
            ? ["مرسل للتوقيع", "Sent"]
            : ["مسودة", "Draft"];

// ─── السجل بلغة مفهومة ───

export type EventCategory = "money" | "docs" | "comms" | "stage";
export function eventCategory(type: string, data: Record<string, unknown>): EventCategory {
  if (type === "DEPOSIT_UPDATED" || "priceConfirmed" in data || "proposedPrice" in data || "counterPrice" in data || "priceRejected" in data) return "money";
  if (type === "DOCUMENT_ADDED" || type === "CONTRACT_UPDATED") return "docs";
  if (type === "STAGE_CHANGED" || type === "CANCELLED") return "stage";
  return "comms";
}

const STAGE_AR: Record<string, Tx> = {
  INTEREST: ["الاهتمام", "Interest"],
  COMMISSION_AGREEMENT: ["اتفاق العمولة", "Commission agreement"],
  PRICE_AGREED: ["اتفاق السعر", "Price agreed"],
  PRELIMINARY_CONTRACT: ["العقد المبدئي والعربون", "Preliminary contract & deposit"],
  TRANSFER_FILED: ["تقديم التنازل", "Transfer filed"],
  AUTHORITY_APPROVED: ["موافقة الجهاز", "Authority approval"],
  CLOSED: ["الإغلاق", "Closed"],
};
const egp = (n: unknown, ar: boolean) => (ar ? `${Number(n).toLocaleString("en-US")} ج.م` : `EGP ${Number(n).toLocaleString("en-US")}`);

/** جملة واحدة مفهومة لكل حدث: «أحمد وقّع اتفاق العمولة» */
export function eventSentence(e: { type: string; toStage: string | null; data: Record<string, unknown> }, actor: string, ar: boolean): string {
  const d = e.data;
  const t = typeof d.type === "string" ? ct(d.type, ar) : "";
  const by = d.by === "BUYER" ? (ar ? "المشتري" : "the buyer") : d.by === "SELLER" ? (ar ? "البائع" : "the seller") : "";
  switch (e.type) {
    case "CREATED":
      return ar ? `${actor} فتح الصفقة` : `${actor} opened the deal`;
    case "STAGE_CHANGED":
      return ar ? `الصفقة انتقلت لمرحلة «${STAGE_AR[e.toStage ?? ""]?.[0] ?? e.toStage}» (${actor})` : `The deal moved to "${STAGE_AR[e.toStage ?? ""]?.[1] ?? e.toStage}" (${actor})`;
    case "CONTRACT_UPDATED":
      if (d.status === "VERIFIED") return ar ? `${actor} تحقق من النسخة الموقّعة من ${t}` : `${actor} verified the signed ${t}`;
      if (d.signedBy) return ar ? `${actor} وقّع ${t}${d.complete ? " — اكتمل توقيع الطرفين" : ""}` : `${actor} signed ${t}${d.complete ? " — fully signed" : ""}`;
      if (d.decision === "APPROVED") return ar ? `${actor} (المحامي) اعتمد ${t}` : `${actor} (lawyer) approved ${t}`;
      if (d.decision) return ar ? `${actor} (المحامي) طلب تعديل في ${t}` : `${actor} (lawyer) requested changes to ${t}`;
      if (d.status === "SENT_FOR_SIGNATURE") return ar ? `${t} اتبعت للتوقيع` : `${t} was sent for signature`;
      return ar ? `${actor} جهّز ${t}` : `${actor} prepared ${t}`;
    case "DEPOSIT_UPDATED":
      if (d.buyerSent) return ar ? `${actor} أكّد إنه حوّل العربون` : `${actor} confirmed transferring the deposit`;
      if (d.sellerReceived) return ar ? `${actor} أكّد استلام مبلغ العربون` : `${actor} confirmed receiving the deposit`;
      if (d.status === "HELD") return ar ? `البنك أكّد استلام العربون في حساب الضمان${d.bankReference ? ` (مرجع ${d.bankReference})` : ""}` : `The bank confirmed the deposit is held in escrow${d.bankReference ? ` (ref ${d.bankReference})` : ""}`;
      if (d.status === "RELEASED_TO_SELLER") return ar ? "العربون اتصرف للبائع" : "The deposit was released to the seller";
      if (d.status === "REFUNDED_TO_BUYER") return ar ? "العربون اترد للمشتري" : "The deposit was refunded to the buyer";
      if (d.amount) return ar ? `${actor} سجّل عربون ${egp(d.amount, true)}` : `${actor} recorded a deposit of ${egp(d.amount, false)}`;
      return ar ? "تحديث في العربون" : "Deposit updated";
    case "DOCUMENT_ADDED": {
      const name = typeof d.title === "string" ? d.title : d.type === "OTHER" ? "" : t;
      if (d.replaces) return ar ? `${actor} رفع نسخة أحدث من: ${name}` : `${actor} uploaded a newer version of: ${name}`;
      return ar ? `${actor} رفع مستند${name ? `: ${name}` : ""}` : `${actor} uploaded a document${name ? `: ${name}` : ""}`;
    }
    case "ASSIGNMENT_CHANGED":
      return ar ? `${actor} غيّر فريق الصفقة` : `${actor} changed the deal team`;
    case "CANCELLED":
      return ar ? `${actor} ألغى الصفقة` : `${actor} cancelled the deal`;
  }
  if ("proposedPrice" in d) return ar ? `${actor} اقترح سعر ${egp(d.proposedPrice, true)}` : `${actor} proposed ${egp(d.proposedPrice, false)}`;
  if ("priceConfirmed" in d) return ar ? `${by || actor} وافق على السعر ${egp(d.priceConfirmed, true)}` : `${by || actor} confirmed the price ${egp(d.priceConfirmed, false)}`;
  if ("counterPrice" in d) return ar ? `${by || actor} قدّم عرض مقابل ${egp(d.counterPrice, true)}` : `${by || actor} counter-offered ${egp(d.counterPrice, false)}`;
  if ("priceRejected" in d) return ar ? `${by || actor} رفض السعر ${egp(d.priceRejected, true)}` : `${by || actor} rejected the price ${egp(d.priceRejected, false)}`;
  if (typeof d.documentRequested === "string") return ar ? `${actor} طلب من ${d.side === "SELLER" ? "البائع" : "المشتري"} رفع: ${d.documentRequested}` : `${actor} asked the ${d.side === "SELLER" ? "seller" : "buyer"} to upload: ${d.documentRequested}`;
  if (d.cancelRequested) return ar ? `${by || actor} طلب إلغاء الصفقة` : `${by || actor} requested cancellation`;
  if (typeof d.status === "string") return ar ? `${actor} غيّر حالة الصفقة` : `${actor} changed the deal status`;
  return ar ? `${actor} كتب ملاحظة` : `${actor} added a note`;
}
