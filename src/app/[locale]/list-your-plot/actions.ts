"use server";

import { redirect } from "next/navigation";
import type { City, DocumentType } from "@prisma/client";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requireUser } from "@/lib/auth";
import { fileFromForm, saveFile } from "@/lib/storage";
import { CITY_KEYS } from "@/lib/labels";
import { isLocale } from "@/i18n/config";
import { idsByRole, notify } from "@/lib/notifications";
import { can, subject } from "@/lib/authz";
import { leastLoaded } from "@/lib/assign";
import { validatePlotInput, type PlotErrors } from "@/lib/plot-input";

export type ListState = { error?: string; fieldErrors?: PlotErrors & Partial<Record<"allocation" | "receipts" | "statement", string>> };

const FILE_FIELDS: [string, DocumentType][] = [
  ["allocation", "ALLOCATION_LETTER"],
  ["receipts", "PAYMENT_RECEIPT"],
  ["statement", "AUTHORITY_STATEMENT"],
];

/**
 * UX-01/UX-02: رفع مؤقت أول ما الملف يتختار — بيرجع id بيتحفظ في الفورم والمسودة،
 * فلو حصل خطأ أو الصفحة اتقفلت الملف ما يضيعش. بيتربط بالعرض لما يتبعت.
 */
export async function uploadDraftFile(locale: string, field: string, form: FormData): Promise<{ id?: string; name?: string; error?: string }> {
  const l = isLocale(locale) ? locale : "ar";
  const ar = l === "ar";
  const user = await requireUser(l, `/${l}/list-your-plot`);
  if (!can(subject(user), "listing.create", {}).allowed) return { error: ar ? "لازم توثّق هويتك الأول." : "Verify your ID first." };
  const type = FILE_FIELDS.find(([f]) => f === field)?.[1];
  if (!type) return { error: "field" };
  const r = await fileFromForm(form, "file");
  if ("error" in r && r.error) return { error: ar ? "الملف لازم يكون PDF أو صورة (JPG/PNG/WebP) وأقل من 4 ميجا" : "The file must be a PDF or image (JPG/PNG/WebP) under 4 MB" };
  if (!r.file) return { error: ar ? "اختار ملف" : "Choose a file" };
  const s = await saveFile(r.file.data, r.file.type);
  const d = await db.document.create({
    data: { type, ownerId: user.id, uploadedById: user.id, storageKey: s.key, sha256: s.sha256, sizeBytes: s.sizeBytes, fileName: r.file.name, mimeType: r.file.type },
  });
  await audit(user.id, "document.draft_upload", "Document", d.id, { type });
  return { id: d.id, name: r.file.name };
}

const FIELD_MSG: Record<string, Record<string, [string, string]>> = {
  city: { required: ["اختار المدينة", "Choose the city"] },
  district: { required: ["اختار المرحلة / الحي من القايمة", "Choose the phase / district from the list"] },
  code: {
    required: ["اكتب كود القطعة", "Enter the plot code"],
    format: ["الكود لازم يكون بالشكل ده: NC-8E-1016 (بادئة المدينة-البلوك-الرقم)", "The code must look like NC-8E-1016 (city prefix-block-number)"],
    prefix: ["بادئة الكود مش مطابقة للمدينة اللي اخترتها", "The code prefix doesn't match the chosen city"],
  },
  area: { range: ["المساحة لازم تكون بين 50 و 5000 م²", "The area must be between 50 and 5,000 m²"] },
  construction: { range: ["نسبة التنفيذ لازم تكون رقم صحيح من 0 لـ 100", "Construction must be a whole number from 0 to 100"] },
  deadline: { invalid: ["تاريخ المهلة مش صحيح", "The deadline date is invalid"] },
  price: { required: ["اكتب السعر", "Enter the price"] },
  paidUsd: { required: ["اكتب المبلغ المدفوع بالدولار", "Enter the amount paid in USD"] },
};

export async function createListing(locale: string, _prev: ListState, form: FormData): Promise<ListState> {
  const l = isLocale(locale) ? locale : "ar";
  const ar = l === "ar";
  const user = await requireUser(l, `/${l}/list-your-plot`);
  // 5.2: عرض قطعة للعميل/الشريك الموثّق بس — والقرار في السيرفر
  const d = can(subject(user), "listing.create", {});
  if (!d.allowed) {
    await audit(user.id, "authz.denied", "Action", "listing.create", { reason: d.reason ?? "forbidden" });
    return { error: ar ? "لازم توثّق هويتك الأول عشان تعرض قطعة." : "You need to verify your ID before listing a plot." };
  }
  const isPartner = user.role === "PARTNER_BROKER";
  if (isPartner && form.get("clientConsent") !== "on") return { error: ar ? "لازم تأكد إن المالك موافق على العرض." : "Confirm the owner has consented to this listing." };

  const s = (k: string) => String(form.get(k) ?? "");
  const city = s("city");
  const priceType = form.get("priceType") === "PAID_PLUS_PREMIUM" ? "PAID_PLUS_PREMIUM" : "ALL_INCLUSIVE";
  const districts = await db.district.findMany({ where: { city: CITY_KEYS.includes(city as never) ? (city as City) : undefined }, select: { id: true, city: true, active: true, nameAr: true, nameEn: true } });
  // DATA-07 + DATA-09: التحقق في السيرفر، والأخطاء لكل حقل
  const v = validatePlotInput(
    { city, districtId: s("districtId"), code: s("code"), area: s("area"), construction: s("construction"), deadline: s("deadline"), price: s("price"), priceType, paidUsd: s("paidUsd") },
    { cities: CITY_KEYS as string[], districts, today: new Date() },
  );
  if (!v.ok) {
    const first = Object.keys(v.errors)[0] as keyof PlotErrors;
    return { error: FIELD_MSG[first]?.[v.errors[first] ?? ""]?.[ar ? 0 : 1] ?? (ar ? "كمّل بيانات القطعة" : "Complete the plot details"), fieldErrors: v.errors };
  }
  const { code, area, construction, price, paidUsd } = v.values;
  const district = v.values.district!.nameAr;
  const districtEn = v.values.district!.nameEn;
  const deadline = v.values.deadline;

  // الملفات: خطاب التخصيص إجباري
  // UX-01: الملف ممكن يكون اترفع مؤقتاً أول ما اتختار (id) أو جاي مع الفورم
  const uploads = [];
  const drafts: string[] = [];
  for (const [field, type] of FILE_FIELDS) {
    const draftId = String(form.get(`${field}Id`) ?? "");
    if (draftId) {
      const d = await db.document.findFirst({ where: { id: draftId, ownerId: user.id, uploadedById: user.id, type, listingId: null, plotId: null, dealId: null, serviceRequestId: null } });
      if (d) {
        drafts.push(d.id);
        continue;
      }
    }
    const r = await fileFromForm(form, field);
    if ("error" in r && r.error) return { error: ar ? "كل ملف لازم يكون PDF أو صورة (JPG/PNG/WebP) وأقل من 4 ميجا" : "Each file must be a PDF or image (JPG/PNG/WebP) under 4 MB", fieldErrors: { [field]: "file" } };
    if (r.file) uploads.push({ ...r.file, docType: type });
  }
  const hasAllocation = uploads.some((u) => u.docType === "ALLOCATION_LETTER") || (await db.document.count({ where: { id: { in: drafts }, type: "ALLOCATION_LETTER" } })) > 0;
  if (!hasAllocation) return { error: ar ? "خطاب التخصيص مطلوب" : "The allocation letter is required", fieldErrors: { allocation: "required" } };

  // كشف التكرار: نفس القطعة معروضة بالفعل؟
  const existingPlot = await db.plot.findUnique({ where: { city_district_code: { city: city as City, district, code } } });
  if (existingPlot) {
    const active = await db.listing.findFirst({
      where: { plotId: existingPlot.id, status: { in: ["IN_REVIEW", "VERIFIED", "PUBLISHED", "IN_DEAL"] } },
    });
    if (active) {
      await audit(user.id, "listing.duplicate_blocked", "Plot", existingPlot.id);
      return { error: ar ? "القطعة دي معروضة بالفعل على المنصة. لو دي قطعتك كلّمنا." : "This plot is already listed. If it's yours, contact us." };
    }
  }

  const plot =
    existingPlot ??
    (await db.plot.create({
      data: {
        city: city as City,
        district,
        districtEn,
        code,
        areaSqm: area,
        paymentStatus: form.get("paymentStatus") === "FULLY_PAID" ? "FULLY_PAID" : "INSTALLMENTS",
        constructionPercent: construction,
        buildDeadline: deadline,
        createdById: user.id,
      },
    }));

  // PERM-04: وسيط العرض = أقل وسيط عنده شغل (مش صاحب العرض)
  const brokerId = await leastLoaded("BROKER", [user.id]);
  const listing = await db.listing.create({
    data: {
      plotId: plot.id,
      sellerId: user.id,
      submittedById: user.id,
      assignedBrokerId: brokerId,
      clientConsentAt: isPartner ? new Date() : null,
      priceType,
      price,
      currency: "EGP",
      paidAmountUsd: priceType === "PAID_PLUS_PREMIUM" ? paidUsd : null,
      status: "IN_REVIEW",
    },
  });

  // الملفات اللي اترفعت مؤقتاً بتتربط بالعرض
  if (drafts.length) await db.document.updateMany({ where: { id: { in: drafts } }, data: { listingId: listing.id, plotId: plot.id } });
  for (const u of uploads) {
    const s = await saveFile(u.data, u.type);
    await db.document.create({
      data: {
        type: u.docType,
        ownerId: user.id,
        uploadedById: user.id,
        plotId: plot.id,
        listingId: listing.id,
        storageKey: s.key,
        sha256: s.sha256,
        sizeBytes: s.sizeBytes,
        fileName: u.name,
        mimeType: u.type,
      },
    });
  }
  await audit(user.id, "listing.create", "Listing", listing.id, { plotId: plot.id, files: uploads.length + drafts.length, brokerId });
  if (brokerId) await audit(null, "listing.assign_broker", "Listing", listing.id, { before: null, after: brokerId, auto: true });
  await notify(brokerId ? [brokerId] : await idsByRole("BROKER_LEAD"), {
    kind: "listing.new",
    ar: [`عرض جديد مسند ليك مستني المراجعة من ${user.name}`, `${area} م² — ${district}`],
    en: [`New listing assigned to you for review from ${user.name}`, `${area} m² — ${district}`],
    link: `/broker?tab=queue`,
  });
  // DATA-09: المهلة خلصت → العرض اتقبل، وبنعرض على البائع «إنقاذ المهلة»
  if (v.values.deadlinePassed) await audit(user.id, "plot.deadline_passed", "Plot", plot.id, { deadline: deadline?.toISOString().slice(0, 10) ?? null });
  redirect(`/${l}/account?listed=1${v.values.deadlinePassed ? "&rescue=1" : ""}`);
}
