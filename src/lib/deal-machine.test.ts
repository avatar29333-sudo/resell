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

describe("مراحل الصفقة", () => {
  it("بتمشي بالترتيب", () => {
    expect(nextStage("INTEREST")).toBe("COMMISSION_AGREEMENT");
    expect(nextStage("AUTHORITY_APPROVED")).toBe("CLOSED");
    expect(nextStage("CLOSED")).toBeNull();
  });

  it("الاهتمام محتاج وسيط", () => {
    expect(blockersToAdvance({ ...base, hasBroker: false })).toEqual(["need_broker"]);
    expect(blockersToAdvance(base)).toEqual([]);
  });

  it("اتفاق العمولة لازم يبقى متوقّع", () => {
    const f = { ...base, stage: "COMMISSION_AGREEMENT" as const };
    expect(blockersToAdvance(f)).toEqual(["need_commission_signed"]);
    expect(blockersToAdvance({ ...f, contracts: [{ type: "COMMISSION_AGREEMENT", status: "APPROVED" }] })).toEqual([
      "need_commission_signed",
    ]);
    expect(blockersToAdvance({ ...f, contracts: [{ type: "COMMISSION_AGREEMENT", status: "SIGNED" }] })).toEqual([]);
  });

  it("العقد المبدئي محتاج توقيع وعربون محفوظ", () => {
    const f = { ...base, stage: "PRELIMINARY_CONTRACT" as const };
    expect(blockersToAdvance(f)).toEqual(["need_preliminary_signed", "need_deposit_held"]);
    expect(
      blockersToAdvance({
        ...f,
        contracts: [{ type: "PRELIMINARY_CONTRACT", status: "SIGNED" }],
        deposits: [{ escrowStatus: "HELD" }],
      }),
    ).toEqual([]);
  });

  it("الصفقة ما تقفلش قبل ما العربون يتصرف", () => {
    const f = { ...base, stage: "AUTHORITY_APPROVED" as const, deposits: [{ escrowStatus: "HELD" }] };
    expect(blockersToAdvance(f)).toEqual(["need_deposit_released"]);
  });

  it("صفقة متوقفة أو ملغية ما تتحركش", () => {
    expect(blockersToAdvance({ ...base, status: "ON_HOLD" })).toEqual(["not_active"]);
    expect(blockersToAdvance({ ...base, status: "CANCELLED" })).toEqual(["not_active"]);
  });
});

describe("صلاحيات المشتري", () => {
  it("كود القطعة بعد اتفاق العمولة بس", () => {
    expect(buyerCanSeePlotCode("INTEREST", [])).toBe(false);
    expect(buyerCanSeePlotCode("COMMISSION_AGREEMENT", [{ type: "COMMISSION_AGREEMENT", status: "SENT_FOR_SIGNATURE" }])).toBe(false);
    expect(buyerCanSeePlotCode("COMMISSION_AGREEMENT", [{ type: "COMMISSION_AGREEMENT", status: "SIGNED" }])).toBe(true);
    expect(buyerCanSeePlotCode("PRICE_AGREED", [])).toBe(true);
  });

  it("الملفات بعد العقد المبدئي بس", () => {
    expect(buyerCanSeeFiles("PRICE_AGREED", [])).toBe(false);
    expect(buyerCanSeeFiles("PRELIMINARY_CONTRACT", [{ type: "PRELIMINARY_CONTRACT", status: "SIGNED" }])).toBe(true);
    expect(buyerCanSeeFiles("TRANSFER_FILED", [])).toBe(true);
  });
});
