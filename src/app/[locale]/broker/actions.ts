"use server";

import { revalidatePath } from "next/cache";
import type { ServiceRequestStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requireUser } from "@/lib/auth";
import { isLocale } from "@/i18n/config";

const loc = (l: string) => (isLocale(l) ? l : "ar");
const staff = (l: string) => requireUser(loc(l), `/${loc(l)}/broker`, ["ADMIN", "BROKER", "AGENT"]);

/** الوسيط: يوثّق العرض أو ينشره أو يرجّعه للبائع */
export async function moveListing(locale: string, listingId: string, to: "VERIFIED" | "PUBLISHED" | "DRAFT") {
  const user = await requireUser(loc(locale), `/${loc(locale)}/broker`, ["ADMIN", "BROKER"]);
  const l = await db.listing.findUnique({ where: { id: listingId }, include: { documents: true } });
  if (!l) return;
  const from = { VERIFIED: ["IN_REVIEW"], PUBLISHED: ["VERIFIED"], DRAFT: ["IN_REVIEW", "VERIFIED"] }[to];
  if (!from.includes(l.status)) return;
  // ما ينفعش يتوثّق قبل ما المحامي يعتمد خطاب التخصيص
  if (to === "VERIFIED" && !l.documents.some((d) => d.type === "ALLOCATION_LETTER" && d.status === "APPROVED")) return;
  await db.listing.update({ where: { id: listingId }, data: { status: to, ...(to === "PUBLISHED" ? { publishedAt: new Date() } : {}) } });
  await audit(user.id, `listing.${to.toLowerCase()}`, "Listing", listingId);
  revalidatePath(`/${loc(locale)}/broker`);
}

/** إرسال مستندات العرض للمحامي */
export async function sendDocsToLawyer(locale: string, listingId: string) {
  const user = await requireUser(loc(locale), `/${loc(locale)}/broker`, ["ADMIN", "BROKER"]);
  const r = await db.document.updateMany({ where: { listingId, status: "UPLOADED" }, data: { status: "IN_REVIEW" } });
  await audit(user.id, "documents.to_lawyer", "Listing", listingId, { count: r.count });
  revalidatePath(`/${loc(locale)}/broker`);
}

export async function kycDecision(locale: string, profileId: string, form: FormData) {
  const user = await requireUser(loc(locale), `/${loc(locale)}/broker`, ["ADMIN", "BROKER"]);
  const approve = form.get("decision") === "APPROVED";
  const reason = String(form.get("reason") ?? "").trim() || null;
  const p = await db.kycProfile.update({
    where: { id: profileId },
    data: { status: approve ? "APPROVED" : "REJECTED", reviewedById: user.id, reviewedAt: new Date(), rejectionReason: approve ? null : reason },
  });
  await db.user.update({ where: { id: p.userId }, data: { accountLevel: approve ? "VERIFIED" : "BASIC" } });
  await audit(user.id, `kyc.${approve ? "approve" : "reject"}`, "User", p.userId, { reason });
  revalidatePath(`/${loc(locale)}/broker`);
}

export async function updateServiceRequest(locale: string, id: string, form: FormData) {
  const user = await staff(locale);
  const status = String(form.get("status")) as ServiceRequestStatus;
  const assignedToId = String(form.get("assignedToId") ?? "") || null;
  await db.serviceRequest.update({ where: { id }, data: { status, assignedToId } });
  await audit(user.id, "service_request.update", "ServiceRequest", id, { status, assignedToId });
  revalidatePath(`/${loc(locale)}/broker`);
}
