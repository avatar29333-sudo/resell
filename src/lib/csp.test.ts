import { describe, expect, it } from "vitest";
import { SECURITY_HEADERS, buildCsp } from "./csp";

describe("SEC-08 security headers", () => {
  const csp = buildCsp("abc123");
  it("locks scripts to a per-request nonce and forbids framing", () => {
    expect(csp).toContain("script-src 'self' 'nonce-abc123' 'strict-dynamic'");
    expect(csp).not.toContain("unsafe-eval");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
  });
  it("allows map tiles and the file vault for images", () => {
    expect(buildCsp("n", { s3Origin: "https://acc.r2.cloudflarestorage.com" })).toContain("https://*.tile.openstreetmap.org");
  });
  it("sets the other required headers", () => {
    expect(SECURITY_HEADERS["X-Frame-Options"]).toBe("DENY");
    expect(SECURITY_HEADERS["X-Content-Type-Options"]).toBe("nosniff");
    expect(SECURITY_HEADERS["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(SECURITY_HEADERS["Permissions-Policy"]).toContain("microphone=()");
  });
});
