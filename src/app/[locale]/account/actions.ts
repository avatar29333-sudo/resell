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
