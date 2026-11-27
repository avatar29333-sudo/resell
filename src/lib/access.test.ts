import { beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "@prisma/client";

// صلاحيات فتح المستندات من خلال canViewDocument (قاعدة بيانات وهمية) — SEC-06
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: vi.fn(), headers: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("./audit", () => ({ audit: vi.fn() }));
const docs = new Map<string, unknown>();
let deals: unknown[] = [];
let kyc: unknown = null;
let conflictDeal: unknown = null;
vi.mock("./db", () => ({
  db: {
    document: { findUnique: vi.fn(async ({ where }: { where: { id: string } }) => docs.get(where.id) ?? null) },
    deal: { findMany: vi.fn(async () => deals), findFirst: vi.fn(async () => conflictDeal) },
    kycProfile: { findFirst: vi.fn(async () => kyc) },
  },
}));

const { canViewDocument } = await import("./access");

const user = (id: string, role: User["role"] = "CLIENT") => ({ id, role, accountLevel: "VERIFIED", status: "ACTIVE" }) as User;
const listing = { sellerId: "seller", assignedBrokerId: "broker", assignedLawyerId: "lawyer", status: "PUBLISHED", documents: [], deals: [] };
const allocation = { id: "d1", type: "ALLOCATION_LETTER", status: "APPROVED", ownerId: "seller", uploadedById: "seller", listingId: "L1", listing, deal: null };
const photo = { ...allocation, id: "p1", type: "SITE_PHOTO" };
const idCard = { id: "k1", type: "NATIONAL_ID", status: "UPLOADED", ownerId: "client", uploadedById: "client", listingId: null, listing: null, deal: null };
const buyerDeal = (stage: string, prelim: boolean, status = "ACTIVE") => ({
  buyerId: "buyer",
  brokerId: "broker",
  stage,
  status,
  listing: { sellerId: "seller" },
  contracts: prelim ? [{ type: "PRELIMINARY_CONTRACT", status: "SIGNED" }] : [{ type: "COMMISSION_AGREEMENT", status: "SIGNED" }],
  documents: [],
  events: [],
});

describe("مين يفتح المستندات", () => {
  beforeEach(() => {
    docs.clear();
    docs.set("d1", allocation);
    docs.set("p1", photo);
    docs.set("k1", idCard);
    deals = [];
    kyc = { userId: "client", status: "PENDING" };
  });

  it("صور الموقع للعرض المنشور متاحة لأي حد", async () => {
    expect(await canViewDocument(null, "p1")).toBeTruthy();
  });
  it("الزائر ما يفتحش خطاب التخصيص", async () => {
    expect(await canViewDocument(null, "d1")).toBeNull();
  });
  it("صاحب المستند والوسيط والمحامي المسندين يفتحوه، وغيرهم لأ", async () => {
    expect(await canViewDocument(user("seller"), "d1")).toBeTruthy();
    expect(await canViewDocument(user("broker", "BROKER"), "d1")).toBeTruthy();
    expect(await canViewDocument(user("lawyer", "LAWYER"), "d1")).toBeTruthy();
    expect(await canViewDocument(user("other", "BROKER"), "d1")).toBeNull();
    expect(await canViewDocument(user("fin", "FINANCE"), "d1")).toBeNull();
  });
  it("المشتري ما يفتحوش قبل العقد المبدئي، ويفتحه بعده، ويفقده لو الصفقة اتلغت", async () => {
    deals = [buyerDeal("PRICE_AGREED", false)];
    expect(await canViewDocument(user("buyer"), "d1")).toBeNull();
    deals = [buyerDeal("PRELIMINARY_CONTRACT", true)];
    expect(await canViewDocument(user("buyer"), "d1")).toBeTruthy();
    deals = [buyerDeal("PRELIMINARY_CONTRACT", true, "CANCELLED")];
    expect(await canViewDocument(user("buyer"), "d1")).toBeNull();
  });
  it("SEC-04: ملف هوية بحساب مندوب → مرفوض، والوسيط وهو بيراجع → مسموح", async () => {
    expect(await canViewDocument(user("agent", "AGENT"), "k1")).toBeNull();
    expect(await canViewDocument(user("client"), "k1")).toBeNull();
    expect(await canViewDocument(user("broker", "BROKER"), "k1")).toBeTruthy();
    // تعارض مصالح: الوسيط عنده صفقة شغالة العميل ده طرف فيها
    conflictDeal = { id: "x" };
    expect(await canViewDocument(user("broker", "BROKER"), "k1")).toBeNull();
    conflictDeal = null;
    kyc = { userId: "client", status: "APPROVED" };
    expect(await canViewDocument(user("broker", "BROKER"), "k1")).toBeNull();
    expect(await canViewDocument(user("admin", "ADMIN"), "k1")).toBeTruthy();
  });
});
