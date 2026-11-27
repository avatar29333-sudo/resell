import { describe, expect, it } from "vitest";
import { referralReward } from "./referral-rules";

const buyer = { id: "b", phone: "+201", referredById: "r" };
const seller = { id: "s", phone: "+202", referredById: null };
const referrers = { r: { id: "r", phone: "+209", status: "ACTIVE" } };

describe("MKT-06 referral reward", () => {
  it("pays a % of the deal's commission when the referred buyer's deal closes", () => {
    expect(referralReward({ buyer, seller, commissionTotal: 100_000 }, referrers, { type: "pct", value: 10 })).toEqual({ referrerId: "r", referredId: "b", amount: 10_000 });
  });
  it("or a fixed amount", () => {
    expect(referralReward({ buyer, seller, commissionTotal: 100_000 }, referrers, { type: "fixed", value: 5_000 })?.amount).toBe(5_000);
  });
  it("blocks self-referral and referrers who are the other party", () => {
    expect(referralReward({ buyer: { ...buyer, phone: "+209" }, seller, commissionTotal: 1e5 }, referrers, { type: "pct", value: 10 })).toBeNull();
    expect(referralReward({ buyer, seller: { ...seller, id: "r" }, commissionTotal: 1e5 }, referrers, { type: "pct", value: 10 })).toBeNull();
  });
  it("nothing without a referrer", () => {
    expect(referralReward({ buyer: { ...buyer, referredById: null }, seller, commissionTotal: 1e5 }, referrers, { type: "pct", value: 10 })).toBeNull();
  });
});
