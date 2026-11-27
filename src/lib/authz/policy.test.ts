import { describe, expect, it } from "vitest";
import { allowedDealUploads, can, type Ctx, type Role, type Subject } from "./policy";

const u = (id: string, role: Role, level: "BASIC" | "VERIFIED" = "VERIFIED", status: "ACTIVE" | "SUSPENDED" = "ACTIVE"): Subject => ({
  id,
  role,
  accountLevel: level,
  status,
});

const deal = (over: Partial<NonNullable<Ctx["deal"]>> = {}): Ctx["deal"] => ({
  buyerId: "buyer",
  sellerId: "seller",
  brokerId: "broker",
  lawyerId: "lawyer",
  agentId: "agent",
  stage: "INTEREST",
  status: "ACTIVE",
  ...over,
});
const listing = (over: Partial<NonNullable<Ctx["listing"]>> = {}): Ctx["listing"] => ({
  sellerId: "seller",
  assignedBrokerId: "broker",
  assignedLawyerId: "lawyer",
  status: "IN_REVIEW",
  requiredDocsApproved: true,
  maxActiveDealStage: -1,
  ...over,
});

describe("المبادئ", () => {
  it("الزائر والحساب الموقوف مرفوضين", () => {
    expect(can(null, "deal.view", { deal: deal() }).allowed).toBe(false);
    expect(can(u("buyer", "CLIENT", "VERIFIED", "SUSPENDED"), "deal.view", { deal: deal() }).allowed).toBe(false);
  });
  it("الأدمن مسموح له كل حاجة، وتدخّله في شغل دور تاني بيتعلّم override", () => {
    const d = can(u("a", "ADMIN"), "document.review", { document: { type: "ALLOCATION_LETTER", ownerId: "s", uploadedById: "s", status: "IN_REVIEW" } });
    expect(d).toEqual({ allowed: true, override: true });
    expect(can(u("a", "ADMIN"), "user.set_role", { newRole: "BROKER" })).toEqual({ allowed: true });
  });
});

describe("SEC-05 — الصفقة حسب الإسناد", () => {
  it("الوسيط المسند بس يحرّك الصفقة", () => {
    expect(can(u("broker", "BROKER"), "deal.advance", { deal: deal() }).allowed).toBe(true);
    expect(can(u("other", "BROKER"), "deal.advance", { deal: deal() }).allowed).toBe(false);
  });
  it("المندوب ينقل من ٥ لـ ٦ بس بعد رفع إيصال التقديم", () => {
    const d5 = deal({ stage: "TRANSFER_FILED" });
    expect(can(u("agent", "AGENT"), "deal.advance", { deal: d5 }).allowed).toBe(false);
    expect(can(u("agent", "AGENT"), "deal.advance", { deal: { ...d5!, filingReceiptUploaded: true } }).allowed).toBe(true);
    expect(can(u("agent", "AGENT"), "deal.advance", { deal: deal({ stage: "PRICE_AGREED", filingReceiptUploaded: true }) }).allowed).toBe(false);
  });
  it("مفيش حد غير الأدمن يرجّع الصفقة لمرحلة سابقة", () => {
    expect(can(u("broker", "BROKER"), "deal.revert", { deal: deal() }).allowed).toBe(false);
    expect(can(u("a", "ADMIN"), "deal.revert", { deal: deal() }).allowed).toBe(true);
  });
});

describe("SEC-03 — التوثيق بعد المحامي", () => {
  it("مستند واحد مش معتمد = ما ينفعش يتوثّق", () => {
    // PUB-01: الاعتماد القانوني بقى للمحامي المسند
    expect(can(u("lawyer", "LAWYER"), "listing.verify", { listing: listing({ requiredDocsApproved: false }) }).allowed).toBe(false);
    expect(can(u("lawyer", "LAWYER"), "listing.verify", { listing: listing() }).allowed).toBe(true);
    expect(can(u("broker", "BROKER"), "listing.verify", { listing: listing() }).allowed).toBe(false);
  });
  it("الوسيط مش المسند ما يوثّقش", () => {
    expect(can(u("other", "LAWYER"), "listing.verify", { listing: listing() }).allowed).toBe(false);
  });
});

describe("SEC-04 / SEC-06 — ملفات الهوية", () => {
  const idDoc = { type: "NATIONAL_ID", ownerId: "client", uploadedById: "client", status: "UPLOADED" };
  it("المندوب والمحامي والمالي والعميل نفسه → مرفوض", () => {
    for (const r of ["AGENT", "LAWYER", "FINANCE"] as Role[]) {
      expect(can(u("x", r), "document.view", { document: idDoc, target: { id: "client", kycPending: true } }).allowed).toBe(false);
    }
    expect(can(u("client", "CLIENT"), "document.view", { document: idDoc, target: { id: "client", kycPending: true } }).allowed).toBe(false);
  });
  it("الوسيط وهو بيراجع التوثيق بس", () => {
    expect(can(u("broker", "BROKER"), "document.view", { document: idDoc, target: { id: "client", kycPending: true } }).allowed).toBe(true);
    expect(can(u("broker", "BROKER"), "document.view", { document: idDoc, target: { id: "client", kycPending: false } }).allowed).toBe(false);
  });
});

describe("القسم 4 — كشف البيانات حسب المرحلة", () => {
  const plotDoc = { type: "ALLOCATION_LETTER", ownerId: "seller", uploadedById: "seller", status: "APPROVED" };
  it("المشتري ما يفتحش ملفات القطعة قبل توقيع العقد المبدئي من الطرفين", () => {
    expect(can(u("buyer", "CLIENT"), "document.view", { document: plotDoc, deal: deal({ stage: "PRICE_AGREED", commissionSigned: true }) }).allowed).toBe(false);
    // PRIV-01: وبعد التوقيع كمان لازم موافقة البائع على كشف المستندات
    expect(can(u("buyer", "CLIENT"), "document.view", { document: plotDoc, deal: deal({ stage: "PRELIMINARY_CONTRACT", prelimSigned: true }) }).allowed).toBe(false);
    expect(can(u("buyer", "CLIENT"), "document.view", { document: plotDoc, deal: deal({ stage: "PRELIMINARY_CONTRACT", prelimSigned: true, sellerDisclosed: ["documents"] }) }).allowed).toBe(true);
  });
  it("لو الصفقة اتلغت المشتري يفقد الوصول فوراً", () => {
    expect(can(u("buyer", "CLIENT"), "document.view", { document: plotDoc, deal: deal({ status: "CANCELLED", prelimSigned: true }) }).allowed).toBe(false);
    expect(can(u("buyer", "CLIENT"), "listing.view_code", { listing: listing(), deal: deal({ status: "CANCELLED", commissionSigned: true }) }).allowed).toBe(false);
  });
  it("كود القطعة بعد توقيع اتفاق العمولة من الطرفين", () => {
    expect(can(u("buyer", "CLIENT"), "listing.view_code", { listing: listing(), deal: deal() }).allowed).toBe(false);
    expect(can(u("buyer", "CLIENT"), "listing.view_code", { listing: listing(), deal: deal({ commissionSigned: true }) }).allowed).toBe(false); // PRIV-01: من غير موافقة البائع
    expect(can(u("buyer", "CLIENT"), "listing.view_code", { listing: listing(), deal: deal({ commissionSigned: true, sellerDisclosed: ["plotCode"] }) }).allowed).toBe(true);
    expect(can(u("fin", "FINANCE"), "listing.view_code", { listing: listing() }).allowed).toBe(false);
  });
});

describe("فصل المهام (القسم 7)", () => {
  it("المحامي ما يعتمدش مستند هو رافعه أو مش مسند ليه", () => {
    const mine = { type: "OTHER", ownerId: "x", uploadedById: "lawyer", status: "IN_REVIEW" };
    expect(can(u("lawyer", "LAWYER"), "document.review", { listing: listing(), document: mine }).allowed).toBe(false);
    const theirs = { ...mine, uploadedById: "seller", ownerId: "seller" };
    expect(can(u("lawyer", "LAWYER"), "document.review", { listing: listing(), document: theirs }).allowed).toBe(true);
    expect(can(u("lawyer2", "LAWYER"), "document.review", { listing: listing(), document: theirs }).allowed).toBe(false);
  });
  it("الوسيط ما يوثّقش نفسه ولا طرف في صفقة مسندة ليه", () => {
    expect(can(u("b", "BROKER"), "kyc.decide", { target: { id: "b", kycPending: true } }).allowed).toBe(false);
    expect(can(u("b", "BROKER"), "kyc.decide", { target: { id: "c", kycPending: true }, conflict: true }).allowed).toBe(false);
    expect(can(u("b", "BROKER"), "kyc.decide", { target: { id: "c", kycPending: true } }).allowed).toBe(true);
  });
  it("الوسيط ما يلمسش الفلوس، والمالي ما يحرّكش المراحل", () => {
    expect(can(u("broker", "BROKER"), "deposit.confirm", { deal: deal() }).allowed).toBe(false);
    expect(can(u("fin", "FINANCE"), "deposit.confirm", { deal: deal() }).allowed).toBe(true);
    expect(can(u("fin", "FINANCE"), "deal.advance", { deal: deal() }).allowed).toBe(false);
    expect(can(u("fin", "FINANCE"), "commission.rates").allowed).toBe(false);
  });
  it("الموظف اللي هو طرف ما يشوفش الملاحظات الداخلية", () => {
    expect(can(u("broker", "BROKER"), "deal.internal_note", { deal: deal({ buyerId: "broker" }) }).allowed).toBe(false);
  });
});

describe("الفلوس (5.6)", () => {
  it("صرف العربون في مرحلة ٧ بعد اعتماد خطاب الجهاز بس", () => {
    expect(can(u("fin", "FINANCE"), "deposit.release", { deal: deal({ stage: "AUTHORITY_APPROVED", approvalLetterApproved: true }) }).allowed).toBe(false);
    expect(can(u("fin", "FINANCE"), "deposit.release", { deal: deal({ stage: "CLOSED", approvalLetterApproved: true }) }).allowed).toBe(true);
  });
  it("رد العربون للصفقة الملغية بسبب يستحق الرد بس", () => {
    expect(can(u("fin", "FINANCE"), "deposit.refund", { deal: deal({ status: "CANCELLED", refundable: false }) }).allowed).toBe(false);
    expect(can(u("fin", "FINANCE"), "deposit.refund", { deal: deal({ status: "CANCELLED", refundable: true }) }).allowed).toBe(true);
  });
  it("إلغاء العمولة للأدمن بس", () => {
    expect(can(u("fin", "FINANCE"), "commission.waive").allowed).toBe(false);
  });
});

describe("قواعد ثابتة (5.9)", () => {
  it("التوقيع للطرفين بس — ولا الأدمن", () => {
    expect(can(u("a", "ADMIN"), "contract.sign", { deal: deal() }).allowed).toBe(false);
    expect(can(u("buyer", "CLIENT"), "contract.sign", { deal: deal() }).allowed).toBe(true);
    expect(can(u("buyer", "CLIENT", "BASIC"), "contract.sign", { deal: deal() }).allowed).toBe(false);
  });
  it("آخر أدمن ما يتشالش ولا يتوقف", () => {
    expect(can(u("a", "ADMIN"), "user.set_role", { lastAdmin: true, newRole: "CLIENT" }).allowed).toBe(false);
    expect(can(u("a", "ADMIN"), "user.suspend", { lastAdmin: true }).allowed).toBe(false);
  });
});

describe("حالة الحساب (القسم 6)", () => {
  it("BASIC يعمل مسودة بس (ما يبعتهاش للمراجعة) وما يبديش اهتمام", () => {
    expect(can(u("c", "CLIENT", "BASIC"), "listing.create").allowed).toBe(true);
    expect(can(u("seller", "CLIENT", "BASIC"), "listing.submit", { listing: listing({ status: "DRAFT", form1Consented: true }) }).allowed).toBe(false);
    expect(can(u("c", "CLIENT", "BASIC"), "deal.create", { listing: listing({ status: "PUBLISHED" }) }).allowed).toBe(false);
    expect(can(u("c", "CLIENT"), "deal.create", { listing: listing({ status: "PUBLISHED" }) }).allowed).toBe(true);
    expect(can(u("seller", "CLIENT"), "deal.create", { listing: listing({ status: "PUBLISHED" }) }).allowed).toBe(false);
  });
});

describe("DATA-06 — أنواع المستندات حسب المرحلة", () => {
  it("المشتري يرفع إيصال العربون في مرحلة ٤ بس", () => {
    expect(allowedDealUploads("BUYER", "PRELIMINARY_CONTRACT")).toEqual(["TRANSFER_RECEIPT"]);
    expect(allowedDealUploads("BUYER", "INTEREST")).toEqual([]);
    expect(allowedDealUploads("AGENT", "TRANSFER_FILED")).toEqual(["FILING_RECEIPT"]);
  });
});
