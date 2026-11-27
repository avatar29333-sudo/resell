import { describe, expect, it } from "vitest";
import { CITY_SLUG, cityFromSlug, slugify } from "./slugs";

describe("MKT-08 city and district URLs", () => {
  it("round-trips city slugs", () => {
    for (const [k, s] of Object.entries(CITY_SLUG)) expect(cityFromSlug(s)).toBe(k);
    expect(cityFromSlug("nowhere")).toBeNull();
  });
  it("slugifies English district names", () => {
    expect(slugify("Phase 4")).toBe("phase-4");
    expect(slugify("Universities Zone")).toBe("universities-zone");
  });
});
