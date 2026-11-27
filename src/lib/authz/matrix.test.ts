import { describe, expect, it } from "vitest";
import { ACTIONS, can, type Action, type Ctx, type Role, type Subject } from "./policy";

// PERM-10 — مصفوفة كاملة: كل دور × كل فعل في سياق «مسند ليه» وسياق «مش مسند ليه».
// القيم المتوقعة مكتوبة صراحة من PERMISSIONS.md؛ أي تغيير في السياسة لازم يتعدّل هنا عن قصد.

const ROLES: Role[] = ["CLIENT", "PARTNER_BROKER", "BROKER", "BROKER_LEAD", "LAWYER", "AGENT", "FINANCE", "ADMIN"];
const me = (role: Role): Subject => ({ id: "me", role, accountLevel: "VERIFIED", status: "ACTIVE" });

/** سياق فيه «أنا» في كل خانة ممكنة تناسب الدور (المسند/الطرف) */
function mine(role: Role): Ctx {
  const party = role === "CLIENT" || role === "PARTNER_BROKER";
  return {
    listing: {
      sellerId: party ? "me" : "s",
      submittedById: party ? "me" : "s",
      assignedBrokerId: role === "BROKER" ? "me" : "b",
      assignedLawyerId: role === "LAWYER" ? "me" : "l",
      status: "IN_REVIEW",
      requiredDocsApproved: true,
      maxActiveDealStage: -1,
    },
    deal: {
      buyerId: party ? "me" : "buyer",
      sellerId: "s",
      brokerId: role === "BROKER" ? "me" : "b",
      lawyerId: role === "LAWYER" ? "me" : "l",
      agentId: role === "AGENT" ? "me" : "a",
      stage: "TRANSFER_FILED",
      status: "ACTIVE",
      commissionSigned: true,
      prelimSigned: true,
      priceConfirmed: true,
    },
    document: { type: "ALLOCATION_LETTER", ownerId: "s", uploadedById: "s", status: "IN_REVIEW" },
    target: { id: party ? "me" : "t", kycPending: true },
    serviceRequest: { requesterId: party ? "me" : "r", assignedToId: role === "AGENT" ? "me" : null },
  };
}

/** نفس السياق بس «أنا» مش في أي خانة */
const notMine: Ctx = {
  listing: { sellerId: "s", submittedById: "s", assignedBrokerId: "b", assignedLawyerId: "l", status: "IN_REVIEW", requiredDocsApproved: true, maxActiveDealStage: -1 },
  deal: { buyerId: "buyer", sellerId: "s", brokerId: "b", lawyerId: "l", agentId: "a", stage: "TRANSFER_FILED", status: "ACTIVE", commissionSigned: true, prelimSigned: true, priceConfirmed: true },
  document: { type: "NATIONAL_ID", ownerId: "s", uploadedById: "s", status: "APPROVED" },
  target: { id: "t", kycPending: true },
  serviceRequest: { requesterId: "r", assignedToId: "x" },
};

describe("PERM-10 matrix — every role × every action", () => {
  it("covers every action in the list", () => {
    expect(ACTIONS.length).toBeGreaterThan(40);
  });

  // الأدمن: مسموح في كل حاجة (ما عدا القواعد الثابتة)، وأي فعل مش من شغله بيتعلّم override
  it("admin is allowed everything (with override outside admin work)", () => {
    for (const a of ACTIONS) {
      if (a === "contract.sign") continue; // للأطراف بس — اتغطّى تحت
      const d = can(me("ADMIN"), a as Action, notMine);
      expect(d.allowed, a).toBe(true);
    }
  });

  // على حاجات مش مسندة ليه: ولا دور (غير الأدمن ومسؤول الوسطاء والمالي في نطاقهم) يقدر يعمل فعل على صفقة/عرض/مستند
  const unassignedAllowed: Partial<Record<Role, Action[]>> = {
    // مسؤول الوسطاء بيشوف كل حاجة ويسند، ويراجع الهويات (notMine فيه ملف هوية مستني المراجعة)
    BROKER_LEAD: ["listing.view_private", "listing.view_code", "listing.assign", "deal.view", "deal.view_money", "deal.assign", "deal.note", "deal.internal_note", "deposit.view", "service.view_queue", "service.assign", "service.update", "service.site_report", "reports.view", "kyc.view_id", "kyc.decide", "document.view"],
    // المالي شغال على كل الصفقات: ملاحظات، رفع إيصالات، تسجيل وتأكيد عرابين
    FINANCE: ["deal.view", "deal.view_money", "deal.note", "deal.upload_doc", "deposit.view", "deposit.record", "deposit.confirm", "deposit.release", "deposit.refund", "commission.collect", "reports.view", "finance.reconcile", "fx.manual", "audit.view_money", "deal.internal_note", "document.view"],
    // الوسيط: طابور الخدمات + مراجعة هوية مستنية (SEC-06) — مش صفقات ولا عروض مش مسندة ليه
    BROKER: ["service.view_queue", "service.assign", "service.update", "service.site_report", "reports.view", "kyc.view_id", "kyc.decide", "document.view"],
    LAWYER: ["reports.view"],
    AGENT: ["service.view_queue"],
    CLIENT: ["listing.create", "deal.create"],
    PARTNER_BROKER: ["listing.create", "deal.create"],
  };

  for (const role of ROLES.filter((r) => r !== "ADMIN")) {
    it(`${role}: nothing outside its scope on things not assigned to it`, () => {
      const extra = new Set(unassignedAllowed[role] ?? []);
      const leaked = ACTIONS.filter((a) => can(me(role), a as Action, notMine).allowed && !extra.has(a as Action));
      expect(leaked, `${role} unexpectedly allowed`).toEqual([]);
    });
  }

  // أفعال الأدمن بس — ولا دور تاني
  const adminOnly: Action[] = ["user.list", "user.set_role", "user.suspend", "deal.revert", "template.edit", "payment.approve", "commission.waive", "commission.rates", "settings.fees", "audit.view", "storage.manage"];
  it("admin-only actions are denied to every other role, even when assigned", () => {
    for (const role of ROLES.filter((r) => r !== "ADMIN"))
      for (const a of adminOnly) expect(can(me(role), a, mine(role)).allowed, `${role} ${a}`).toBe(false);
  });

  it("the role that owns each step can do it when assigned", () => {
    const ok: [Role, Action][] = [
      ["BROKER", "listing.verify"],
      ["BROKER", "listing.send_to_lawyer"],
      ["BROKER", "deal.advance"],
      ["LAWYER", "document.review"],
      ["AGENT", "deal.view"],
      ["CLIENT", "deal.view"],
      ["PARTNER_BROKER", "listing.withdraw"],
      ["FINANCE", "deposit.confirm"],
    ];
    for (const [role, a] of ok) expect(can(me(role), a, mine(role)).allowed, `${role} ${a}`).toBe(true);
    const closed = { ...mine("FINANCE"), deal: { ...mine("FINANCE").deal!, stage: "CLOSED", approvalLetterApproved: true } };
    expect(can(me("FINANCE"), "deposit.release", closed).allowed).toBe(true);
  });

  it("assigned staff see the plot code; unassigned brokers and lawyers don't", () => {
    expect(can(me("BROKER"), "listing.view_code", mine("BROKER")).allowed).toBe(true);
    expect(can(me("LAWYER"), "listing.view_code", mine("LAWYER")).allowed).toBe(true);
    expect(can(me("BROKER"), "listing.view_code", notMine).allowed).toBe(false);
    expect(can(me("LAWYER"), "listing.view_code", notMine).allowed).toBe(false);
  });

  it("a broker with a conflict of interest can't open the ID file", () => {
    expect(can(me("BROKER"), "document.view", { ...notMine, conflict: true }).allowed).toBe(false);
  });

  it("suspended accounts are denied every action", () => {
    for (const role of ROLES)
      for (const a of ACTIONS) expect(can({ ...me(role)!, status: "SUSPENDED" },a as Action, mine(role)).allowed, `${role} ${a}`).toBe(false);
  });

  it("only parties sign contracts — not even an admin who isn't a party", () => {
    expect(can(me("ADMIN"), "contract.sign", notMine).allowed).toBe(false);
    expect(can(me("BROKER"), "contract.sign", mine("BROKER")).allowed).toBe(false);
  });

  it("OPS-02: only the deal's agent updates the authority file, and only at the authority stages", () => {
    expect(can(me("AGENT"), "deal.authority_update", mine("AGENT")).allowed).toBe(true);
    expect(can(me("AGENT"), "deal.authority_update", notMine).allowed).toBe(false);
    const early = { ...mine("AGENT"), deal: { ...mine("AGENT").deal!, stage: "PRICE_AGREED" } };
    expect(can(me("AGENT"), "deal.authority_update", early).allowed).toBe(false);
    expect(can(me("AGENT"), "service.site_report", mine("AGENT")).allowed).toBe(true);
    expect(can(me("AGENT"), "service.site_report", notMine).allowed).toBe(false);
  });

  it("SEC-05: unassigned broker sees the deal only when the setting is read", () => {
    expect(can(me("BROKER"), "deal.view", notMine).allowed).toBe(false);
    expect(can(me("BROKER"), "deal.view", { ...notMine, brokersCanReadAll: true }).allowed).toBe(true);
    expect(can(me("BROKER"), "deal.advance", { ...notMine, brokersCanReadAll: true }).allowed).toBe(false);
  });
});
