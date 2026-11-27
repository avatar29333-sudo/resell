import { describe, expect, it } from "vitest";
import { auditLabel } from "./audit-labels";

describe("UX-09 audit log in plain language", () => {
  it("translates known codes", () => {
    expect(auditLabel("auth.demo_sign_in", "ar")).toBe("دخول سريع بحساب تجربة");
    expect(auditLabel("auth.demo_sign_in", "en")).toBe("Demo quick sign-in");
    expect(auditLabel("payment.approval_requested", "ar")).toContain("أربع عيون");
  });
  it("falls back to the group name for unknown codes", () => {
    expect(auditLabel("deal.something_new", "ar")).toBe("الصفقات: something new");
    expect(auditLabel("weird", "en")).toBe("weird");
  });
});
