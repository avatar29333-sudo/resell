// PERM-01 — سياسة الصلاحيات: المرجع الوحيد لـ «مين يقدر يعمل إيه» (PERMISSIONS.md).
// الصلاحية = دور + علاقة + مرحلة. الرفض هو الافتراضي: أي فعل مش مكتوب هنا ممنوع.
// الملف ده من غير قاعدة بيانات عشان يتختبر لوحده (policy.test.ts).
import { stageIndex } from "../deal-machine";

export type Role = "CLIENT" | "PARTNER_BROKER" | "BROKER" | "BROKER_LEAD" | "LAWYER" | "AGENT" | "FINANCE" | "ADMIN";
export type Subject = { id: string; role: Role; accountLevel: "BASIC" | "VERIFIED"; status?: "ACTIVE" | "SUSPENDED"; clientEnabled?: boolean } | null;

export type Ctx = {
  listing?: {
    sellerId: string;
    submittedById?: string | null;
    assignedBrokerId?: string | null;
    assignedLawyerId?: string | null;
    status: string;
    /** أعلى مرحلة لصفقة شغالة على العرض (-1 = مفيش) */
    maxActiveDealStage?: number;
    /** كل المستندات المطلوبة (تخصيص، إيصالات، إفادة) معتمدة */
    requiredDocsApproved?: boolean;
  };
  deal?: {
    buyerId: string;
    sellerId: string;
    submittedById?: string | null;
    brokerId?: string | null;
    lawyerId?: string | null;
    agentId?: string | null;
    stage: string;
    status: string;
    /** اتفاق العمولة متوقّع من الطرفين */
    commissionSigned?: boolean;
    /** العقد المبدئي متوقّع من الطرفين */
    prelimSigned?: boolean;
    /** الطرفين وافقوا على السعر جوه الغرفة */
    priceConfirmed?: boolean;
    /** خطاب موافقة الجهاز معتمد */
    approvalLetterApproved?: boolean;
    /** إيصال تقديم الطلب في الجهاز اترفع */
    filingReceiptUploaded?: boolean;
    /** سبب الإلغاء يستحق رد العربون */
    refundable?: boolean;
    /** PRIV-01: اللي وافق البائع/المشتري يتكشف للطرف الآخر (name | plotCode | documents) */
    sellerDisclosed?: string[];
    buyerDisclosed?: string[];
  };
  document?: {
    type: string;
    ownerId: string;
    uploadedById: string;
    status: string;
    /** PRIV-01: PRIVATE | STAFF | SHARED_WITH_COUNTERPARTY */
    visibility?: string;
  };
  /** المستخدم اللي الفعل عليه (توثيق، دور، إيقاف…) */
  target?: { id: string; role?: Role; kycPending?: boolean };
  /** الوسيط ده عنده صفقة مسندة ليه فيها الشخص ده طرف (تعارض مصالح) */
  conflict?: boolean;
  serviceRequest?: { requesterId?: string | null; assignedToId?: string | null };
  /** SEC-05 (إعداد deals.unassignedBrokers = read): الوسطاء يشوفوا كل الصفقات قراءة بس */
  brokersCanReadAll?: boolean;
  /** الدور الجديد في تغيير الأدوار */
  newRole?: Role;
  /** هو آخر أدمن نشط */
  lastAdmin?: boolean;
};

type Check = (u: NonNullable<Subject>, c: Ctx) => boolean;
type Rule = { roles: Role[]; when?: Check };

// ─── العلاقات (القسم 3) ───
const isListingOwner: Check = (u, c) => c.listing?.sellerId === u.id;
const isListingSubmitter: Check = (u, c) => !!c.listing?.submittedById && c.listing.submittedById === u.id;
const isListingBroker: Check = (u, c) => c.listing?.assignedBrokerId === u.id;
const isListingLawyer: Check = (u, c) => c.listing?.assignedLawyerId === u.id;
const isBuyer: Check = (u, c) => c.deal?.buyerId === u.id;
const isSeller: Check = (u, c) => c.deal?.sellerId === u.id;
const isDealSubmitter: Check = (u, c) => !!c.deal?.submittedById && c.deal.submittedById === u.id;
const isParty: Check = (u, c) => isBuyer(u, c) || isSeller(u, c);
const isDealBroker: Check = (u, c) => c.deal?.brokerId === u.id;
const isDealLawyer: Check = (u, c) => c.deal?.lawyerId === u.id;
const isDealAgent: Check = (u, c) => c.deal?.agentId === u.id;
const isSelf: Check = (u, c) => c.target?.id === u.id;
const verified: Check = (u) => u.accountLevel === "VERIFIED";
const stageAtLeast = (c: Ctx, s: string) => stageIndex(c.deal?.stage ?? "") >= stageIndex(s);
const stageBefore = (c: Ctx, s: string) => stageIndex(c.deal?.stage ?? "") < stageIndex(s);
const isOpen = (c: Ctx) => c.deal?.status === "ACTIVE" || c.deal?.status === "ON_HOLD";
const dealOpen: Check = (_, c) => isOpen(c);
const and = (...cs: Check[]): Check => (u, c) => cs.every((f) => f(u, c));
const or = (...cs: Check[]): Check => (u, c) => cs.some((f) => f(u, c));
const not = (f: Check): Check => (u, c) => !f(u, c);

const KYC_TYPES = ["NATIONAL_ID", "PASSPORT", "SELFIE"];
const PLOT_TYPES = ["ALLOCATION_LETTER", "PAYMENT_RECEIPT", "AUTHORITY_STATEMENT"];
/** سجلات الصفقة المشتركة بطبيعتها (نسخ العقود الموقّعة) */
const DEAL_RECORDS = ["CONTRACT_PDF"];
/**
 * PRIV-01: مستند رفعه الطرف الآخر (أو بيخصّه) يظهر لي بس لو اتشارك (SHARED_WITH_COUNTERPARTY) أو سجل صفقة مشترك.
 * مستند رفعه الفريق جوه الصفقة بيظهر للطرفين لو متعلّم «مشترك».
 */
function counterpartyMay(c: Ctx, otherSide: "BUYER" | "SELLER") {
  const d = c.document!;
  if (DEAL_RECORDS.includes(d.type)) return true;
  const otherId = otherSide === "BUYER" ? c.deal?.buyerId : c.deal?.sellerId;
  const fromOther = d.ownerId === otherId || d.uploadedById === otherId;
  return fromOther ? d.visibility === "SHARED_WITH_COUNTERPARTY" : d.visibility !== "PRIVATE" && d.visibility !== "STAFF";
}
const TEAM: Role[] = ["BROKER", "BROKER_LEAD", "LAWYER", "AGENT", "FINANCE"];

/** قائمة الأفعال الثابتة */
export const ACTIONS = [
  // الحساب والهوية (5.1)
  "kyc.submit",
  "kyc.view_id",
  "kyc.decide",
  "user.list",
  "user.set_role",
  "user.suspend",
  "user.delete_self",
  // العروض (5.2)
  "listing.create",
  "listing.edit_draft",
  "listing.submit",
  "listing.edit_price",
  "listing.withdraw",
  "listing.send_to_lawyer",
  "listing.verify",
  "listing.publish",
  "listing.pause",
  "listing.view_code",
  "listing.view_private",
  "listing.assign",
  // المستندات (5.3)
  "document.upload_listing",
  "document.view",
  "document.review",
  // الصفقات (5.4)
  "deal.create",
  "deal.view",
  "deal.view_money",
  "deal.advance",
  "deal.revert",
  "deal.hold",
  "deal.cancel",
  "deal.propose_price",
  "deal.confirm_price",
  "deal.set_price",
  "deal.note",
  "deal.internal_note",
  "deal.assign",
  "deal.request_agent",
  "deal.upload_doc",
  // العقود (5.5)
  "contract.create",
  "contract.approve",
  "contract.sign",
  "template.edit",
  // الفلوس (5.6)
  "deposit.view",
  "deposit.record",
  "deposit.confirm",
  "deposit.release",
  "deposit.refund",
  "payment.approve",
  "commission.collect",
  "commission.waive",
  "commission.rates",
  // الخدمات وطلبات الشراء (5.7)
  "service.view_queue",
  "service.assign",
  "service.update",
  "buy_request.manage",
  // شغل المندوب (OPS-02)
  "service.site_report",
  "deal.authority_update",
  // التقارير والإعدادات (5.8)
  "reports.view",
  "finance.reconcile",
  "fx.manual",
  "settings.fees",
  "audit.view",
  "audit.view_money",
  "storage.manage",
  // ADM-EXP-03: صلاحيات التصدير منفصلة
  "export.deal",
  "export.user",
] as const;
export type Action = (typeof ACTIONS)[number];

/**
 * القواعد لكل فعل. الأدمن مش مكتوب في معظمها لأنه عنده كل الصلاحيات (المبدأ 7)،
 * لكن فعله بيتعلّم «تدخّل أدمن» ومحتاج سبب، إلا الأفعال اللي هو صاحبها أصلاً (NATIVE_ADMIN).
 */
const RULES: Record<Action, Rule[]> = {
  "kyc.submit": [{ roles: ["CLIENT", "PARTNER_BROKER"], when: isSelf }],
  "kyc.view_id": [{ roles: ["BROKER", "BROKER_LEAD"], when: (u, c) => !!c.target?.kycPending && !isSelf(u, c) }],
  "kyc.decide": [{ roles: ["BROKER", "BROKER_LEAD"], when: (u, c) => !isSelf(u, c) && !c.conflict && !!c.target?.kycPending }],
  "user.list": [],
  "user.set_role": [],
  "user.suspend": [],
  "user.delete_self": [{ roles: ["CLIENT", "PARTNER_BROKER"], when: isSelf }],

  "listing.create": [
    { roles: ["CLIENT"], when: verified },
    { roles: ["PARTNER_BROKER"], when: verified },
  ],
  "listing.edit_draft": [{ roles: ["CLIENT", "PARTNER_BROKER"], when: or(isListingOwner, isListingSubmitter) }],
  "listing.submit": [{ roles: ["CLIENT", "PARTNER_BROKER"], when: and(or(isListingOwner, isListingSubmitter), (_, c) => ["DRAFT", "WITHDRAWN"].includes(c.listing!.status)) }],
  "listing.edit_price": [{ roles: ["CLIENT", "PARTNER_BROKER"], when: or(isListingOwner, isListingSubmitter) }],
  "listing.withdraw": [
    {
      roles: ["CLIENT", "PARTNER_BROKER"],
      when: and(or(isListingOwner, isListingSubmitter), (_, c) => (c.listing!.maxActiveDealStage ?? -1) < stageIndex("PRELIMINARY_CONTRACT")),
    },
  ],
  "listing.send_to_lawyer": [{ roles: ["BROKER", "BROKER_LEAD"], when: isListingBroker }],
  "listing.verify": [{ roles: ["BROKER", "BROKER_LEAD"], when: and(isListingBroker, (_, c) => c.listing!.status === "IN_REVIEW" && !!c.listing!.requiredDocsApproved) }],
  "listing.publish": [{ roles: ["BROKER", "BROKER_LEAD"], when: and(isListingBroker, (_, c) => c.listing!.status === "VERIFIED") }],
  "listing.pause": [
    { roles: ["BROKER", "BROKER_LEAD"], when: isListingBroker },
    { roles: ["LAWYER"], when: isListingLawyer },
  ],
  "listing.view_code": [
    // PRIV-01: كود القطعة للمشتري بعد اتفاق العمولة + موافقة البائع على كشفه
    { roles: ["CLIENT", "PARTNER_BROKER"], when: or(isListingOwner, isListingSubmitter, and(isBuyer, (_, c) => !!c.deal?.commissionSigned && !!c.deal?.sellerDisclosed?.includes("plotCode") && isOpen(c))) },
    // كود القطعة للفريق المسند بس (PERM-03)
    { roles: ["BROKER"], when: or(isListingBroker, isDealBroker) },
    { roles: ["BROKER_LEAD"] },
    { roles: ["LAWYER"], when: or(isListingLawyer, isDealLawyer) },
    { roles: ["AGENT"], when: isDealAgent },
  ],
  "listing.view_private": [
    { roles: ["CLIENT", "PARTNER_BROKER"], when: or(isListingOwner, isListingSubmitter) },
    { roles: ["BROKER", "BROKER_LEAD"], when: (u, c) => isListingBroker(u, c) || u.role === "BROKER_LEAD" },
    { roles: ["LAWYER"], when: isListingLawyer },
  ],
  "listing.assign": [{ roles: ["BROKER_LEAD"] }],

  "document.upload_listing": [
    { roles: ["CLIENT"], when: isListingOwner },
    { roles: ["PARTNER_BROKER"], when: isListingSubmitter },
    { roles: ["BROKER", "BROKER_LEAD"], when: isListingBroker },
    { roles: ["AGENT"], when: isDealAgent },
  ],
  "document.view": [
    // صور الهوية: الوسيط وهو بيراجع التوثيق بس (SEC-06)
    {
      roles: ["BROKER", "BROKER_LEAD"],
      when: (u, c) => KYC_TYPES.includes(c.document!.type) && !!c.target?.kycPending && c.target.id !== u.id && !c.conflict,
    },
    // باقي المستندات (مش هوية)
    {
      roles: ["CLIENT", "PARTNER_BROKER"],
      when: (u, c) =>
        !KYC_TYPES.includes(c.document!.type) &&
        (c.document!.ownerId === u.id ||
          c.document!.uploadedById === u.id ||
          // صاحب العرض/الشريك: مستندات العرض والصفقة — إلا خاص المشتري اللي ما شاركهوش (PRIV-01)
          ((isListingOwner(u, c) || isListingSubmitter(u, c) || isDealSubmitter(u, c)) && !(c.deal && !counterpartyMay(c, "BUYER"))) ||
          // البائع: مستندات الصفقة — اللي رفعها المشتري بتظهر بس لو شاركها (PRIV-01)
          (isSeller(u, c) && !!c.deal && counterpartyMay(c, "BUYER")) ||
          // المشتري: ملفات القطعة بعد توقيع العقد المبدئي + موافقة البائع على كشف المستندات (PRIV-01)
          (isBuyer(u, c) &&
            isOpen(c) &&
            (PLOT_TYPES.includes(c.document!.type) ? !!c.deal?.prelimSigned && !!c.deal?.sellerDisclosed?.includes("documents") : counterpartyMay(c, "SELLER")))),
    },
    { roles: ["BROKER", "BROKER_LEAD"], when: (u, c) => !KYC_TYPES.includes(c.document!.type) && (isListingBroker(u, c) || isDealBroker(u, c)) },
    {
      roles: ["LAWYER"],
      // المحامي المسند للعرض أو الصفقة بس (مش أي مستند «عند المحامي»)
      when: (u, c) => !KYC_TYPES.includes(c.document!.type) && (isListingLawyer(u, c) || isDealLawyer(u, c)),
    },
    { roles: ["AGENT"], when: (u, c) => !KYC_TYPES.includes(c.document!.type) && isDealAgent(u, c) },
    { roles: ["FINANCE"], when: (_, c) => ["TRANSFER_RECEIPT", "CONTRACT_PDF"].includes(c.document!.type) },
  ],
  "document.review": [
    {
      roles: ["LAWYER"],
      when: (u, c) =>
        (isListingLawyer(u, c) || isDealLawyer(u, c)) && c.document!.uploadedById !== u.id && c.document!.ownerId !== u.id && !isParty(u, c),
    },
  ],

  "deal.create": [{ roles: ["CLIENT", "PARTNER_BROKER"], when: and(verified, not(isListingOwner), not(isListingSubmitter), (_, c) => c.listing!.status === "PUBLISHED") }],
  "deal.view": [
    { roles: ["CLIENT", "PARTNER_BROKER"], when: or(isParty, isDealSubmitter) },
    // SEC-05: الوسيط غير المسند يشوف (قراءة بس) لو الإعداد «read»
    { roles: ["BROKER"], when: (u, c) => isDealBroker(u, c) || !!c.brokersCanReadAll },
    { roles: ["BROKER_LEAD"] },
    { roles: ["LAWYER"], when: isDealLawyer },
    { roles: ["AGENT"], when: and(isDealAgent, (_, c) => stageAtLeast(c, "TRANSFER_FILED")) },
    { roles: ["FINANCE"] },
  ],
  "deal.view_money": [
    { roles: ["CLIENT", "PARTNER_BROKER"], when: or(isParty, isDealSubmitter) },
    { roles: ["BROKER", "BROKER_LEAD"], when: (u, c) => isDealBroker(u, c) || u.role === "BROKER_LEAD" },
    { roles: ["FINANCE"] },
  ],
  "deal.advance": [
    { roles: ["BROKER", "BROKER_LEAD"], when: and(isDealBroker, (_, c) => c.deal!.status === "ACTIVE") },
    { roles: ["AGENT"], when: and(isDealAgent, (_, c) => c.deal!.stage === "TRANSFER_FILED" && c.deal!.status === "ACTIVE" && !!c.deal!.filingReceiptUploaded) },
  ],
  "deal.revert": [],
  "deal.hold": [{ roles: ["BROKER", "BROKER_LEAD"], when: and(isDealBroker, dealOpen) }],
  "deal.cancel": [
    { roles: ["CLIENT", "PARTNER_BROKER"], when: and(isParty, (_, c) => isOpen(c) && stageBefore(c, "PRELIMINARY_CONTRACT")) },
    { roles: ["BROKER", "BROKER_LEAD"], when: and(isDealBroker, dealOpen) },
  ],
  "deal.propose_price": [{ roles: ["BROKER", "BROKER_LEAD"], when: and(isDealBroker, dealOpen) }],
  "deal.confirm_price": [{ roles: ["CLIENT", "PARTNER_BROKER"], when: and(isParty, dealOpen) }],
  "deal.set_price": [{ roles: ["BROKER", "BROKER_LEAD"], when: and(isDealBroker, dealOpen, (_, c) => !!c.deal!.priceConfirmed) }],
  "deal.note": [
    { roles: ["CLIENT", "PARTNER_BROKER"], when: isParty },
    { roles: ["BROKER", "BROKER_LEAD"], when: isDealBroker },
    { roles: ["LAWYER"], when: isDealLawyer },
    { roles: ["AGENT"], when: isDealAgent },
    { roles: ["FINANCE"] },
  ],
  "deal.internal_note": [
    // الموظف اللي هو طرف في الصفقة ما يشوفش الملاحظات الداخلية (7.2)
    { roles: ["BROKER", "BROKER_LEAD"], when: and(isDealBroker, not(isParty)) },
    { roles: ["LAWYER"], when: and(isDealLawyer, not(isParty)) },
    { roles: ["AGENT"], when: and(isDealAgent, not(isParty)) },
    { roles: ["FINANCE"], when: not(isParty) },
  ],
  "deal.assign": [{ roles: ["BROKER_LEAD"] }],
  "deal.request_agent": [{ roles: ["BROKER", "BROKER_LEAD"], when: isDealBroker }],
  "deal.upload_doc": [
    { roles: ["CLIENT", "PARTNER_BROKER"], when: and(isParty, dealOpen) },
    { roles: ["BROKER", "BROKER_LEAD"], when: and(isDealBroker, dealOpen) },
    { roles: ["LAWYER"], when: and(isDealLawyer, dealOpen) },
    { roles: ["AGENT"], when: and(isDealAgent, dealOpen) },
    { roles: ["FINANCE"], when: dealOpen },
  ],

  "contract.create": [{ roles: ["BROKER", "BROKER_LEAD"], when: and(isDealBroker, dealOpen) }],
  "contract.approve": [{ roles: ["LAWYER"], when: and(isDealLawyer, not(isParty)) }],
  // التوقيع للبائع والمشتري بس — ولا حتى الأدمن (5.9)
  "contract.sign": [{ roles: ["CLIENT", "PARTNER_BROKER", ...TEAM], when: and(isParty, verified, dealOpen) }],
  "template.edit": [],

  "deposit.view": [
    { roles: ["CLIENT", "PARTNER_BROKER"], when: or(isParty, isDealSubmitter) },
    { roles: ["BROKER", "BROKER_LEAD"], when: (u, c) => isDealBroker(u, c) || u.role === "BROKER_LEAD" },
    { roles: ["FINANCE"] },
  ],
  "deposit.record": [{ roles: ["FINANCE"] }],
  // الوسيط ما يلمسش الفلوس (7.4)
  "deposit.confirm": [{ roles: ["FINANCE"], when: not(isParty) }],
  "deposit.release": [{ roles: ["FINANCE"], when: and(not(isParty), (_, c) => c.deal!.stage === "CLOSED" && !!c.deal!.approvalLetterApproved) }],
  "deposit.refund": [{ roles: ["FINANCE"], when: and(not(isParty), (_, c) => c.deal!.status === "CANCELLED" && !!c.deal!.refundable) }],
  "payment.approve": [],
  "commission.collect": [{ roles: ["FINANCE"] }],
  "commission.waive": [],
  "commission.rates": [],

  "service.view_queue": [{ roles: ["BROKER", "BROKER_LEAD", "AGENT"] }],
  "service.assign": [{ roles: ["BROKER", "BROKER_LEAD"] }],
  "service.update": [
    { roles: ["BROKER", "BROKER_LEAD"] },
    { roles: ["AGENT"], when: (u, c) => c.serviceRequest?.assignedToId === u.id },
    { roles: ["CLIENT", "PARTNER_BROKER"], when: (u, c) => c.serviceRequest?.requesterId === u.id },
  ],
  "buy_request.manage": [{ roles: ["CLIENT", "PARTNER_BROKER"], when: isSelf }],

  "reports.view": [{ roles: ["BROKER", "BROKER_LEAD", "LAWYER", "FINANCE"] }],
  "fx.manual": [{ roles: ["FINANCE"] }],
  // OPS-01: المطابقة الشهرية مع كشف البنك
  "finance.reconcile": [{ roles: ["FINANCE"] }],
  // OPS-02: تقرير المعاينة (صور بمكانها + تقدير التنفيذ) — المندوب المسند للطلب
  "service.site_report": [
    { roles: ["AGENT"], when: (u, c) => c.serviceRequest?.assignedToId === u.id },
    { roles: ["BROKER", "BROKER_LEAD"] },
  ],
  // OPS-02: حالة ملف التنازل في الجهاز — مندوب الصفقة في مرحلة الجهاز، أو وسيطها
  "deal.authority_update": [
    { roles: ["AGENT"], when: and(isDealAgent, dealOpen, (_, c) => ["TRANSFER_FILED", "AUTHORITY_APPROVED"].includes(c.deal!.stage)) },
    { roles: ["BROKER", "BROKER_LEAD"], when: and(isDealBroker, dealOpen, (_, c) => stageAtLeast(c, "TRANSFER_FILED")) },
  ],
  "settings.fees": [],
  "audit.view": [],
  "audit.view_money": [{ roles: ["FINANCE"] }],
  // ADM-EXP-03: المحامي ينزّل ملف صفقته المسندة له بس (من غير البيانات البنكية الكاملة)؛ ملف المستخدم للأدمن بس
  "export.deal": [{ roles: ["LAWYER"], when: isDealLawyer }],
  "export.user": [],
  "storage.manage": [],
};

/** أفعال الأدمن صاحبها الطبيعي — مش «تدخّل» ومش محتاجة سبب */
const NATIVE_ADMIN: Action[] = [
  "user.list",
  "user.set_role",
  "user.suspend",
  "listing.assign",
  "deal.assign",
  "deal.revert",
  "template.edit",
  "payment.approve",
  "commission.waive",
  "commission.rates",
  "reports.view",
  "finance.reconcile",
  "fx.manual",
  "settings.fees",
  "audit.view",
  "audit.view_money",
  "storage.manage",
  "export.deal",
  "export.user",
  "service.view_queue",
  "service.assign",
  "service.update",
  "kyc.view_id",
  "kyc.decide",
  "listing.view_code",
  "listing.view_private",
  "deal.view",
  "deal.view_money",
  "deposit.view",
  "document.view",
  "deal.note",
  "deal.internal_note",
  "listing.create",
];

/** قواعد ثابتة ما حدش يتخطاها — ولا الأدمن (5.9) */
const NEVER: Partial<Record<Action, (u: NonNullable<Subject>, c: Ctx) => string | null>> = {
  "contract.sign": (u, c) => (isParty(u, c) ? null : "only_parties_sign"),
  "user.set_role": (_, c) => (c.lastAdmin && c.newRole !== "ADMIN" ? "last_admin" : null),
  "user.suspend": (_, c) => (c.lastAdmin ? "last_admin" : null),
};

export type Decision = { allowed: boolean; reason?: string; override?: boolean };

export function can(user: Subject, action: Action, ctx: Ctx = {}): Decision {
  if (!user) return { allowed: false, reason: "sign_in_required" };
  if (user.status === "SUSPENDED") return { allowed: false, reason: "suspended" };
  const fixed = NEVER[action]?.(user, ctx);
  if (fixed) return { allowed: false, reason: fixed };
  if (user.role === "ADMIN") {
    // التوقيع مش للأدمن غير لو هو نفسه طرف (اتفحص فوق)
    if (action === "contract.sign") return { allowed: verified(user, ctx) && isOpen(ctx), reason: "not_verified" };
    return NATIVE_ADMIN.includes(action) ? { allowed: true } : { allowed: true, override: true };
  }
  for (const r of RULES[action]) {
    if (r.roles.includes(user.role) && (!r.when || r.when(user, ctx))) return { allowed: true };
  }
  // REL-03: موظف مفعّل كعميل → قواعد العميل (كلها مربوطة بعلاقته بالعرض/الصفقة، فما بتفتحش حاجة تانية)
  if (user.clientEnabled && user.role !== "CLIENT") {
    for (const r of RULES[action]) if (r.roles.includes("CLIENT") && (!r.when || r.when({ ...user, role: "CLIENT" }, ctx))) return { allowed: true };
  }
  return { allowed: false, reason: "forbidden" };
}

// ─── مستندات الصفقة المسموح رفعها حسب المرحلة والدور (5.4 + DATA-06) ───
export type UploadSide = "BUYER" | "SELLER" | "BROKER" | "AGENT" | "FINANCE" | "LAWYER" | "ADMIN";

const UPLOADS: Record<string, Partial<Record<UploadSide, string[]>>> = {
  INTEREST: { SELLER: PLOT_TYPES, BROKER: ["*"] },
  COMMISSION_AGREEMENT: { SELLER: PLOT_TYPES, BROKER: ["*"] },
  PRICE_AGREED: { SELLER: PLOT_TYPES, BROKER: ["*"] },
  PRELIMINARY_CONTRACT: { BUYER: ["TRANSFER_RECEIPT"], BROKER: ["CONTRACT_PDF"], FINANCE: ["TRANSFER_RECEIPT"] },
  TRANSFER_FILED: { BUYER: ["POWER_OF_ATTORNEY"], SELLER: ["POWER_OF_ATTORNEY"], BROKER: ["OTHER"], AGENT: ["FILING_RECEIPT"] },
  AUTHORITY_APPROVED: { BROKER: ["AUTHORITY_STATEMENT"], AGENT: ["AUTHORITY_STATEMENT"] },
  CLOSED: { FINANCE: ["PAYMENT_RECEIPT"] },
};
const ALL_DEAL_TYPES = [
  "TRANSFER_RECEIPT",
  "FILING_RECEIPT",
  "AUTHORITY_STATEMENT",
  "POWER_OF_ATTORNEY",
  "PAYMENT_RECEIPT",
  "CONTRACT_PDF",
  "SITE_PHOTO",
  "OTHER",
  ...PLOT_TYPES,
];

/** أنواع المستندات اللي الطرف ده يرفعها في المرحلة دي */
export function allowedDealUploads(side: UploadSide, stage: string): string[] {
  if (side === "ADMIN") return [...new Set(ALL_DEAL_TYPES)];
  const list = UPLOADS[stage]?.[side] ?? [];
  if (list.includes("*")) return [...new Set(ALL_DEAL_TYPES)];
  return list;
}
