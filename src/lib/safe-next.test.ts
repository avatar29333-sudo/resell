import { describe, expect, it } from "vitest";
import { safeNext } from "./safe-next";

describe("UX-03 return to the requested page after sign-in", () => {
  it("allows internal paths in the same language", () => {
    expect(safeNext("ar", "/ar/deals/abc?tab=x")).toBe("/ar/deals/abc?tab=x");
    expect(safeNext("en", "/en/account#kyc")).toBe("/en/account#kyc");
  });
  it("blocks open redirects", () => {
    expect(safeNext("ar", "https://evil.com")).toBeNull();
    expect(safeNext("ar", "//evil.com")).toBeNull();
    expect(safeNext("ar", "/ar/\\evil.com")).toBeNull();
    expect(safeNext("ar", "/%2F%2Fevil.com")).toBeNull();
    expect(safeNext("ar", "/ar/%0d%0aSet-Cookie:x")).toBeNull();
    expect(safeNext("ar", "javascript:alert(1)")).toBeNull();
  });
  it("ignores other languages and the sign-in page itself", () => {
    expect(safeNext("ar", "/en/account")).toBeNull();
    expect(safeNext("ar", "/ar/sign-in?next=/ar/x")).toBeNull();
    expect(safeNext("ar", null)).toBeNull();
  });
});
