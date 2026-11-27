import { describe, expect, it } from "vitest";
import { cityIdFromSlug, isLatinName, slugFromName, validPattern, validPrefix } from "./geo-rules";

describe("GEO rules", () => {
  it("GEO-03: English names must be Latin", () => {
    expect(isLatinName("District 9")).toBe(true);
    expect(isLatinName("الحي التاسع")).toBe(false);
    expect(isLatinName("District التاسع")).toBe(false);
    expect(isLatinName("10th of Ramadan")).toBe(true);
  });
  it("GEO-04: code pattern needs prefix + number and only dashes", () => {
    expect(validPattern("{prefix}-{block}-{number}")).toBe(true);
    expect(validPattern("{prefix}-{number}")).toBe(true);
    expect(validPattern("{block}-{number}")).toBe(false);
    expect(validPattern("{prefix}/{number}")).toBe(false);
    expect(validPattern("{prefix}-{plot}-{number}")).toBe(false);
    expect(validPrefix("TR")).toBe(true);
    expect(validPrefix("t1")).toBe(false);
  });
  it("GEO-01: a new city gets a slug and a stable key", () => {
    const slug = slugFromName("10th of Ramadan");
    expect(slug).toBe("10th-of-ramadan");
    expect(cityIdFromSlug(slug)).toBe("10TH_OF_RAMADAN");
  });
});
