import { describe, expect, it } from "vitest";
import { totals, txRows, type DealIn } from "./transactions";

const now = new Date("2026-11-27T12:00:00Z");
const deal = (over: Partial<DealIn> = {}): DealIn => ({
  id: "d1",
  buyerId: "b",
  sellerId: "s",
  status: "ACTIVE",
  stage: "PRELIMINARY_CONTRACT",
  deposits: [{ id: "x", amount: 336_000, currency: "EGP", escrowStatus: "HELD", bankReference: "BNK-1", createdAt: new Date("2026-11-01"), heldAt: new Date("2026-11-02"), settledAt: null, payoutNetEgp: null }],
  commission: { sellerAmount: 50_400, buyerAmount: 50_400, status: "PENDING", createdAt: new Date("2026-10-01") },
  ...over,
});

describe("TXN-02 my transactions", () => {
  it("buyer: deposit held, own commission only", () => {
    const r = txRows(deal(), "b", now);
    expect(r.map((x) => [x.item, x.direction])).toEqual([["العربون", "HELD"], ["عمولة المشتري", null]]);
    expect(totals(r)).toEqual({ paid: 0, received: 0, held: 336_000 });
  });
  it("seller receives the released deposit net of fees, never sees the buyer's commission", () => {
    const d = deal({ deposits: [{ ...deal().deposits[0], escrowStatus: "RELEASED_TO_SELLER", settledAt: now, payoutNetEgp: 335_850 }] });
    const r = txRows(d, "s", now);
    expect(r.find((x) => x.item === "صرف العربون")).toMatchObject({ direction: "RECEIVED", amount: 335_850 });
    expect(r.some((x) => x.item === "عمولة المشتري")).toBe(false);
  });
  it("finance sees both commissions and overdue amounts", () => {
    const r = txRows(deal({ status: "COMPLETED", stage: "CLOSED", deposits: [{ ...deal().deposits[0], escrowStatus: "AWAITING_TRANSFER", heldAt: null }] }), null, now);
    expect(r.filter((x) => x.item.startsWith("عمولة")).every((x) => x.overdue)).toBe(true);
    const r2 = txRows(deal({ deposits: [{ ...deal().deposits[0], escrowStatus: "AWAITING_TRANSFER", heldAt: null }] }), null, now);
    expect(r2[0].overdue).toBe(true);
  });
});
