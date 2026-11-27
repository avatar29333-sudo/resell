import { describe, expect, it } from "vitest";
import { buildManifest, safeName, toCsv, uniquePaths, verifyManifest, zipPassword } from "./export-core";

const enc = (s: string) => new TextEncoder().encode(s);

describe("ADM-EXP export", () => {
  it("manifest hashes match every file, and any change after export is detected", () => {
    const files = [{ path: "00_ملخص_الصفقة.pdf", data: enc("a") }, { path: "01_العقود/عقد.pdf", data: enc("b") }];
    const m = buildManifest(files, { exportedAt: "2026-11-27T10:00:00Z", exportedBy: "admin", reason: "archive", subject: "RS-DL-1" });
    expect(m.files).toHaveLength(2);
    expect(verifyManifest(files, m)).toBe(true);
    expect(verifyManifest([{ ...files[0], data: enc("tampered") }, files[1]], m)).toBe(false);
  });
  it("Arabic file names stay, but path separators and Windows-forbidden characters are removed", () => {
    expect(safeName('خطاب: التخصيص/نسخة "1"?')).toBe("خطاب_ التخصيص_نسخة _1__");
  });
  it("duplicate names get a number", () => {
    expect(uniquePaths([{ path: "a/x.pdf", data: enc("1") }, { path: "a/x.pdf", data: enc("2") }]).map((e) => e.path)).toEqual(["a/x.pdf", "a/x (2).pdf"]);
  });
  it("CSV has a BOM so Arabic opens correctly in Excel", () => {
    const b = toCsv([["مين", "إيه"], ["أحمد", 'قال "تمام", وكمّل']]);
    expect(b[0]).toBe(0xef);
    expect(new TextDecoder().decode(b)).toContain('"قال ""تمام"", وكمّل"');
  });
  it("strong zip password", () => {
    expect(zipPassword(new Uint8Array(32).map((_, i) => i * 7))).toHaveLength(20);
  });
});

describe("ADM-EXP CSV safety", () => {
  it("neutralises spreadsheet formulas but keeps negative numbers", () => {
    const out = new TextDecoder().decode(toCsv([["=HYPERLINK(1)", "-500", "@x"]]));
    expect(out).toContain("'=HYPERLINK(1)");
    expect(out).toContain(",-500,");
    expect(out).toContain("'@x");
  });
});
