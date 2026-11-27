// مراحل الصفقة كـ state machine — DATA-05: جدول واحد لشروط الانتقال،
// السيرفر بيستخدمه للمنع والواجهة بتستخدمه لعرض «الخطوة الجاية».
// الملف ده من غير قاعدة بيانات عشان يتختبر لوحده (deal-machine.test.ts).

export const STAGES = [
  "INTEREST",
  "COMMISSION_AGREEMENT",
  "PRICE_AGREED",
  "PRELIMINARY_CONTRACT",
  "TRANSFER_FILED",
  "AUTHORITY_APPROVED",
  "CLOSED",
] as const;
export type Stage = (typeof STAGES)[number];

export type DealFacts = {
  stage: Stage;
  status: "ACTIVE" | "ON_HOLD" | "CANCELLED" | "COMPLETED";
  hasBroker: boolean;
  hasAgent: boolean;
  agreedPrice: number | null;
  contracts: { type: string; status: string }[];
  deposits: { escrowStatus: string }[];
  /** خطاب موافقة الجهاز اترفع واتعمد */
  hasAuthorityApprovalDoc: boolean;
  /** إيصال تقديم الطلب في الجهاز اترفع */
  hasFilingReceipt?: boolean;
  /** الطرفين وافقوا على السعر جوه الغرفة */
  priceConfirmed?: boolean;
};

export type Blocker =
  | "not_active"
  | "last_stage"
  | "need_broker"
  | "need_commission_signed"
  | "need_price_confirmed"
  | "need_agreed_price"
  | "need_preliminary_signed"
  | "need_deposit_held"
  | "need_agent"
  | "need_filing_receipt"
  | "need_approval_doc"
  | "need_preliminary_verified"
  | "need_deposit_contract_verified"
  | "need_buyer_undertaking";

export const BLOCKER_TEXT: Record<Blocker, [string, string]> = {
  not_active: ["الصفقة مش شغالة", "The deal is not active"],
  last_stage: ["الصفقة في آخر مرحلة", "The deal is at its last stage"],
  need_broker: ["لازم وسيط مسؤول عن الصفقة", "A broker must be assigned"],
  need_commission_signed: ["اتفاق العمولة لازم يتوقّع من الطرفين", "The commission agreement must be signed by both sides"],
  need_price_confirmed: ["الطرفين لازم يوافقوا على السعر المقترح", "Both sides must confirm the proposed price"],
  need_agreed_price: ["لازم السعر المتفق يتسجل", "The agreed price must be recorded"],
  need_preliminary_signed: ["العقد المبدئي لازم يتوقّع من الطرفين", "The preliminary contract must be signed by both sides"],
  need_deposit_held: ["العربون لازم يبقى محفوظ في البنك", "The deposit must be held in escrow"],
  need_agent: ["لازم مندوب للتقديم في الجهاز", "A field agent must be assigned"],
  need_filing_receipt: ["لازم إيصال تقديم الطلب في الجهاز يترفع", "The authority filing receipt must be uploaded"],
  need_approval_doc: ["خطاب موافقة الجهاز لازم يترفع ويتعمد", "The authority approval letter must be uploaded and approved"],
  need_preliminary_verified: ["النسخة الموقّعة من العقد الابتدائي لازم تتحقق (المحامي أو مزوّد التوقيع)", "The signed preliminary contract must be verified (lawyer or e-sign provider)"],
  need_deposit_contract_verified: ["محضر العربون لازم يتوقّع ويتحقق منه", "The deposit escrow agreement must be signed and verified"],
  need_buyer_undertaking: ["تعهد المشتري (نموذج 6) لازم يتوقّع", "The buyer undertaking (form 6) must be signed"],
};

export function stageIndex(stage: string) {
  return STAGES.indexOf(stage as Stage);
}

export function nextStage(stage: Stage): Stage | null {
  const i = stageIndex(stage);
  return i >= 0 && i < STAGES.length - 1 ? STAGES[i + 1] : null;
}

/** CON-04: «موقّع» = اكتمل توقيع الطرفين (SIGNED) أو اتحقق منه بعدها (VERIFIED) */
export const isSignedStatus = (s: string) => s === "SIGNED" || s === "VERIFIED";
const signed = (f: DealFacts, type: string) => f.contracts.some((c) => c.type === type && isSignedStatus(c.status));
/** CON-04: «متحقق منه» = النسخة الموقّعة اتراجعت (مزوّد توقيع أو المحامي) */
const verified = (f: DealFacts, type: string) => f.contracts.some((c) => c.type === type && c.status === "VERIFIED");

/**
 * جدول شروط الانتقال: شروط الخروج من كل مرحلة للي بعدها.
 * ١ اهتمام → ٢ اتفاق العمولة: العقد متوقّع من الطرفين.
 * ٢ → ٣ اتفاق السعر: الطرفين وافقوا والسعر اتسجل.
 * ٣ → ٤ العقد المبدئي: متوقّع من الطرفين (وهنا سعر الصرف بيتثبت).
 * ٤ → ٥ تقديم التنازل (DEAL-02): العقد الابتدائي متحقق منه + محضر العربون متحقق منه + العربون محفوظ في البنك + تعهد المشتري (نموذج 6) موقّع + مندوب.
 * ٥ → ٦ موافقة الجهاز: إيصال التقديم اترفع.
 * ٦ → ٧ الإغلاق: خطاب موافقة الجهاز معتمد. (صرف العربون للبائع بيحصل في مرحلة ٧)
 */
export const TRANSITIONS: Record<Exclude<Stage, "CLOSED">, { check: Blocker; ok: (f: DealFacts) => boolean }[]> = {
  INTEREST: [
    { check: "need_broker", ok: (f) => f.hasBroker },
    { check: "need_commission_signed", ok: (f) => signed(f, "COMMISSION_AGREEMENT") },
  ],
  COMMISSION_AGREEMENT: [
    { check: "need_price_confirmed", ok: (f) => !!f.priceConfirmed },
    { check: "need_agreed_price", ok: (f) => !!f.agreedPrice && f.agreedPrice > 0 },
  ],
  PRICE_AGREED: [{ check: "need_preliminary_signed", ok: (f) => signed(f, "PRELIMINARY_CONTRACT") }],
  PRELIMINARY_CONTRACT: [
    { check: "need_preliminary_verified", ok: (f) => verified(f, "PRELIMINARY_CONTRACT") },
    { check: "need_deposit_contract_verified", ok: (f) => verified(f, "DEPOSIT_RECEIPT") },
    { check: "need_deposit_held", ok: (f) => f.deposits.some((d) => d.escrowStatus === "HELD") },
    { check: "need_buyer_undertaking", ok: (f) => signed(f, "BUYER_UNDERTAKING") },
    { check: "need_agent", ok: (f) => f.hasAgent },
  ],
  TRANSFER_FILED: [{ check: "need_filing_receipt", ok: (f) => !!f.hasFilingReceipt }],
  AUTHORITY_APPROVED: [{ check: "need_approval_doc", ok: (f) => f.hasAuthorityApprovalDoc }],
};

/** إيه اللي ناقص عشان الصفقة تنتقل للمرحلة اللي بعدها (فاضية = تقدر تنتقل) */
export function blockersToAdvance(f: DealFacts): Blocker[] {
  if (f.status !== "ACTIVE") return ["not_active"];
  if (f.stage === "CLOSED") return ["last_stage"];
  return TRANSITIONS[f.stage].filter((t) => !t.ok(f)).map((t) => t.check);
}

/** المشتري يشوف كود القطعة وبيانات البائع بعد ما اتفاق العمولة يتوقّع من الطرفين */
export function buyerCanSeePlotCode(_stage: string, contracts: { type: string; status: string }[]) {
  return contracts.some((c) => c.type === "COMMISSION_AGREEMENT" && isSignedStatus(c.status));
}

/** والمستندات نفسها بعد ما العقد المبدئي يتوقّع من الطرفين */
export function buyerCanSeeFiles(_stage: string, contracts: { type: string; status: string }[]) {
  return contracts.some((c) => c.type === "PRELIMINARY_CONTRACT" && isSignedStatus(c.status));
}

/** مين لازم يوقّع كل نوع عقد */
export function requiredSigners(type: string): ("BUYER" | "SELLER")[] {
  if (type === "POWER_OF_ATTORNEY") return ["SELLER"];
  if (type === "BUYER_UNDERTAKING") return ["BUYER"];
  return ["BUYER", "SELLER"];
}
