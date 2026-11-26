import { beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "@prisma/client";

// صلاحيات فتح المستندات — بقاعدة بيانات وهمية عشان نختبر القواعد نفسها
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: vi.fn(), headers: vi.fn() }));
const docs = new Map<string, unknown>();
let deals: unknown[] = [];
vi.mock("./db", () => ({
  db: {
    document: { findUnique: vi.fn(async ({ where }: { where: { id: string } }) => docs.get(where.id) ?? null) },
    deal: { findMany: vi.fn(async () => deals) },
    listing: { findUnique: vi.fn(async () => ({ sellerId: "seller" })) },
  },
}));

const { canViewDocument } = await import("./access");

const user = (id: string, role: User["role"] = "CLIENT") => ({ id, role }) as User;
const allocation = { id: "d1", type: "ALLOCATION_LETTER", status: "APPROVED", ownerId: "seller", uploadedById: "seller", listingId: "L1", listing: { status: "PUBLISHED" }, deal: null };
const photo = { ...allocation, id: "p1", type: "SITE_PHOTO" };

describe("مين يفتح المستندات", () => {
  beforeEach(() => {
    docs.clear();
    docs.set("d1", allocation);
    docs.set("p1", photo);
    deals = [];
  });

  it("صور الموقع للعرض المنشور متاحة لأي حد", async () => {
    expect(await canViewDocument(null, "p1")).toBeTruthy();
  });
  it("الزائر ما يفتحش خطاب التخصيص", async () => {
    expect(await canViewDocument(null, "d1")).toBeNull();
  });
  it("صاحب المستند والفريق يفتحوه", async () => {
    expect(await canViewDocument(user("seller"), "d1")).toBeTruthy();
    expect(await canViewDocument(user("x", "LAWYER"), "d1")).toBeTruthy();
  });
  it("المشتري ما يفتحوش قبل العقد المبدئي", async () => {
    deals = [{ stage: "PRICE_AGREED", contracts: [{ type: "COMMISSION_AGREEMENT", status: "SIGNED" }] }];
    expect(await canViewDocument(user("buyer"), "d1")).toBeNull();
  });
  it("المشتري يفتحه بعد توقيع العقد المبدئي", async () => {
    deals = [{ stage: "PRELIMINARY_CONTRACT", contracts: [{ type: "PRELIMINARY_CONTRACT", status: "SIGNED" }] }];
    expect(await canViewDocument(user("buyer"), "d1")).toBeTruthy();
  });
});
