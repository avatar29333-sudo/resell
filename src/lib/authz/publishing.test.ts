import { describe, expect, it } from "vitest";
import { can, type Action, type Ctx, type Subject } from "./policy";

/**
 * PUB-01 — جدول صلاحيات النشر النهائي: اختبار لكل خلية.
 * الأعمدة: عميل BASIC، عميل VERIFIED، سمسار شريك، سمسار، قائد السماسرة، محامي، أدمن.
 */
type Col = "basic" | "verified" | "partner" | "broker" | "lead" | "lawyer" | "admin";
const who: Record<Col, Subject> = {
  basic: { id: "owner", role: "CLIENT", accountLevel: "BASIC", status: "ACTIVE" },
  verified: { id: "owner", role: "CLIENT", accountLevel: "VERIFIED", status: "ACTIVE" },
  partner: { id: "partner", role: "PARTNER_BROKER", accountLevel: "VERIFIED", status: "ACTIVE", partnerAgreed: true },
  broker: { id: "broker", role: "BROKER", accountLevel: "VERIFIED", status: "ACTIVE" },
  lead: { id: "lead", role: "BROKER_LEAD", accountLevel: "VERIFIED", status: "ACTIVE" },
  lawyer: { id: "lawyer", role: "LAWYER", accountLevel: "VERIFIED", status: "ACTIVE" },
  admin: { id: "admin", role: "ADMIN", accountLevel: "VERIFIED", status: "ACTIVE" },
};
const listing = (over: Partial<NonNullable<Ctx["listing"]>> = {}): Ctx => ({
  listing: {
    sellerId: "owner",
    submittedById: over.submittedById ?? "owner",
    assignedBrokerId: "broker",
    assignedLawyerId: "lawyer",
    status: "DRAFT",
    requiredDocsApproved: true,
    form1Consented: true,
    ownerConfirmed: true,
    maxActiveDealStage: -1,
    ...over,
  },
});
// للشريك: العرض اتعمل بيه هو نيابة عن المالك
const ctxFor = (col: Col, base: Partial<NonNullable<Ctx["listing"]>>) => listing(col === "partner" ? { ...base, submittedById: "partner" } : base);

const TABLE: { action: Action; ctx: Partial<NonNullable<Ctx["listing"]>> | null; expect: Record<Col, boolean> }[] = [
  { action: "listing.create", ctx: null, expect: { basic: true, verified: true, partner: true, broker: true, lead: true, lawyer: false, admin: true } },
  { action: "listing.submit", ctx: { status: "DRAFT" }, expect: { basic: false, verified: true, partner: true, broker: true, lead: true, lawyer: false, admin: true } },
  { action: "listing.verify", ctx: { status: "IN_REVIEW" }, expect: { basic: false, verified: false, partner: false, broker: false, lead: false, lawyer: true, admin: true } },
  { action: "listing.publish", ctx: { status: "VERIFIED" }, expect: { basic: false, verified: false, partner: false, broker: true, lead: true, lawyer: false, admin: true } },
  { action: "buy_request.create", ctx: null, expect: { basic: true, verified: true, partner: true, broker: true, lead: true, lawyer: false, admin: true } },
  { action: "service.create", ctx: null, expect: { basic: true, verified: true, partner: true, broker: true, lead: true, lawyer: false, admin: true } },
  { action: "listing.withdraw", ctx: { status: "PUBLISHED" }, expect: { basic: true, verified: true, partner: false, broker: false, lead: false, lawyer: false, admin: true } },
  { action: "listing.pause", ctx: { status: "PUBLISHED" }, expect: { basic: false, verified: false, partner: false, broker: true, lead: true, lawyer: false, admin: true } },
];

describe("PUB-01 publishing permission table — every cell", () => {
  for (const row of TABLE)
    for (const col of Object.keys(row.expect) as Col[])
      it(`${row.action} × ${col} → ${row.expect[col] ? "✓" : "✗"}`, () => {
        expect(can(who[col], row.action, row.ctx ? ctxFor(col, row.ctx) : {}).allowed).toBe(row.expect[col]);
      });

  it("conditions behind the ✓: form 1 consent, partner form 10 + owner confirmation, lawyer approval before publish", () => {
    expect(can(who.verified, "listing.submit", listing({ form1Consented: false })).allowed).toBe(false);
    expect(can({ ...who.partner!, partnerAgreed: false }, "listing.submit", listing({ submittedById: "partner" })).allowed).toBe(false);
    expect(can(who.partner, "listing.submit", listing({ submittedById: "partner", ownerConfirmed: false })).allowed).toBe(false);
    expect(can(who.broker, "listing.publish", listing({ status: "IN_REVIEW" })).allowed).toBe(false);
    expect(can(who.broker, "listing.publish", listing({ status: "VERIFIED", ownerConfirmed: false })).allowed).toBe(false);
  });
});
