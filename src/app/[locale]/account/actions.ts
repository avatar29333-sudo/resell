"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { City } from "@prisma/client";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requireUser } from "@/lib/auth";
import { fileFromForm, saveFile } from "@/lib/storage";
import { CITY_KEYS } from "@/lib/labels";
import { isLocale } from "@/i18n/config";
import { idsByRole, notify } from "@/lib/notifications";

const loc = (l: string) => (isLocale(l) ? l : "ar");

/** رفع البطاقة/الباسبور + صورة شخصية للتوثيق */
export async function submitKyc(locale: string, form: FormData) {
  const l = loc(locale);
  const user = await requireUser(l, `/${l}/account`);
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
  const l = loc(locale);
  const user = await requireUser(l, `/${l}/account`);
  const cities = form.getAll("cities").map(String).filter((c) => CITY_KEYS.includes(c as never)) as City[];
  const n = (k: string) => (Number(form.get(k)) > 0 ? Number(form.get(k)) : null);
  const br = await db.buyRequest.create({
    data: { buyerId: user.id, cities, minAreaSqm: n("minArea"), maxAreaSqm: n("maxArea"), budgetMax: n("budget") },
  });
  await audit(user.id, "buy_request.create", "BuyRequest", br.id);
  revalidatePath(`/${l}/account`);
}

export async function setBuyRequestStatus(locale: string, id: string, status: "ACTIVE" | "PAUSED" | "CANCELLED") {
  const l = loc(locale);
  const user = await requireUser(l, `/${l}/account`);
  const br = await db.buyRequest.findUnique({ where: { id } });
  if (!br || br.buyerId !== user.id) return;
  await db.buyRequest.update({ where: { id }, data: { status } });
  await audit(user.id, "buy_request.status", "BuyRequest", id, { status });
  revalidatePath(`/${l}/account`);
}

/**
 * نسخة جديدة من مستند اترفض: بتتحفظ بنفس المجموعة برقم إصدار أعلى،
 * والقديمة بتبقى «إصدار قديم» (ما بتتمسحش). العرض بيرجع للمراجعة.
 */
export async function uploadNewVersion(locale: string, documentId: string, form: FormData) {
  const l = loc(locale);
  const user = await requireUser(l, `/${l}/account`);
  const old = await db.document.findUnique({ where: { id: documentId }, include: { listing: true } });
  if (!old || old.ownerId !== user.id || old.status !== "REJECTED") redirect(`/${l}/account`);
  const f = await fileFromForm(form, "file");
  if (!f.file) redirect(`/${l}/account?upload=bad#listing-${old!.listingId}`);

  const s = await saveFile(f.file!.data, f.file!.type);
  const doc = await db.document.create({
    data: {
      type: old!.type,
      groupId: old!.groupId,
      version: old!.version + 1,
      ownerId: user.id,
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
  await notify(await idsByRole("BROKER"), {
    kind: "document.new_version",
    ar: [`${user.name} رفع نسخة جديدة من مستند مرفوض`, "ابعتها للمحامي من طابور التوثيق."],
    en: [`${user.name} uploaded a new version of a rejected document`, "Send it to the lawyer from the verification queue."],
    link: `/broker?tab=queue`,
  });
  redirect(`/${l}/account?upload=ok#listing-${old!.listingId}`);
}

/** البائع: يبعت المسودة للمراجعة أو يسحب العرض */
export async function setMyListingStatus(locale: string, id: string, to: "IN_REVIEW" | "WITHDRAWN") {
  const l = loc(locale);
  const user = await requireUser(l, `/${l}/account`);
  const listing = await db.listing.findUnique({ where: { id } });
  if (!listing || listing.sellerId !== user.id) return;
  const allowed = to === "IN_REVIEW" ? ["DRAFT", "WITHDRAWN"] : ["DRAFT", "IN_REVIEW", "VERIFIED", "PUBLISHED"];
  if (!allowed.includes(listing.status)) return;
  await db.listing.update({ where: { id }, data: { status: to } });
  await audit(user.id, `listing.${to === "IN_REVIEW" ? "submit" : "withdraw"}`, "Listing", id);
  revalidatePath(`/${l}/account`);
}
