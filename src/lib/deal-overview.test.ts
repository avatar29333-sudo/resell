import { describe, expect, it } from "vitest";
import { daysLeft, depositBar, eventCategory, eventSentence, isUrgent, moneyFor, nextActionFor, timeline, type OverviewInput } from "./deal-overview";
import { bidiRuns } from "./pdf-ar";

const base: OverviewInput = {
  stage: "PRELIMINARY_CONTRACT",
  status: "ACTIVE",
  hasBroker: true,
  hasAgent: false,
  agreedPrice: 3_360_000,
  hasAuthorityApprovalDoc: false,
  priceConfirmed: true,
  proposedPrice: 3_360_000,
  buyerPriceOkAt: new Date(),
  sellerPriceOkAt: new Date(),
  contracts: [{ id: "c1", type: "PRELIMINARY_CONTRACT", status: "PARTIALLY_SIGNED", signatures: [{ role: "BUYER" }] }],
  deposits: [{ id: "d1", amount: 336_000, escrowStatus: "AWAITING_TRANSFER", buyerSentAt: null, sellerReceivedAt: null, bankReference: null, heldAt: null, settledAt: null }],
  stageEnteredAt: new Date("2026-11-20T00:00:00Z"),
};
const money = { price: 3_360_000, commission: { sellerAmount: 50_400, buyerAmount: 50_400, sellerRatePct: 1.5, buyerRatePct: 1.5, status: "PENDING" }, deposits: base.deposits, fees: { transferFeeEgp: 25_000, notaryFeeEgp: 3_000 }, remainingUsd: 12_000 };

describe("TXN-01 deal overview", () => {
  it("tells the seller to sign what's waiting on them", () => {
    const a = nextActionFor(base, "SELLER", true)!;
    expect(a.mine).toBe(true);
    expect(a.text).toBe("نزّل العقد الابتدائي ووقّعه وارفعه");
  });
  it("tells the buyer to transfer the deposit once their signature is done", () => {
    const a = nextActionFor(base, "BUYER", true)!;
    expect(a.mine && a.text).toContain("حوّل العربون 336,000");
  });
  it("shows who we're waiting for when nothing is required from you", () => {
    const f = { ...base, contracts: [], deposits: [] };
    const a = nextActionFor(f, "BUYER", true)!;
    expect(a.mine).toBe(false);
    expect(a.text).toMatch(/^في انتظار: المحامي — /);
  });
  it("seller net = price − own commission; buyer never sees the seller's commission", () => {
    const s = moneyFor("SELLER", money);
    expect(s.total.amount).toBe(3_360_000 - 50_400);
    const b = moneyFor("BUYER", money);
    expect(b.total.amount).toBe(3_360_000 + 50_400 + 25_000 + 3_000);
    expect(b.lines.every((l) => l.payee[0] !== "Resell" || l.payer[0] === "أنت")).toBe(true);
    expect(b.after?.currency).toBe("USD");
    expect(s.lines.some((l) => l.label[0].includes("رسوم التنازل"))).toBe(false);
  });
  it("deposit bar: unpaid → escrow → released/refunded", () => {
    expect(depositBar(undefined).map((s) => s.state)).toEqual(["current", "todo", "todo"]);
    expect(depositBar({ ...base.deposits[0], escrowStatus: "HELD" }).map((s) => s.state)).toEqual(["done", "current", "todo"]);
    expect(depositBar({ ...base.deposits[0], escrowStatus: "REFUNDED_TO_BUYER" }).map((s) => s.key)).toEqual(["unpaid", "held", "refunded"]);
  });
  it("timeline has 7 stages with conditions and owners", () => {
    const t = timeline(base);
    expect(t).toHaveLength(7);
    expect(t[3].state).toBe("current");
    expect(t[3].conds.find((c) => c.key === "need_preliminary_verified")?.owner[0]).toBe("المحامي");
    expect(t[3].dueAt).not.toBeNull();
  });
  it("countdown goes red under 3 days", () => {
    const now = new Date("2026-11-27T00:00:00Z");
    expect(daysLeft(new Date("2026-11-29T00:00:00Z"), now)).toBe(2);
    expect(isUrgent(2)).toBe(true);
    expect(isUrgent(3)).toBe(false);
  });
  it("log entries read as sentences, not codes", () => {
    expect(eventSentence({ type: "CONTRACT_UPDATED", toStage: null, data: { type: "COMMISSION_AGREEMENT", signedBy: "BUYER", complete: false } }, "أحمد", true)).toBe("أحمد وقّع اتفاق العمولة");
    expect(eventSentence({ type: "NOTE", toStage: null, data: { counterPrice: 3_200_000, by: "BUYER" } }, "x", true)).toBe("المشتري قدّم عرض مقابل 3,200,000 ج.م");
    expect(eventCategory("DEPOSIT_UPDATED", {})).toBe("money");
    expect(eventCategory("NOTE", { note: "hi" })).toBe("comms");
  });
  it("PDF bidi: numbers and codes stay left-to-right inside Arabic, trailing period follows the sentence", () => {
    expect(bidiRuns("صفقة RS-DL-58DDDB تمام.")).toEqual([
      { text: "صفقة ", rtl: true },
      { text: "RS-DL-58DDDB", rtl: false },
      { text: " تمام.", rtl: true },
    ]);
    expect(bidiRuns("بتاريخ 2026.").map((r) => r.text)).toEqual(["بتاريخ ", "2026", "."]);
  });
});

describe("DOC-01 document requests become a task", () => {
  it("a lawyer's request shows as 'please upload' for that side only", () => {
    const f = { ...base, contracts: [], docRequests: [{ side: "SELLER", title: "خطاب من الجهاز" }] };
    expect(nextActionFor(f, "SELLER", true)).toMatchObject({ mine: true, text: "مطلوب منك رفع: خطاب من الجهاز", anchor: "#other-docs" });
    expect(nextActionFor(f, "BUYER", true)?.text).not.toContain("خطاب من الجهاز");
  });
});

describe("FEE-01 transfer fees are on the recipient", () => {
  it("a refunded deposit shows the buyer the amount, the fee and the net", () => {
    const deposits = [{ ...base.deposits[0], escrowStatus: "REFUNDED_TO_BUYER", payoutFeeEgp: 150, payoutNetEgp: 335_850 }];
    const b = moneyFor("BUYER", { ...money, deposits });
    const rows = Object.fromEntries(b.lines.map((l) => [l.label[0], l.amount]));
    expect(rows["رد العربون — المبلغ المحوَّل"]).toBe(336_000);
    expect(rows["مصاريف التحويل (يتحملها المستلم)"]).toBe(150);
    expect(rows["الصافي اللي وصلك"]).toBe(335_850);
  });
  it("the seller's expected net deducts the bank fee they bear, never the platform", () => {
    const s = moneyFor("SELLER", { ...money, fees: { ...money.fees, bankFeeEstimateEgp: 200 } });
    expect(s.total.amount).toBe(3_360_000 - 50_400 - 200);
    expect(s.lines.find((l) => l.label[0].includes("مصاريف التحويل"))?.payer[0]).toBe("أنت");
  });
});
