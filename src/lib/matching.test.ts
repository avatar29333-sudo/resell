import { describe, expect, it } from "vitest";
import { matches } from "./matching";

const listing = { city: "NEW_CAIRO", areaSqm: 400, totalEgp: 10_000_000 };

describe("مطابقة طلبات الشراء", () => {
  it("بيطابق لو كل الشروط متحققة", () => {
    expect(matches({ cities: ["NEW_CAIRO"], minAreaSqm: 300, maxAreaSqm: 500, budgetMax: 12_000_000 }, listing)).toBe(true);
  });
  it("أي مدينة لو القايمة فاضية", () => {
    expect(matches({ cities: [], minAreaSqm: null, maxAreaSqm: null, budgetMax: null }, listing)).toBe(true);
  });
  it("مدينة تانية أو مساحة برّه المدى أو ميزانية أقل = مفيش مطابقة", () => {
    expect(matches({ cities: ["OCTOBER"], minAreaSqm: null, maxAreaSqm: null, budgetMax: null }, listing)).toBe(false);
    expect(matches({ cities: [], minAreaSqm: 450, maxAreaSqm: null, budgetMax: null }, listing)).toBe(false);
    expect(matches({ cities: [], minAreaSqm: null, maxAreaSqm: 350, budgetMax: null }, listing)).toBe(false);
    expect(matches({ cities: [], minAreaSqm: null, maxAreaSqm: null, budgetMax: 9_000_000 }, listing)).toBe(false);
  });
});
