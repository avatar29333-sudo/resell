import { describe, expect, it } from "vitest";
import { blockersToAdvance, buyerCanSeeFiles, buyerCanSeePlotCode, nextStage, type DealFacts } from "./deal-machine";

const base: DealFacts = {
  stage: "INTEREST",
  status: "ACTIVE",
  hasBroker: true,
  hasAgent: false,
  agreedPrice: null,
  contracts: [],
  deposits: [],
  hasAuthorityApprovalDoc: false,
};

describe("DATA-05 — شروط الانتقال", () => {
  it("المراحل بالترتيب", () => {
    expect(nextStage("INTEREST")).toBe("COMMISSION_AGREEMENT");
    expect(nextStage("AUTHORITY_APPROVED")).toBe("CLOSED");
    expect(nextStage("CLOSED")).toBeNull();
  });

  it("في «اهتمام» الشرط = اتفاق العمولة متوقّع من الطرفين (مش «كل الشروط اتحققت»)", () => {
    expect(blockersToAdvance(base)).toEqual(["need_commission_signed"]);
    expect(blockersToAdvance({ ...base, hasBroker: false })).toEqual(["need_broker", "need_commission_signed"]);
    expect(blockersToAdvance({ ...base, contracts: [{ type: "COMMISSION_AGREEMENT", status: "SENT_FOR_SIGNATURE" }] })).toEqual(["need_commission_signed"]);
    expect(blockersToAdvance({ ...base, contracts: [{ type: "COMMISSION_AGREEMENT", status: "SIGNED" }] })).toEqual([]);
  });

  it("اتفاق السعر: موافقة الطرفين + تسجيل السعر", () => {
    const f = { ...base, stage: "COMMISSION_AGREEMENT" as const };
    expect(blockersToAdvance(f)).toEqual(["need_price_confirmed", "need_agreed_price"]);
    expect(blockersToAdvance({ ...f, priceConfirmed: true, agreedPrice: 4_000_000 })).toEqual([]);
  });

  it("العقد المبدئي لازم يتوقّع", () => {
    const f = { ...base, stage: "PRICE_AGREED" as const };
    expect(blockersToAdvance(f)).toEqual(["need_preliminary_signed"]);
    expect(blockersToAdvance({ ...f, contracts: [{ type: "PRELIMINARY_CONTRACT", status: "SIGNED" }] })).toEqual([]);
  });

  it("التقديم في الجهاز: عربون محفوظ + مندوب", () => {
    const f = { ...base, stage: "PRELIMINARY_CONTRACT" as const };
    // DEAL-02: الانتقال لـ «تقديم التنازل» محتاج نموذج 3 ونموذج 4 متحقق منهم + العربون في البنك + نموذج 6 موقّع + مندوب
    expect(blockersToAdvance(f)).toEqual(["need_preliminary_verified", "need_deposit_contract_verified", "need_deposit_held", "need_buyer_undertaking", "need_agent"]);
    const ready = {
      ...f,
      deposits: [{ escrowStatus: "HELD" }],
      hasAgent: true,
      contracts: [
        { type: "PRELIMINARY_CONTRACT", status: "VERIFIED" },
        { type: "DEPOSIT_RECEIPT", status: "VERIFIED" },
        { type: "BUYER_UNDERTAKING", status: "SIGNED" },
      ],
    };
    expect(blockersToAdvance(ready)).toEqual([]);
    // regression: العقد الابتدائي «موقّع» بس من غير تحقق ما يكفيش
    expect(blockersToAdvance({ ...ready, contracts: [{ type: "PRELIMINARY_CONTRACT", status: "SIGNED" }, ready.contracts[1], ready.contracts[2]] })).toEqual(["need_preliminary_verified"]);
    // ومن غير تعهد المشتري ما ينفعش
    expect(blockersToAdvance({ ...ready, contracts: ready.contracts.slice(0, 2) })).toEqual(["need_buyer_undertaking"]);
  });

  it("موافقة الجهاز بعد إيصال التقديم، والإغلاق بعد اعتماد خطاب الموافقة", () => {
    expect(blockersToAdvance({ ...base, stage: "TRANSFER_FILED" })).toEqual(["need_filing_receipt"]);
    expect(blockersToAdvance({ ...base, stage: "TRANSFER_FILED", hasFilingReceipt: true })).toEqual([]);
    expect(blockersToAdvance({ ...base, stage: "AUTHORITY_APPROVED" })).toEqual(["need_approval_doc"]);
    expect(blockersToAdvance({ ...base, stage: "AUTHORITY_APPROVED", hasAuthorityApprovalDoc: true })).toEqual([]);
  });

  it("صفقة متوقفة أو ملغية أو مقفولة ما تتحركش", () => {
    expect(blockersToAdvance({ ...base, status: "ON_HOLD" })).toEqual(["not_active"]);
    expect(blockersToAdvance({ ...base, status: "CANCELLED" })).toEqual(["not_active"]);
    expect(blockersToAdvance({ ...base, stage: "CLOSED" })).toEqual(["last_stage"]);
  });
});

describe("كشف البيانات للمشتري", () => {
  it("كود القطعة بعد توقيع اتفاق العمولة", () => {
    expect(buyerCanSeePlotCode("INTEREST", [])).toBe(false);
    expect(buyerCanSeePlotCode("INTEREST", [{ type: "COMMISSION_AGREEMENT", status: "SENT_FOR_SIGNATURE" }])).toBe(false);
    expect(buyerCanSeePlotCode("COMMISSION_AGREEMENT", [{ type: "COMMISSION_AGREEMENT", status: "SIGNED" }])).toBe(true);
  });
  it("الملفات بعد العقد المبدئي", () => {
    expect(buyerCanSeeFiles("PRICE_AGREED", [])).toBe(false);
    expect(buyerCanSeeFiles("PRELIMINARY_CONTRACT", [{ type: "PRELIMINARY_CONTRACT", status: "SIGNED" }])).toBe(true);
  });
});
