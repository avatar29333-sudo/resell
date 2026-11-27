import { describe, expect, it } from "vitest";
import { sniffMime } from "./file-sniff";

const bytes = (...x: number[]) => new Uint8Array(x);
const text = (s: string) => new TextEncoder().encode(s);

describe("SEC-09 upload type by magic bytes", () => {
  it("accepts PDF, JPEG, PNG and WebP by their real bytes", () => {
    expect(sniffMime(text("%PDF-1.7\n..."))).toBe("application/pdf");
    expect(sniffMime(bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0))).toBe("image/jpeg");
    expect(sniffMime(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0))).toBe("image/png");
    expect(sniffMime(new Uint8Array([...text("RIFF"), 0, 0, 0, 0, ...text("WEBPVP8 ")]))).toBe("image/webp");
  });
  it("rejects SVG even when it claims to be an image", () => {
    expect(sniffMime(text('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'))).toBeNull();
    expect(sniffMime(text('<?xml version="1.0"?><svg/>'))).toBeNull();
  });
  it("rejects HTML or anything renamed to .pdf", () => {
    expect(sniffMime(text("<html><body>hi</body></html>"))).toBeNull();
    expect(sniffMime(bytes())).toBeNull();
  });
});
