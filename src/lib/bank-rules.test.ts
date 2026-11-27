import { describe, expect, it } from "vitest";
import { COOLING_MS, ibanValid, maskIban, namesMatch, netAfterFees, payoutBlock, swiftValid } from "./bank-rules";

describe("BANK-01 bank accounts", () => {
  it("validates Egyptian and foreign IBANs by length and mod-97", () => {
    expect(ibanValid("EG38 0019 0005 0000 0000 2631 8000 2")).toBe(true);
    expect(ibanValid("EG38 0019 0005 0000 0000 2631 8000 3")).toBe(false); // رقم مراجعة غلط
    expect(ibanValid("EG38001900050000000026318")).toBe(false); // طول غلط
    expect(ibanValid("GB82 WEST 1234 5698 7654 32")).toBe(true);
    expect(ibanValid("SA03 8000 0000 6080 1016 7519")).toBe(true);
    expect(ibanValid("DE89 3704 0044 0532 0130 00")).toBe(true);
  });
  it("validates SWIFT/BIC 8 or 11 characters", () => {
    expect(swiftValid("NBEGEGCX")).toBe(true);
    expect(swiftValid("NBEGEGCX001")).toBe(true);
    expect(swiftValid("NBEGEGC")).toBe(false);
  });
  it("masks the IBAN", () => {
    expect(maskIban("EG380019000500000000263180002")).toBe("EG•• •••• •••• 0002");
  });
  it("account holder must be the verified user (no third-party accounts)", () => {
    expect(namesMatch("أحمد محمد علي", "احمد  محمد علي")).toBe(true);
    expect(namesMatch("علي محمد أحمد", "أحمد محمد علي")).toBe(true);
    expect(namesMatch("أحمد محمد", "محمود محمد")).toBe(false);
  });
  it("payouts only to a VERIFIED account of the recipient, after the 48h cooling period", () => {
    const now = new Date("2026-11-27T12:00:00Z");
    const ok = { status: "VERIFIED", usableAfter: new Date(now.getTime() - 1), userId: "u1" };
    expect(payoutBlock(ok, "u1", now)).toBeNull();
    expect(payoutBlock({ ...ok, status: "PENDING" }, "u1", now)).toBe("not_verified");
    expect(payoutBlock({ ...ok, usableAfter: new Date(now.getTime() + COOLING_MS) }, "u1", now)).toBe("cooling");
    expect(payoutBlock({ ...ok, status: "DISABLED" }, "u1", now)).toBe("disabled");
    expect(payoutBlock(ok, "u2", now)).toBe("wrong_owner");
    expect(payoutBlock(null, "u1", now)).toBe("no_account");
  });
  it("FEE-01: the recipient bears the transfer fee", () => {
    expect(netAfterFees(336_000, 150)).toEqual({ amount: 336_000, fee: 150, net: 335_850 });
  });
});
