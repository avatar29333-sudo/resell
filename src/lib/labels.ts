import type { Locale } from "@/i18n/config";

type Map = Record<string, readonly [string, string]>;

export function label(map: Map, key: string | null | undefined, locale: Locale) {
  if (!key) return "—";
  const v = map[key];
  return v ? (locale === "ar" ? v[0] : v[1]) : key;
}

export const ROLE: Map = {
  CLIENT: ["عميل", "Client"],
  PARTNER_BROKER: ["سمسار شريك", "Partner broker"],
  BROKER: ["وسيط", "Broker"],
  BROKER_LEAD: ["مسؤول الوسطاء", "Broker lead"],
  LAWYER: ["محامي", "Lawyer"],
  AGENT: ["مندوب", "Field agent"],
  FINANCE: ["مالي", "Finance"],
  ADMIN: ["أدمن", "Admin"],
};

export const ACCOUNT_STATUS: Map = {
  ACTIVE: ["شغال", "Active"],
  SUSPENDED: ["موقوف", "Suspended"],
};

export const ACCOUNT_LEVEL: Map = {
  BASIC: ["أساسي (رقم موثّق)", "Basic (phone verified)"],
  VERIFIED: ["موثّق (هوية متراجعة)", "Verified (ID checked)"],
};

export const CITY: Map = {
  NEW_CAIRO: ["القاهرة الجديدة", "New Cairo"],
  SHEIKH_ZAYED: ["الشيخ زايد", "Sheikh Zayed"],
  OCTOBER: ["6 أكتوبر", "6th of October"],
  NEW_OCTOBER: ["أكتوبر الجديدة", "New October"],
  NEW_DAMIETTA: ["دمياط الجديدة", "New Damietta"],
};
export const CITY_KEYS = Object.keys(CITY) as (keyof typeof CITY)[];

export const COUNTRY: Map = {
  EG: ["مصر", "Egypt"],
  SA: ["السعودية", "Saudi Arabia"],
  AE: ["الإمارات", "UAE"],
  KW: ["الكويت", "Kuwait"],
  QA: ["قطر", "Qatar"],
  US: ["أمريكا", "USA"],
  GB: ["بريطانيا", "UK"],
  DE: ["ألمانيا", "Germany"],
};

export const VERIFICATION: Map = {
  PENDING: ["قيد المراجعة", "Pending"],
  APPROVED: ["مقبول", "Approved"],
  REJECTED: ["مرفوض", "Rejected"],
};

export const PAYMENT_STATUS: Map = {
  INSTALLMENTS: ["بالتقسيط", "Installments"],
  FULLY_PAID: ["مسدد بالكامل", "Fully paid"],
};

export const PRICE_TYPE: Map = {
  ALL_INCLUSIVE: ["سعر شامل", "All-inclusive price"],
  PAID_PLUS_PREMIUM: ["المدفوع بالدولار + أوفر", "Paid in USD + premium"],
};

export const LISTING_STATUS: Map = {
  DRAFT: ["مسودة", "Draft"],
  IN_REVIEW: ["قيد المراجعة", "In review"],
  VERIFIED: ["موثّق", "Verified"],
  PUBLISHED: ["منشور", "Published"],
  IN_DEAL: ["في صفقة", "In a deal"],
  SOLD: ["مباع", "Sold"],
  WITHDRAWN: ["مسحوب", "Withdrawn"],
};

export const DOC_TYPE: Map = {
  NATIONAL_ID: ["البطاقة", "National ID"],
  PASSPORT: ["الباسبور", "Passport"],
  SELFIE: ["صورة شخصية", "Selfie"],
  ALLOCATION_LETTER: ["خطاب التخصيص", "Allocation letter"],
  PAYMENT_RECEIPT: ["إيصالات السداد", "Payment receipts"],
  AUTHORITY_STATEMENT: ["إفادة الجهاز", "Authority statement"],
  SITE_PHOTO: ["صورة من الموقع", "Site photo"],
  TRANSFER_RECEIPT: ["إيصال تحويل العربون", "Deposit transfer receipt"],
  CONTRACT_PDF: ["نسخة عقد", "Contract copy"],
  POWER_OF_ATTORNEY: ["توكيل", "Power of attorney"],
  OTHER: ["مستند آخر", "Other"],
  FILING_RECEIPT: ["إيصال تقديم الطلب في الجهاز", "Authority filing receipt"],
};

export const DOC_STATUS: Map = {
  UPLOADED: ["مرفوع", "Uploaded"],
  IN_REVIEW: ["عند المحامي", "With lawyer"],
  APPROVED: ["معتمد", "Approved"],
  REJECTED: ["مرفوض", "Rejected"],
  EXPIRED: ["منتهي", "Expired"],
  SUPERSEDED: ["إصدار قديم", "Superseded"],
};

export const REVIEW_DECISION: Map = {
  APPROVED: ["اعتماد", "Approved"],
  CHANGES_REQUESTED: ["طلب تعديل", "Changes requested"],
  REJECTED: ["رفض", "Rejected"],
};

export const DEAL_STAGE: Map = {
  INTEREST: ["اهتمام", "Interest"],
  COMMISSION_AGREEMENT: ["اتفاق العمولة", "Commission agreement"],
  PRICE_AGREED: ["اتفاق السعر", "Price agreed"],
  PRELIMINARY_CONTRACT: ["العقد المبدئي والعربون", "Preliminary contract & deposit"],
  TRANSFER_FILED: ["تقديم التنازل", "Transfer filed"],
  AUTHORITY_APPROVED: ["موافقة الجهاز", "Authority approval"],
  CLOSED: ["الإغلاق", "Closed"],
};

export const DEAL_STATUS: Map = {
  ACTIVE: ["شغالة", "Active"],
  ON_HOLD: ["متوقفة مؤقتاً", "On hold"],
  CANCELLED: ["ملغية", "Cancelled"],
  COMPLETED: ["مكتملة", "Completed"],
};

export const DEAL_EVENT: Map = {
  CREATED: ["الصفقة اتفتحت", "Deal opened"],
  STAGE_CHANGED: ["انتقال مرحلة", "Stage changed"],
  DOCUMENT_ADDED: ["مستند اترفع", "Document added"],
  CONTRACT_UPDATED: ["تحديث عقد", "Contract updated"],
  DEPOSIT_UPDATED: ["تحديث العربون", "Deposit updated"],
  ASSIGNMENT_CHANGED: ["تغيير الفريق", "Team changed"],
  NOTE: ["ملاحظة", "Note"],
  CANCELLED: ["إلغاء", "Cancelled"],
};

export const CONTRACT_TYPE: Map = {
  COMMISSION_AGREEMENT: ["اتفاق العمولة", "Commission agreement"],
  PRELIMINARY_CONTRACT: ["العقد المبدئي", "Preliminary contract"],
  DEPOSIT_RECEIPT: ["محضر العربون", "Deposit receipt"],
  POWER_OF_ATTORNEY: ["توكيل التقديم والمتابعة", "Filing power of attorney"],
  BUYER_UNDERTAKING: ["تعهد المشتري", "Buyer undertaking"],
  CLOSING: ["محضر الإغلاق", "Closing record"],
  CANCELLATION: ["محضر الإلغاء", "Cancellation record"],
  LISTING_AUTHORIZATION: ["تفويض عرض القطعة", "Listing authorization"],
  RESCUE_SERVICE: ["اتفاق خدمة إنقاذ المهلة", "Deadline rescue service agreement"],
  PARTNER_AGREEMENT: ["اتفاقية السمسار الشريك", "Partner broker agreement"],
};

export const CONTRACT_STATUS: Map = {
  DRAFT: ["مسودة", "Draft"],
  PENDING_LAWYER: ["عند المحامي", "With lawyer"],
  APPROVED: ["معتمد", "Approved"],
  SENT_FOR_SIGNATURE: ["مستني التوقيع", "Awaiting signatures"],
  SIGNED: ["متوقّع", "Signed"],
  PARTIALLY_SIGNED: ["متوقّع من طرف", "Partially signed"],
  VERIFIED: ["متوقّع ومتحقق منه", "Signed and verified"],
  VOID: ["ملغي", "Void"],
};

export const COMMISSION_STATUS: Map = {
  PENDING: ["مستحقة", "Pending"],
  INVOICED: ["اتعملها فاتورة", "Invoiced"],
  PAID: ["اتدفعت", "Paid"],
  WAIVED: ["اتلغت", "Waived"],
};

export const ESCROW_STATUS: Map = {
  AWAITING_TRANSFER: ["مستني التحويل", "Awaiting transfer"],
  HELD: ["محفوظ في البنك", "Held in escrow"],
  RELEASED_TO_SELLER: ["اتصرف للبائع", "Released to seller"],
  REFUNDED_TO_BUYER: ["اترد للمشتري", "Refunded to buyer"],
};

export const RATE_SOURCE: Map = {
  CBE_AUTO: ["البنك المركزي (آلي)", "Central Bank (auto)"],
  MANUAL: ["إدخال يدوي", "Manual entry"],
  MARKET_API: ["مصدر سوق مفتوح (آلي)", "Open market source (auto)"],
};

export const BUY_REQUEST_STATUS: Map = {
  ACTIVE: ["شغال", "Active"],
  PAUSED: ["متوقف", "Paused"],
  FULFILLED: ["اتحقق", "Fulfilled"],
  CANCELLED: ["ملغي", "Cancelled"],
};

export const SERVICE_TYPE: Map = {
  DEADLINE_RESCUE: ["إنقاذ المهلة", "Deadline rescue"],
  SITE_INSPECTION: ["معاينة", "Site inspection"],
  VALUATION: ["تقييم قطعة", "Plot valuation"],
};

export const SERVICE_STATUS: Map = {
  NEW: ["جديد", "New"],
  CONTACTED: ["اتكلمنا معاه", "Contacted"],
  IN_PROGRESS: ["شغالين عليه", "In progress"],
  DELIVERED: ["اتسلّم", "Delivered"],
  CANCELLED: ["ملغي", "Cancelled"],
};

export type Tone = "gray" | "blue" | "green" | "amber" | "red" | "navy";

/** لون الشارة حسب الحالة */
export function toneOf(status: string): Tone {
  switch (status) {
    case "APPROVED":
    case "VERIFIED":
    case "PUBLISHED":
    case "SIGNED":
    case "PAID":
    case "HELD":
    case "DELIVERED":
    case "FULFILLED":
    case "COMPLETED":
    case "CLOSED":
    case "RELEASED_TO_SELLER":
    case "ACTIVE":
      return "green";
    case "REJECTED":
    case "VOID":
    case "CANCELLED":
    case "EXPIRED":
    case "REFUNDED_TO_BUYER":
    case "WAIVED":
      return "red";
    case "PENDING":
    case "IN_REVIEW":
    case "PENDING_LAWYER":
    case "AWAITING_TRANSFER":
    case "SENT_FOR_SIGNATURE":
    case "CHANGES_REQUESTED":
    case "ON_HOLD":
    case "NEW":
    case "PAUSED":
      return "amber";
    case "IN_DEAL":
    case "IN_PROGRESS":
    case "CONTACTED":
    case "INVOICED":
    case "UPLOADED":
      return "blue";
    case "SOLD":
      return "navy";
    default:
      return "gray";
  }
}
