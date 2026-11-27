import { describe, expect, it } from "vitest";
import { stepErrors } from "./wizard-rules";

const step0 = { city: "NEW_CAIRO", districtId: "d1", code: "NC-8E-1016", area: "405", construction: "20", deadline: "" };

describe("UX-02 wizard validates step by step", () => {
  it("150% construction is stopped on step 1 with a message (not silently on step 3)", () => {
    expect(stepErrors(0, { ...step0, construction: "150" }, {})).toEqual({ construction: "range" });
  });
  it("a valid first step passes", () => {
    expect(stepErrors(0, step0, {})).toEqual({});
  });
  it("missing district and wrong code prefix are caught before moving on", () => {
    expect(stepErrors(0, { ...step0, districtId: "", code: "SZ-1-1" }, {})).toEqual({ district: "required", code: "prefix" });
  });
  it("price step and documents step", () => {
    expect(stepErrors(1, { priceType: "PAID_PLUS_PREMIUM", price: "100" }, {})).toEqual({ paidUsd: "required" });
    expect(stepErrors(2, {}, {})).toEqual({ allocation: "required" });
    expect(stepErrors(2, {}, { allocation: { id: "x", name: "a.pdf" } })).toEqual({});
  });
});
