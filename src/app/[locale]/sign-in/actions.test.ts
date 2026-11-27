import { beforeEach, describe, expect, it, vi } from "vitest";

// SEC-01: مع DEMO_MODE=false — الاسم مرفوض، مفيش رمز على الشاشة، والدخول السريع بيترفض من السيرفر
vi.mock("server-only", () => ({}));
const createSession = vi.fn();
const issueCode = vi.fn(async () => ({ ok: true, code: null, channel: "whatsapp" }));
vi.mock("@/lib/auth", () => ({
  DEMO_MODE: false,
  createSession,
  issueCode,
  checkCode: vi.fn(),
  clearPending: vi.fn(),
  getPending: vi.fn(),
  setPending: vi.fn(),
  homeFor: () => "account",
}));
const findUnique = vi.fn(async () => ({ id: "u1", phone: "+201000000001", email: null, anonymizedAt: null, role: "ADMIN" }));
vi.mock("@/lib/db", () => ({ db: { user: { findUnique } } }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

const { identify, demoSignIn } = await import("./actions");

describe("SEC-01 مع DEMO_MODE=false", () => {
  beforeEach(() => vi.clearAllMocks());

  it("كتابة اسم بترجع خطأ تحقق ومن غير ما يدوّر على أي حساب", async () => {
    const f = new FormData();
    f.set("identifier", "مها الشريف");
    const r = await identify("ar", { step: "identify" }, f);
    expect(r.step).toBe("identify");
    expect(r.error).toBeTruthy();
    expect(findUnique).not.toHaveBeenCalled();
    expect(issueCode).not.toHaveBeenCalled();
  });

  it("الرمز ما بيظهرش على الشاشة", async () => {
    const f = new FormData();
    f.set("identifier", "+201000000001");
    const r = await identify("ar", { step: "identify" }, f);
    expect(r.step).toBe("code");
    expect(r.demoCode).toBeNull();
  });

  it("استدعاء الدخول السريع مباشرة بيترفض ومفيش جلسة بتتعمل", async () => {
    await expect(demoSignIn("ar", "u1")).rejects.toThrow();
    expect(createSession).not.toHaveBeenCalled();
  });
});
