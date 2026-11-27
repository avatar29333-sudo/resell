import { describe, expect, it } from "vitest";
import { checkCode, normalizeCode } from "./plot-code";

describe("DATA-07 plot code", () => {
  it("normalises case, Arabic digits, spaces and extra separators", () => {
    expect(normalizeCode(" nc - 8e -- ١٠١٦ ")).toBe("NC-8E-1016");
    expect(normalizeCode("sz_12/0045")).toBe("SZ-12-0045");
  });
  it("accepts the agreed format with the city's prefix", () => {
    expect(checkCode("NEW_CAIRO", "nc 8e 1016")).toEqual({ code: "NC-8E-1016", error: null });
  });
  it("rejects a prefix that doesn't match the city", () => {
    expect(checkCode("NEW_CAIRO", "SZ-8E-1016").error).toBe("prefix");
  });
  it("rejects anything outside the format", () => {
    expect(checkCode("NEW_CAIRO", "1016").error).toBe("format");
    expect(checkCode("NEW_CAIRO", "NC-ABCDE-1").error).toBe("format");
  });
  it("two spellings of the same code collapse to one (duplicate check)", () => {
    expect(normalizeCode("NC 8E-1016")).toBe(normalizeCode("nc-8e--1016"));
  });
});

describe("GEO-04 per-city code pattern", () => {
  it("hint follows the city's prefix", async () => {
    const { codeHint } = await import("./plot-code");
    expect(codeHint({ codePrefix: "SZ" }, true)).toEqual({ example: "SZ-8E-1016", words: "SZ-البلوك-الرقم" });
  });
  it("a new city with its own pattern validates against it", () => {
    const spec = { codePrefix: "TR", plotCodePattern: "{prefix}/{number}" };
    expect(checkCode("TENTH", "tr/0045", spec)).toEqual({ code: "TR-0045", error: "format" }); // الفاصل بيتوحد لشرطة
    const dash = { codePrefix: "TR", plotCodePattern: "{prefix}-{number}" };
    expect(checkCode("TENTH", "tr 45", dash)).toEqual({ code: "TR-45", error: null });
    expect(checkCode("TENTH", "NC-45", dash).error).toBe("prefix");
    expect(checkCode("TENTH", "TR-8E-45", dash).error).toBe("format");
  });
});
