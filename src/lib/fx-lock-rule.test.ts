import { describe, expect, it } from "vitest";
import { fxLockUpdate } from "./fx-lock-rule";

const rate = { id: "r1", sell: 50.43, source: "CBE" };
const now = new Date("2026-11-27T10:00:00Z");

describe("DEAL-01 FX lock happens only when the preliminary contract is fully signed", () => {
  it("stage 3 / not yet signed → nothing locked (rate stays indicative)", () => {
    expect(fxLockUpdate({ contractType: "PRELIMINARY_CONTRACT", signingComplete: false, alreadyLockedAt: null, rate, now })).toBeNull();
  });
  it("other contracts (commission agreement) never lock the rate", () => {
    expect(fxLockUpdate({ contractType: "COMMISSION_AGREEMENT", signingComplete: true, alreadyLockedAt: null, rate, now })).toBeNull();
  });
  it("both parties sign form 3 → value, time, record and source are stored", () => {
    expect(fxLockUpdate({ contractType: "PRELIMINARY_CONTRACT", signingComplete: true, alreadyLockedAt: null, rate, now })).toEqual({ lockedUsdEgpRate: 50.43, exchangeRateId: "r1", rateLockedAt: now, fxSource: "CBE" });
  });
  it("once locked it never changes", () => {
    expect(fxLockUpdate({ contractType: "PRELIMINARY_CONTRACT", signingComplete: true, alreadyLockedAt: new Date("2026-11-20"), rate: { ...rate, sell: 52 }, now })).toBeNull();
  });
});
