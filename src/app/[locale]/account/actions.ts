"use server";

import { allCities } from "@/lib/cities";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
/** GEO-01: المدينة = مفتاح نصي من جدول المدن */
type City = string;
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requireUser } from "@/lib/auth";
import { authorize, dealCtx, listingCtx } from "@/lib/authz";
import { fileFromForm, saveFile } from "@/lib/storage";
import { CITY_KEYS } from "@/lib/labels";
import { isLocale } from "@/i18n/config";
import { idsByRole, notify } from "@/lib/notifications";
import { newToken } from "@/lib/outbox";

const loc = (l: string) => (isLocale(l) ? l : "ar");

/** رفع البطاقة/الباسبور + صورة شخصية للتوثيق (العميل والشريك لنفسهم بس) */
export async function submitKyc(locale: string, form: FormData) {
  const l = loc(locale);
  const back = `/${l}/account#kyc`;
  const user = await requireUser(l, `/${l}/account`);
  await authorize(user, "kyc.submit", { target: { id: user.id } }, { back });
  const idType = form.get("idType") === "PASSPORT" ? "PASSPORT" : "NATIONAL_ID";
  const id = await fileFromForm(form, "idFile");
  const selfie = await fileFromForm(form, "selfieFile");
  if (!id.file || !selfie.file) redirect(`/${l}/account?kyc=missing#kyc`);

  const mk = async (f: NonNullable<typeof id.file>, type: "NATIONAL_ID" | "PASSPORT" | "SELFIE") => {
    const s = await saveFile(f.data, f.type, "kyc");
    return db.document.create({
      data: { type, ownerId: user.id, uploadedById: user.id, storageKey: s.key, sha256: s.sha256, sizeBytes: s.sizeBytes, fileName: f.name, mimeType: f.type },
    });
  };
  const idDoc = await mk(id.file!, idType);
  const selfieDoc = await mk(selfie.file!, "SELFIE");

  const existing = await db.kycProfile.findUnique({ where: { userId: user.id } });
  if (existing) {
    await db.kycProfile.update({
      where: { userId: user.id },
      data: { idType, idDocumentId: idDoc.id, selfieDocumentId: selfieDoc.id, status: "PENDING", rejectionReason: null, reviewedAt: null, reviewedById: null },
    });
  } else {
    await db.kycProfile.create({ data: { userId: user.id, idType, idDocumentId: idDoc.id, selfieDocumentId: selfieDoc.id } });
  }
  await audit(user.id, "kyc.submit", "User", user.id, { idType });
  redirect(`/${l}/account?kyc=sent#kyc`);
}

export async function createBuyRequest(locale: string, form: FormData) {
  await allCities(); // GEO-01: قايمة المدن من الجدول
  const l = loc(locale);
  const user = await requireUser(l, `/${l}/account`);
  // PUB-01: نشر طلب شراء — العميل الأساسي بيظهر بعد مراجعة، الموثّق مباشر
  await authorize(user, "buy_request.create", { target: { id: user.id } }, { back: `/${l}/account` });
  const cities = form.getAll("cities").map(String).filter((c) => CITY_KEYS.includes(c as never)) as City[];
  const n = (k: string) => (Number(form.get(k)) > 0 ? Number(form.get(k)) : null);
  // MKT-13: تنبيهات واتساب بموافقة صريحة بس (الخانة مش متعلّمة من الأول) + رابط إيقاف
  const alerts = form.get("alerts") === "on";
  const br = await db.buyRequest.create({
    data: { buyerId: user.id, cities, minAreaSqm: n("minArea"), maxAreaSqm: n("maxArea"), budgetMax: n("budget"), approvedAt: user.role === "CLIENT" && user.accountLevel !== "VERIFIED" ? null : new Date(), ...(alerts ? { alertConsentAt: new Date(), unsubToken: newToken() } : {}) },
  });
  await audit(user.id, "buy_request.create", "BuyRequest", br.id, { alerts });
  revalidatePath(`/${l}/account`);
}

export async function setBuyRequestStatus(locale: string, id: string, status: "ACTIVE" | "PAUSED" | "CANCELLED") {
  const l = loc(locale);
  const user = await requireUser(l, `/${l}/account`);
  const br = await db.buyRequest.findUnique({ where: { id } });
  if (!br) return;
  await authorize(user, "buy_request.manage", { target: { id: br.buyerId } }, { back: `/${l}/account` });
  await db.buyRequest.update({ where: { id }, data: { status } });
  await audit(user.id, "buy_request.status", "BuyRequest", id, { before: br.status, after: status });
  revalidatePath(`/${l}/account`);
}

/** MKT-13: تشغيل/إيقاف تنبيهات واتساب لطلب شراء */
export async function setBuyRequestAlerts(locale: string, id: string, on: boolean) {
  const l = loc(locale);
  const user = await requireUser(l, `/${l}/account`);
  const br = await db.buyRequest.findUnique({ where: { id } });
  if (!br) return;
  await authorize(user, "buy_request.manage", { target: { id: br.buyerId } }, { back: `/${l}/account` });
  await db.buyRequest.update({ where: { id }, data: on ? { alertConsentAt: new Date(), unsubToken: br.unsubToken ?? newToken() } : { alertConsentAt: null } });
  await audit(user.id, on ? "buy_request.alerts_on" : "buy_request.alerts_off", "BuyRequest", id);
  revalidatePath(`/${l}/account`);
}

/**
 * نسخة جديدة من مستند اترفض: بتتحفظ بنفس المجموعة برقم إصدار أعلى،
 * والقديمة بتبقى «إصدار قديم» (ما بتتمسحش). العرض بيرجع للمراجعة.
 */
export async function uploadNewVersion(locale: string, documentId: string, form: FormData) {
  const l = loc(locale);
  const user = await requireUser(l, `/${l}/account`);
  const old = await db.document.findUnique({
    where: { id: documentId },
    include: {
      listing: { include: { documents: { select: { type: true, status: true } }, deals: { select: { stage: true, status: true } } } },
      deal: { include: { listing: true } },
    },
  });
  if (!old || old.status !== "REJECTED") redirect(`/${l}/account`);
  const lctx = old!.listing ? listingCtx(old!.listing) : old!.deal ? listingCtx({ ...old!.deal.listing, documents: [] }) : undefined;
  // صاحب المستند الأصلي، أو صاحب العرض/الشريك اللي رفعه
  if (old!.ownerId !== user.id) {
    await authorize(user, "document.upload_listing", { listing: lctx, deal: old!.deal ? dealCtx(old!.deal) : undefined }, { back: `/${l}/account` });
  }
  const f = await fileFromForm(form, "file");
  if (!f.file) redirect(`/${l}/account?upload=bad#listing-${old!.listingId}`);

  const s = await saveFile(f.file!.data, f.file!.type);
  const doc = await db.document.create({
    data: {
      type: old!.type,
      groupId: old!.groupId,
      version: old!.version + 1,
      ownerId: old!.ownerId,
      uploadedById: user.id,
      plotId: old!.plotId,
      listingId: old!.listingId,
      dealId: old!.dealId,
      storageKey: s.key,
      sha256: s.sha256,
      sizeBytes: s.sizeBytes,
      fileName: f.file!.name,
      mimeType: f.file!.type,
    },
  });
  await db.document.update({ where: { id: old!.id }, data: { status: "SUPERSEDED" } });
  if (old!.listing && ["DRAFT", "WITHDRAWN"].includes(old!.listing.status)) {
    await db.listing.update({ where: { id: old!.listing.id }, data: { status: "IN_REVIEW" } });
  }
  await audit(user.id, "document.new_version", "Document", doc.id, { previous: old!.id, version: doc.version });
  // للوسيط المسند بس
  await notify([old!.listing?.assignedBrokerId ?? old!.deal?.brokerId], {
    kind: "document.new_version",
    ar: [`${user.name} رفع نسخة جديدة من مستند مرفوض`, "ابعتها للمحامي من طابور التوثيق."],
    en: [`${user.name} uploaded a new version of a rejected document`, "Send it to the lawyer from the verification queue."],
    link: `/broker?tab=queue`,
  });
  redirect(`/${l}/account?upload=ok#listing-${old!.listingId}`);
}

/** MKT-07: طلب تسجيل كسمسار شريك — برقم القيد، والأدمن بيراجع قبل التفعيل */
export async function applyAsPartner(locale: string, form: FormData) {
  const l = loc(locale);
  const back = `/${l}/account`;
  const user = await requireUser(l, back);
  if (user.role !== "CLIENT" || user.accountLevel !== "VERIFIED") redirect(`${back}?partner=not_eligible#partner`);
  const regNo = String(form.get("brokerRegNo") ?? "").trim().toUpperCase().slice(0, 40);
  if (regNo.length < 4) redirect(`${back}?partner=reg_no#partner`);
  await db.user.update({ where: { id: user.id }, data: { brokerRegNo: regNo, partnerApprovedAt: null } });
  await audit(user.id, "partner.apply", "User", user.id, { brokerRegNo: regNo });
  await notify(await idsByRole("ADMIN"), {
    kind: "partner.application",
    ar: [`طلب سمسار شريك جديد: ${user.name}`, `رقم القيد ${regNo} — راجعه في سجل الوسطاء قبل التفعيل.`],
    en: [`New partner broker application: ${user.name}`, `Registry no. ${regNo} — check it against the broker registry before approving.`],
    link: `/settings?tab=users&role=CLIENT&q=${encodeURIComponent(user.phone)}`,
  });
  redirect(`${back}?partner=sent#partner`);
}

/** البائع (أو الشريك اللي عرضها): يبعت المسودة للمراجعة أو يسحب العرض */
export async function setMyListingStatus(locale: string, id: string, to: "IN_REVIEW" | "WITHDRAWN") {
  const l = loc(locale);
  const back = `/${l}/account`;
  const user = await requireUser(l, back);
  const listing = await db.listing.findUnique({ where: { id }, include: { documents: { select: { type: true, status: true } }, deals: { select: { stage: true, status: true } } } });
  if (!listing) return;
  await authorize(user, to === "IN_REVIEW" ? "listing.submit" : "listing.withdraw", { listing: listingCtx(listing) }, { back });
  if (to === "WITHDRAWN" && !["DRAFT", "IN_REVIEW", "VERIFIED", "PUBLISHED"].includes(listing.status)) return;
  await db.listing.update({ where: { id }, data: { status: to } });
  await audit(user.id, `listing.${to === "IN_REVIEW" ? "submit" : "withdraw"}`, "Listing", id, { before: listing.status, after: to });
  if (to === "IN_REVIEW") {
    await notify([listing.assignedBrokerId], {
      kind: "listing.submitted",
      ar: ["عرض مسند ليك اتبعت للمراجعة"],
      en: ["A listing assigned to you was submitted for review"],
      link: `/broker?tab=queue`,
    });
  }
  revalidatePath(back);
}
