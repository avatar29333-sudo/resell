import { describe, expect, it } from "vitest";
import { CHUNK_BYTES, MAX_UPLOAD_BYTES, checkInit, chunkOk, cleanTitle } from "./upload-rules";

describe("DOC-01 multi-file uploads", () => {
  it("accepts PDF/JPG/PNG up to 20MB and splits into chunks under the Vercel request limit", () => {
    expect(checkInit({ fileName: "a.pdf", mimeType: "application/pdf", size: MAX_UPLOAD_BYTES })).toEqual({ ok: true, chunkCount: 7 });
    expect(CHUNK_BYTES).toBeLessThan(4.5 * 1024 * 1024);
  });
  it("rejects over 20MB, other types, and raw HEIC (must be converted to JPG first)", () => {
    expect(checkInit({ fileName: "a.pdf", mimeType: "application/pdf", size: MAX_UPLOAD_BYTES + 1 })).toEqual({ ok: false, error: "size" });
    expect(checkInit({ fileName: "a.svg", mimeType: "image/svg+xml", size: 10 })).toEqual({ ok: false, error: "type" });
    expect(checkInit({ fileName: "IMG_1.HEIC", mimeType: "", size: 10 })).toEqual({ ok: false, error: "heic" });
  });
  it("each chunk must be exactly the expected size", () => {
    const total = CHUNK_BYTES * 2 + 10;
    expect(chunkOk(0, CHUNK_BYTES, total, 3)).toBe(true);
    expect(chunkOk(2, 10, total, 3)).toBe(true);
    expect(chunkOk(2, 11, total, 3)).toBe(false);
    expect(chunkOk(3, 10, total, 3)).toBe(false);
  });
  it("the title is required", () => {
    expect(cleanTitle("  إيصال   قسط أخير ")).toBe("إيصال قسط أخير");
    expect(cleanTitle("ab")).toBeNull();
  });
});
