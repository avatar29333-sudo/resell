import { describe, expect, it } from "vitest";
import { can, type Ctx, type Subject } from "./policy";
import { partyNameVisible } from "./redact";

// PRIV-01 — المشتري ما يقدرش يجيب اسم البائع ولا أي مستند ليه قبل موافقة الكشف، والوسيط غير المسند مرفوض.
const buyer: Subject = { id: "buyer", role: "CLIENT", accountLevel: "VERIFIED", status: "ACTIVE" };
const seller: Subject = { id: "seller", role: "CLIENT", accountLevel: "VERIFIED", status: "ACTIVE" };
const strangerBroker: Subject = { id: "other-broker", role: "BROKER", accountLevel: "VERIFIED", status: "ACTIVE" };

const deal = (sellerDisclosed: string[] = [], buyerDisclosed: string[] = []): NonNullable<Ctx["deal"]> => ({
  buyerId: "buyer",
  sellerId: "seller",
  brokerId: "broker",
  lawyerId: "lawyer",
  agentId: "agent",
  stage: "PRELIMINARY_CONTRACT",
  status: "ACTIVE",
  commissionSigned: true,
  prelimSigned: true,
  sellerDisclosed,
  buyerDisclosed,
});
const listing = { sellerId: "seller", submittedById: "seller", assignedBrokerId: "broker", assignedLawyerId: "lawyer", status: "IN_DEAL", requiredDocsApproved: true, maxActiveDealStage: 3 };
const doc = (type: string, owner: string, visibility = "PRIVATE") => ({ type, ownerId: owner, uploadedById: owner, status: "APPROVED", visibility });

describe("PRIV-01 disclosure by consent", () => {
  it("buyer can't open the seller's plot documents before the seller consents, even after signing", () => {
    expect(can(buyer, "document.view", { listing, deal: deal(), document: doc("ALLOCATION_LETTER", "seller") }).allowed).toBe(false);
    expect(can(buyer, "document.view", { listing, deal: deal(["documents"]), document: doc("ALLOCATION_LETTER", "seller") }).allowed).toBe(true);
  });
  it("buyer can't see the plot code or the seller's name without consent", () => {
    expect(can(buyer, "listing.view_code", { listing, deal: deal() }).allowed).toBe(false);
    expect(can(buyer, "listing.view_code", { listing, deal: deal(["plotCode"]) }).allowed).toBe(true);
    expect(partyNameVisible({ viewerIsParty: true, commissionSigned: true, dealOpen: true, consented: false })).toBe(false);
    expect(partyNameVisible({ viewerIsParty: true, commissionSigned: true, dealOpen: true, consented: true })).toBe(true);
  });
  it("a party's own uploads stay private until shared with the counterparty", () => {
    expect(can(seller, "document.view", { listing, deal: deal(), document: doc("OTHER", "buyer") }).allowed).toBe(false);
    expect(can(seller, "document.view", { listing, deal: deal(), document: doc("OTHER", "buyer", "SHARED_WITH_COUNTERPARTY") }).allowed).toBe(true);
    expect(can(buyer, "document.view", { listing, deal: deal(), document: doc("OTHER", "seller") }).allowed).toBe(false);
    // نسخة العقد الموقّعة سجل مشترك للطرفين
    expect(can(buyer, "document.view", { listing, deal: deal(), document: doc("CONTRACT_PDF", "seller", "SHARED_WITH_COUNTERPARTY") }).allowed).toBe(true);
    // نسخة موافقة شخصية (خاصة) ما بتظهرش للطرف التاني
    expect(can(buyer, "document.view", { listing, deal: deal(), document: doc("CONTRACT_PDF", "seller", "PRIVATE") }).allowed).toBe(false);
  });
  it("an unassigned broker can't open deal documents", () => {
    expect(can(strangerBroker, "document.view", { listing, deal: deal(["documents"]), document: doc("ALLOCATION_LETTER", "seller", "SHARED_WITH_COUNTERPARTY") }).allowed).toBe(false);
  });
});

describe("ADM-EXP-03 export permissions", () => {
  const broker: Subject = { id: "broker", role: "BROKER", accountLevel: "VERIFIED", status: "ACTIVE" };
  const lawyer: Subject = { id: "lawyer", role: "LAWYER", accountLevel: "VERIFIED", status: "ACTIVE" };
  const otherLawyer: Subject = { id: "l2", role: "LAWYER", accountLevel: "VERIFIED", status: "ACTIVE" };
  it("a broker can't export a deal, even their own", () => {
    expect(can(broker, "export.deal", { deal: deal() }).allowed).toBe(false);
  });
  it("only the assigned lawyer can export the deal file", () => {
    expect(can(lawyer, "export.deal", { deal: deal() }).allowed).toBe(true);
    expect(can(otherLawyer, "export.deal", { deal: deal() }).allowed).toBe(false);
  });
  it("user files are admin-only", () => {
    expect(can(lawyer, "export.user", {}).allowed).toBe(false);
    expect(can({ id: "a", role: "ADMIN", accountLevel: "VERIFIED", status: "ACTIVE" }, "export.user", {}).allowed).toBe(true);
  });
});

describe("REL-03 staff can also be clients", () => {
  const pub = { ...listing, status: "PUBLISHED", sellerId: "someone", submittedById: "someone" };
  it("a broker with client access can show interest in someone else's listing", () => {
    const b: Subject = { id: "b9", role: "BROKER", accountLevel: "VERIFIED", status: "ACTIVE", clientEnabled: true };
    expect(can(b, "deal.create", { listing: pub }).allowed).toBe(true);
    expect(can({ ...b, clientEnabled: false }, "deal.create", { listing: pub }).allowed).toBe(false);
  });
  it("REL-01: nobody can express interest in their own listing", () => {
    expect(can({ id: "someone", role: "CLIENT", accountLevel: "VERIFIED", status: "ACTIVE" }, "deal.create", { listing: pub }).allowed).toBe(false);
  });
});
