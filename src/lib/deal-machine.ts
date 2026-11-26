// مراحل الصفقة كـ state machine: كل انتقال له شروط.
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
  hasAuthorityApprovalDoc: boolean;
};

export type Blocker =
  | "not_active"
  | "last_stage"
  | "need_broker"
  | "need_commission_signed"
  | "need_agreed_price"
  | "need_preliminary_signed"
  | "need_deposit_held"
  | "need_agent"
  | "need_approval_doc"
  | "need_deposit_released";

export const BLOCKER_TEXT: Record<Blocker, [string, string]> = {
  not_active: ["الصفقة مش شغالة", "The deal is not active"],
  last_stage: ["الصفقة في آخر مرحلة", "The deal is at its last stage"],
  need_broker: ["لازم وسيط مسؤول عن الصفقة", "A broker must be assigned"],
  need_commission_signed: ["اتفاق العمولة لازم يتوقّع من الطرفين", "The commission agreement must be signed by both sides"],
  need_agreed_price: ["لازم السعر المتفق يتسجل", "The agreed price must be recorded"],
  need_preliminary_signed: ["العقد المبدئي لازم يتوقّع", "The preliminary contract must be signed"],
  need_deposit_held: ["العربون لازم يبقى محفوظ في البنك", "The deposit must be held in escrow"],
  need_agent: ["لازم مندوب للتقديم في الجهاز", "A field agent must be assigned"],
  need_approval_doc: ["لازم يترفع خطاب موافقة الجهاز", "The authority approval letter must be uploaded"],
  need_deposit_released: ["العربون لازم يتصرف للبائع قبل الإغلاق", "The deposit must be released before closing"],
};

export function stageIndex(stage: string) {
  return STAGES.indexOf(stage as Stage);
}

export function nextStage(stage: Stage): Stage | null {
  const i = stageIndex(stage);
  return i >= 0 && i < STAGES.length - 1 ? STAGES[i + 1] : null;
}

const signed = (f: DealFacts, type: string) => f.contracts.some((c) => c.type === type && c.status === "SIGNED");

/** إيه اللي ناقص عشان الصفقة تنتقل للمرحلة اللي بعدها (فاضية = تقدر تنتقل) */
export function blockersToAdvance(f: DealFacts): Blocker[] {
  if (f.status !== "ACTIVE") return ["not_active"];
  const b: Blocker[] = [];
  switch (f.stage) {
    case "INTEREST":
      if (!f.hasBroker) b.push("need_broker");
      break;
    case "COMMISSION_AGREEMENT":
      if (!signed(f, "COMMISSION_AGREEMENT")) b.push("need_commission_signed");
      break;
    case "PRICE_AGREED":
      if (!f.agreedPrice || f.agreedPrice <= 0) b.push("need_agreed_price");
      break;
    case "PRELIMINARY_CONTRACT":
      if (!signed(f, "PRELIMINARY_CONTRACT")) b.push("need_preliminary_signed");
      if (!f.deposits.some((d) => d.escrowStatus === "HELD")) b.push("need_deposit_held");
      break;
    case "TRANSFER_FILED":
      if (!f.hasAgent) b.push("need_agent");
      if (!f.hasAuthorityApprovalDoc) b.push("need_approval_doc");
      break;
    case "AUTHORITY_APPROVED":
      if (!f.deposits.some((d) => d.escrowStatus === "RELEASED_TO_SELLER")) b.push("need_deposit_released");
      break;
    case "CLOSED":
      b.push("last_stage");
      break;
  }
  return b;
}

/** المشتري يشوف كود القطعة وبيانات البائع بعد ما اتفاق العمولة يتوقّع بس */
export function buyerCanSeePlotCode(stage: string, contracts: { type: string; status: string }[]) {
  return stageIndex(stage) >= stageIndex("PRICE_AGREED") || contracts.some((c) => c.type === "COMMISSION_AGREEMENT" && c.status === "SIGNED");
}

/** والمستندات نفسها بعد العقد المبدئي بس */
export function buyerCanSeeFiles(stage: string, contracts: { type: string; status: string }[]) {
  return stageIndex(stage) >= stageIndex("TRANSFER_FILED") || contracts.some((c) => c.type === "PRELIMINARY_CONTRACT" && c.status === "SIGNED");
}

/** مين لازم يوقّع كل نوع عقد */
export function requiredSigners(type: string): ("BUYER" | "SELLER")[] {
  return type === "POWER_OF_ATTORNEY" ? ["SELLER"] : ["BUYER", "SELLER"];
}
