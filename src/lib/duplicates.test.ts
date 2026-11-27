import { describe, expect, it } from "vitest";
import { distance, findDuplicates, sameBuyerGroups } from "./duplicates";

const p = (id: string, code: string, area = 575, district = "الحي الثاني", city = "SHEIKH_ZAYED") => ({ id, city, district, areaSqm: area, code });

describe("DATA-08 possible duplicate plots", () => {
  it("edit distance", () => {
    expect(distance("SZ-8E-1016", "SZ-8E-1016")).toBe(0);
    expect(distance("SZ-8E-1016", "SZ-8E-1061")).toBe(2);
  });
  it("flags same city + district + area with a close code", () => {
    const g = findDuplicates([p("a", "SZ-8E-1016"), p("b", "sz 8e 1016"), p("c", "SZ-8E-1061"), p("d", "SZ-3A-0450")]);
    expect(g).toHaveLength(1);
    expect(g[0].map((x) => x.id).sort()).toEqual(["a", "b", "c"]);
  });
  it("flags one buyer with deals on two same-size plots in the same district, even with different codes", () => {
    const g = sameBuyerGroups([
      { ...p("a", "SZ-8E-1016"), buyerIds: ["b1"] },
      { ...p("b", "SZ-2C-0333"), buyerIds: ["b1", "b2"] },
      { ...p("c", "SZ-4D-0999"), buyerIds: ["b3"] },
    ]);
    expect(g).toHaveLength(1);
    expect(g[0].map((x) => x.id).sort()).toEqual(["a", "b"]);
  });
  it("ignores different area or district", () => {
    expect(findDuplicates([p("a", "SZ-8E-1016"), p("b", "SZ-8E-1016", 400)])).toEqual([]);
    expect(findDuplicates([p("a", "SZ-8E-1016"), p("b", "SZ-8E-1016", 575, "الحي الأول")])).toEqual([]);
  });
});
