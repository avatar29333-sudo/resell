"use server";

import { revalidatePath } from "next/cache";
import type { ServiceRequestStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requireUser } from "@/lib/auth";
import { idsByRole, notify } from "@/lib/notifications";
import { matches } from "@/lib/matching";
import { latestRate, totalEgp } from "@/lib/listing";
import { CITY } from "@/lib/labels";
import { toNum } from "@/lib/format";
import { isLocale } from "@/i18n/config";

const loc = (l: string) => (isLocale(l) ? l : "ar");
const staff = (l: string) => requireUser(loc(l), `/${loc(l)}/broker`, ["ADMIN", "BROKER", "AGENT"]);

/** الوسيط: يوثّق العرض أو ينشره أو يرجّعه للبائع */
export async function moveListing(locale: string, listingId: string, to: "VERIFIED" | "PUBLISHED" | "DRAFT") {
  const user = await requireUser(loc(locale), `/${loc(locale)}/broker`, ["ADMIN", "BROKER"]);
  const l = await db.listing.findUnique({ where: { id: listingId }, include: { documents: true, plot: true } });
  if (!l) return;
  const from = { VERIFIED: ["IN_REVIEW"], PUBLISHED: ["VERIFIED"], DRAFT: ["IN_REVIEW", "VERIFIED"] }[to];
  if (!from.includes(l.status)) return;
  // ما ينفعش يتوثّق قبل ما المحامي يعتمد خطاب التخصيص
  if (to === "VERIFIED" && !l.documents.some((d) => d.type === "ALLOCATION_LETTER" && d.status === "APPROVED")) return;
  await db.listing.update({ where: { id: listingId }, data: { status: to, ...(to === "PUBLISHED" ? { publishedAt: new Date() } : {}) } });
  await audit(user.id, `listing.${to.toLowerCase()}`, "Listing", listingId);

  const place = (i: 0 | 1) => `${CITY[l.plot.city][i]} — ${l.plot.district}`;
  if (to === "PUBLISHED") {
    await notify([l.sellerId], {
      kind: "listing.published",
      ar: [`قطعتك اتنشرت في السجل: ${place(0)}`],
      en: [`Your plot is now published: ${place(1)}`],
      link: `/listings/${listingId}`,
    });
    await notifyMatchingBuyers(listingId);
  } else if (to === "DRAFT") {
    await notify([l.sellerId], {
      kind: "listing.returned",
      ar: [`الوسيط رجّع عرضك للتعديل: ${place(0)}`, "راجع المستندات المرفوضة وارفع نسخة جديدة."],
      en: [`The broker returned your listing for changes: ${place(1)}`, "Check rejected documents and upload a new version."],
      link: `/account`,
    });
  }
  revalidatePath(`/${loc(locale)}/broker`);
}

/** لما عرض يتنشر: المشترين اللي طلب الشراء بتاعهم مطابق يوصلهم تنبيه */
async function notifyMatchingBuyers(listingId: string) {
  const l = await db.listing.findUniqueOrThrow({ where: { id: listingId }, include: { plot: true } });
  const rate = await latestRate();
  const facts = { city: l.plot.city, areaSqm: toNum(l.plot.areaSqm), totalEgp: totalEgp(l, toNum(rate?.sell ?? 50)) };
  const reqs = await db.buyRequest.findMany({ where: { status: "ACTIVE", buyerId: { not: l.sellerId } } });
  const buyers = reqs
    .filter((r) => matches({ cities: r.cities, minAreaSqm: r.minAreaSqm ? toNum(r.minAreaSqm) : null, maxAreaSqm: r.maxAreaSqm ? toNum(r.maxAreaSqm) : null, budgetMax: r.budgetMax ? toNum(r.budgetMax) : null }, facts))
    .map((r) => r.buyerId);
  await notify(buyers, {
    kind: "buy_request.match",
    ar: [`عرض جديد مطابق لطلبك: ${CITY[l.plot.city][0]} — ${facts.areaSqm} م²`],
    en: [`New listing matching your request: ${CITY[l.plot.city][1]} — ${facts.areaSqm} m²`],
    link: `/listings/${listingId}`,
  });
}

/** إرسال مستندات العرض للمحامي */
export async function sendDocsToLawyer(locale: string, listingId: string) {
  const user = await requireUser(loc(locale), `/${loc(locale)}/broker`, ["ADMIN", "BROKER"]);
  const r = await db.document.updateMany({ where: { listingId, status: "UPLOADED" }, data: { status: "IN_REVIEW" } });
  await audit(user.id, "documents.to_lawyer", "Listing", listingId, { count: r.count });
  if (r.count) {
    await notify(await idsByRole("LAWYER"), {
      kind: "documents.review_needed",
      ar: [`${r.count} مستند مستني مراجعتك`],
      en: [`${r.count} document(s) waiting for your review`],
      link: `/lawyer`,
    });
  }
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
  await notify([p.userId], {
    kind: approve ? "kyc.approved" : "kyc.rejected",
    ar: [approve ? "هويتك اتوثّقت — تقدر تمضي العقود" : "التوثيق اترفض — ارفع الصور تاني", reason ?? undefined],
    en: [approve ? "Your ID is verified — you can sign contracts" : "ID verification was rejected — please upload again", reason ?? undefined],
    link: `/account#kyc`,
  });
  revalidatePath(`/${loc(locale)}/broker`);
}

export async function updateServiceRequest(locale: string, id: string, form: FormData) {
  const user = await staff(locale);
  const status = String(form.get("status")) as ServiceRequestStatus;
  const assignedToId = String(form.get("assignedToId") ?? "") || null;
  const before = await db.serviceRequest.findUnique({ where: { id } });
  await db.serviceRequest.update({ where: { id }, data: { status, assignedToId } });
  await audit(user.id, "service_request.update", "ServiceRequest", id, { status, assignedToId });
  if (assignedToId && assignedToId !== before?.assignedToId && assignedToId !== user.id) {
    await notify([assignedToId], {
      kind: "service_request.assigned",
      ar: [`اتسند لك طلب خدمة: ${before?.contactName ?? ""}`],
      en: [`A service request was assigned to you: ${before?.contactName ?? ""}`],
      link: `/broker?tab=services`,
    });
  }
  revalidatePath(`/${loc(locale)}/broker`);
}
