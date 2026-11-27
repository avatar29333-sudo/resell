import { describe, expect, it } from "vitest";
import { validatePlotInput } from "./plot-input";

const ctx = {
  cities: ["NEW_CAIRO", "SHEIKH_ZAYED"],
  districts: [
    { id: "d1", city: "NEW_CAIRO", active: true },
    { id: "d2", city: "SHEIKH_ZAYED", active: true },
    { id: "d3", city: "NEW_CAIRO", active: false },
  ],
  today: new Date("2026-11-27T10:00:00Z"),
};
const ok = { city: "NEW_CAIRO", districtId: "d1", code: "nc 8e 1016", area: "405", construction: "20", deadline: "2027-06-01", price: "4000000", priceType: "ALL_INCLUSIVE", paidUsd: "" };

describe("plot input (DATA-07 + DATA-09)", () => {
  it("accepts a valid plot and normalises the code", () => {
    const r = validatePlotInput(ok, ctx);
    expect(r.ok).toBe(true);
    expect(r.values.code).toBe("NC-8E-1016");
    expect(r.values.deadlinePassed).toBe(false);
  });
  it("DATA-07: district must come from the table and match the city", () => {
    expect(validatePlotInput({ ...ok, districtId: "d2" }, ctx).errors.district).toBe("required");
    expect(validatePlotInput({ ...ok, districtId: "d3" }, ctx).errors.district).toBe("required");
  });
  it("DATA-07: code prefix must match the city", () => {
    expect(validatePlotInput({ ...ok, code: "SZ-8E-1016" }, ctx).errors.code).toBe("prefix");
  });
  it("DATA-09: construction must be 0–100", () => {
    expect(validatePlotInput({ ...ok, construction: "150" }, ctx).errors.construction).toBe("range");
    expect(validatePlotInput({ ...ok, construction: "-1" }, ctx).errors.construction).toBe("range");
    expect(validatePlotInput({ ...ok, construction: "" }, ctx).ok).toBe(true);
  });
  it("DATA-09: a past deadline is accepted but flagged", () => {
    const r = validatePlotInput({ ...ok, deadline: "2026-01-15" }, ctx);
    expect(r.ok).toBe(true);
    expect(r.values.deadlinePassed).toBe(true);
  });
  it("premium price needs the USD amount", () => {
    expect(validatePlotInput({ ...ok, priceType: "PAID_PLUS_PREMIUM" }, ctx).errors.paidUsd).toBe("required");
  });
});
