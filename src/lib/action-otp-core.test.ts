import { describe, expect, it } from "vitest";
import { ACTION_KEYS, CODE_TTL_MS, decide, hashCode, lockAfterWrong, paramsHash } from "./action-otp-core";

const now = new Date("2026-11-27T10:00:00Z");
const row = (over: Partial<Parameters<typeof decide>[0] & object> = {}) => ({
  action: "price.accept",
  dealId: "deal1",
  paramsHash: paramsHash("price.accept", "deal1", { price: 1_250_000 }),
  codeHash: hashCode("482913"),
  expiresAt: new Date(now.getTime() + CODE_TTL_MS),
  usedAt: null,
  attempts: 0,
  ...over,
});
const input = (over: Partial<Parameters<typeof decide>[1]> = {}) => ({ action: "price.accept", dealId: "deal1", paramsHash: paramsHash("price.accept", "deal1", { price: 1_250_000 }), code: "482913", now, ...over });

describe("DEAL-03 action-bound verification codes", () => {
  it("covers all the listed deal actions", () => {
    for (const k of ["commission.approve", "disclosure.consent", "price.offer", "price.accept", "price.reject", "price.counter", "contract.sign", "bank.select", "deposit.sent", "deposit.received", "document.share", "deal.cancel_request", "cancellation.approve", "closing.approve", "listing.withdraw", "listing.reprice"])
      expect(ACTION_KEYS).toContain(k);
  });
  it("accepts the right code for the same action, deal and values", () => {
    expect(decide(row(), input())).toBe("ok");
  });
  it("rejects without a code record", () => {
    expect(decide(null, input())).toBe("missing");
  });
  it("a price-acceptance code can't be used to change the bank account", () => {
    expect(decide(row(), input({ action: "bank.select", paramsHash: paramsHash("bank.select", "deal1", { accountId: "a" }) }))).toBe("mismatch");
  });
  it("a code for one deal can't be used on another deal", () => {
    expect(decide(row(), input({ dealId: "deal2" }))).toBe("mismatch");
  });
  it("changing the values (different price) invalidates the code", () => {
    expect(decide(row(), input({ paramsHash: paramsHash("price.accept", "deal1", { price: 1_300_000 }) }))).toBe("mismatch");
  });
  it("expired and already-used codes are rejected", () => {
    expect(decide(row({ expiresAt: new Date(now.getTime() - 1) }), input())).toBe("expired");
    expect(decide(row({ usedAt: now }), input())).toBe("used");
  });
  it("wrong codes, and 5 wrong attempts lock the action for 15 minutes", () => {
    expect(decide(row(), input({ code: "000000" }))).toBe("wrong");
    expect(lockAfterWrong(4, now)).toBeNull();
    expect(lockAfterWrong(5, now)?.getTime()).toBe(now.getTime() + 15 * 60_000);
    expect(decide(row(), input({ lockedUntil: new Date(now.getTime() + 60_000) }))).toBe("locked");
  });
});
