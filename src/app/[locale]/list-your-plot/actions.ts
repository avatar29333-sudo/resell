"use server";

import { cleanTitle } from "@/lib/upload-rules";
import { createHash, randomInt } from "node:crypto";
import { classifyIdentifier } from "@/lib/identifier";
import { queueMessage } from "@/lib/outbox";
import { siteUrl } from "@/lib/meta";
import { allCities } from "@/lib/cities";
import { redirect } from "next/navigation";
import type { DocumentType } from "@prisma/client";
type City = string;
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
  await allCities(); // GEO-01: قايمة المدن من الجدول
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
  // PUB-03: الشريك أو الوسيط بيعرض نيابة عن مالك — بيانات المالك + التفويض الموقّع، والمالك بيأكّد بكود
  const onBehalf = isPartner || user.role === "BROKER" || user.role === "BROKER_LEAD";
  if (isPartner && !user.partnerAgreedAt) return { error: ar ? "وافق على اتفاقية السمسار الشريك (نموذج 10) الأول من «حسابي»." : "Accept the partner agreement (form 10) first from your account." };
  if (onBehalf && form.get("clientConsent") !== "on") return { error: ar ? "لازم تأكد إن المالك موافق على العرض." : "Confirm the owner has consented to this listing." };
  const ownerName = String(form.get("ownerName") ?? "").trim().replace(/\s+/g, " ");
  const ownerId = classifyIdentifier(String(form.get("ownerPhone") ?? ""));
  const ownerNationalId = String(form.get("ownerNationalId") ?? "").replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).trim();
  if (onBehalf && (ownerName.length < 5 || ownerId.kind !== "phone" || !/^\d{14}$|^[A-Z0-9]{6,12}$/i.test(ownerNationalId))) {
    return { error: ar ? "كمّل بيانات المالك: الاسم، الموبايل، ورقم البطاقة (14 رقم) أو الباسبور." : "Complete the owner's details: name, mobile and national ID (14 digits) or passport." };
  }
  const authDocId = String(form.get("authDocIds") ?? "");
  const authDoc = onBehalf && authDocId ? await db.document.findFirst({ where: { id: authDocId, ownerId: user.id, uploadedById: user.id, type: "OTHER", listingId: null, dealId: null } }) : null;
  if (onBehalf && !authDoc) return { error: ar ? "ارفع التفويض الموقّع من المالك (نموذج 1)." : "Upload the authorization signed by the owner (form 1)." };

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
  // GEO-02: الطرح لازم يكون تبع نفس المدينة (أو عام)
  const roundId = s("offeringRoundId");
  const round = roundId ? await db.offeringRound.findFirst({ where: { id: roundId, isActive: true, OR: [{ cityId: city }, { cityId: null }] } }) : null;
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
        districtId: v.values.district!.id,
        offeringRoundId: round?.id ?? null,
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
  // PUB-03: حد يومي لرسايل تأكيد الملاك من نفس الشخص، وما ينفعش المالك يبقى حساب فريق
  if (onBehalf) {
    const today = await db.auditLog.count({ where: { actorId: user.id, action: "listing.create", createdAt: { gt: new Date(Date.now() - 24 * 3600_000) } } });
    if (today >= 20) return { error: ar ? "وصلت للحد اليومي للعروض نيابة عن ملاك — كمّل بكرة." : "Daily limit for on-behalf listings reached — continue tomorrow." };
    const existing = await db.user.findUnique({ where: { phone: (ownerId as { value: string }).value }, select: { role: true } });
    if (existing && existing.role !== "CLIENT") return { error: ar ? "الرقم ده تبع حساب فريق — ما ينفعش يتعرض باسمه نيابة عنه." : "That number belongs to a team account." };
  }
  // PUB-03: المالك (لو نيابة) — حساب موجود بالموبايل، أو حساب عميل جديد باسمه
  const owner = onBehalf
    ? ((await db.user.findUnique({ where: { phone: (ownerId as { value: string }).value } })) ?? (await db.user.create({ data: { name: ownerName, phone: (ownerId as { value: string }).value, role: "CLIENT", locale: l } })))
    : user;
  const ownerCode = onBehalf ? String(randomInt(0, 1_000_000)).padStart(6, "0") : null;
  const listing = await db.listing.create({
    data: {
      plotId: plot.id,
      sellerId: owner.id,
      submittedById: user.id,
      ownerConfirmCodeHash: ownerCode ? createHash("sha256").update(ownerCode).digest("hex") : null,
      ownerConfirmExpiresAt: ownerCode ? new Date(Date.now() + 7 * 24 * 3600_000) : null,
      assignedBrokerId: brokerId,
      clientConsentAt: onBehalf ? new Date() : null,
      priceType,
      price,
      currency: "EGP",
      paidAmountUsd: priceType === "PAID_PLUS_PREMIUM" ? paidUsd : null,
      // MKT-02: الأقساط الباقية بالدولار (اختياري، رقم موجب بس)
      remainingUsd: Number(form.get("remainingUsd")) > 0 && form.get("paymentStatus") !== "FULLY_PAID" ? Number(form.get("remainingUsd")) : null,
      // PUB-01: مسودة لحد موافقة المالك على نموذج 1 (أو تأكيده بالكود لو نيابة) — بعدها بتتبعت للمراجعة تلقائياً
      status: "DRAFT",
    },
  });
  if (authDoc) await db.document.update({ where: { id: authDoc.id }, data: { listingId: listing.id, plotId: plot.id, title: `تفويض المالك (نموذج 1) — ${ownerName} — ${ownerNationalId.slice(-4)}` } });
  if (onBehalf && ownerCode) {
    const link = `${siteUrl()}/${l}/owner-confirm/${listing.id}`;
    const text = `Resell: ${user.name} عرض قطعتك ${code} للبيع نيابة عنك. لو موافق افتح ${link} واكتب الكود ${ownerCode}. لو مش إنت اللي فوّضته تجاهل الرسالة.`;
    await queueMessage("whatsapp", owner.phone, "listing.owner_confirm", text);
    await queueMessage("sms", owner.phone, "listing.owner_confirm", text);
  }

  // الملفات اللي اترفعت مؤقتاً بتتربط بالعرض
  if (drafts.length) await db.document.updateMany({ where: { id: { in: drafts } }, data: { listingId: listing.id, plotId: plot.id } });
  // DOC-01: «مستندات أخرى» بعنوان — مسودات رفعها نفس المستخدم
  const otherIds = form.getAll("docIds").map(String).slice(0, 20);
  if (otherIds.length) {
    const others = await db.document.findMany({ where: { id: { in: otherIds }, ownerId: user.id, uploadedById: user.id, type: "OTHER", dealId: null, listingId: null, plotId: null } });
    for (const d of others) {
      await db.document.update({ where: { id: d.id }, data: { listingId: listing.id, plotId: plot.id, title: cleanTitle(form.get(`title_${d.id}`)) ?? d.fileName } });
    }
  }
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
  // الوسيط بيتبلّغ لما العرض يتبعت للمراجعة (بعد موافقة المالك) — submitListingIfReady
  // DATA-09: المهلة خلصت → العرض اتقبل، وبنعرض على البائع «إنقاذ المهلة»
  if (v.values.deadlinePassed) await audit(user.id, "plot.deadline_passed", "Plot", plot.id, { deadline: deadline?.toISOString().slice(0, 10) ?? null });
  redirect(onBehalf ? `/${l}/account?listed=owner#my-plots` : `/${l}/account?listed=1${v.values.deadlinePassed ? "&rescue=1" : ""}#consents`);
}
