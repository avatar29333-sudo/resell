"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ServiceRequestStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requireUser } from "@/lib/auth";
import { authorize, listingCtx, overrideReason } from "@/lib/authz";
import { notify } from "@/lib/notifications";
import { matches } from "@/lib/matching";
import { latestRate, totalEgp } from "@/lib/listing";
import { leastLoaded } from "@/lib/assign";
import { CITY } from "@/lib/labels";
import { districtName } from "@/lib/district";
import { toNum } from "@/lib/format";
import { isLocale } from "@/i18n/config";

const loc = (l: string) => (isLocale(l) ? l : "ar");
const back = (l: string, tab = "queue") => `/${loc(l)}/broker?tab=${tab}`;

async function loadListing(id: string) {
  return db.listing.findUnique({
    where: { id },
    include: { plot: true, documents: { select: { id: true, type: true, status: true } }, deals: { select: { stage: true, status: true } } },
  });
}

/** توثيق العرض أو نشره أو إرجاعه للبائع — حسب السياسة (5.2 + SEC-03) */
export async function moveListing(locale: string, listingId: string, to: "VERIFIED" | "PUBLISHED" | "DRAFT", form?: FormData) {
  const user = await requireUser(loc(locale), back(locale));
  const l = await loadListing(listingId);
  if (!l) return;
  const action = to === "VERIFIED" ? "listing.verify" : to === "PUBLISHED" ? "listing.publish" : "listing.pause";
  await authorize(user, action, { listing: listingCtx(l) }, { back: back(locale), reason: overrideReason(form) });
  const from = { VERIFIED: ["IN_REVIEW"], PUBLISHED: ["VERIFIED"], DRAFT: ["IN_REVIEW", "VERIFIED", "PUBLISHED"] }[to];
  if (!from.includes(l.status)) return;
  // CON-03: النشر بعد موافقة المالك على تفويض العرض (نموذج 1) بس
  if (to === "PUBLISHED" && !(await db.consentRecord.findFirst({ where: { kind: "listing_authorization", listingId, userId: l.sellerId }, select: { id: true } }))) {
    redirect(`${back(locale)}${back(locale).includes("?") ? "&" : "?"}err=authorization`);
  }
  await db.listing.update({ where: { id: listingId }, data: { status: to, ...(to === "PUBLISHED" ? { publishedAt: new Date() } : {}) } });
  await audit(user.id, `listing.${to.toLowerCase()}`, "Listing", listingId, { from: l.status, to });

  const place = (i: 0 | 1) => `${CITY[l.plot.city][i]} — ${districtName(l.plot, i ? "en" : "ar")}`;
  if (to === "PUBLISHED") {
    await notify([l.sellerId, l.submittedById], {
      kind: "listing.published",
      ar: [`قطعتك اتنشرت في السجل: ${place(0)}`],
      en: [`Your plot is now published: ${place(1)}`],
      link: `/listings/${listingId}`,
    });
    await notifyMatchingBuyers(listingId);
  } else if (to === "DRAFT") {
    await notify([l.sellerId, l.submittedById], {
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
    .filter((r) =>
      matches(
        { cities: r.cities, minAreaSqm: r.minAreaSqm ? toNum(r.minAreaSqm) : null, maxAreaSqm: r.maxAreaSqm ? toNum(r.maxAreaSqm) : null, budgetMax: r.budgetMax ? toNum(r.budgetMax) : null },
        facts,
      ),
    )
    .map((r) => r.buyerId);
  await notify(buyers, {
    kind: "buy_request.match",
    ar: [`عرض جديد مطابق لطلبك: ${CITY[l.plot.city][0]} — ${facts.areaSqm} م²`],
    en: [`New listing matching your request: ${CITY[l.plot.city][1]} — ${facts.areaSqm} m²`],
    link: `/listings/${listingId}`,
  });
}

/** إرسال مستندات العرض للمحامي — والمحامي بيتسند أوتوماتيك لو مش مسند (PERM-04) */
export async function sendDocsToLawyer(locale: string, listingId: string, form?: FormData) {
  const user = await requireUser(loc(locale), back(locale));
  const l = await loadListing(listingId);
  if (!l) return;
  await authorize(user, "listing.send_to_lawyer", { listing: listingCtx(l) }, { back: back(locale), reason: overrideReason(form) });
  let lawyerId = l.assignedLawyerId;
  if (!lawyerId) {
    lawyerId = await leastLoaded("LAWYER", [l.sellerId, ...(l.submittedById ? [l.submittedById] : [])]);
    if (lawyerId) {
      await db.listing.update({ where: { id: listingId }, data: { assignedLawyerId: lawyerId } });
      await audit(user.id, "listing.assign_lawyer", "Listing", listingId, { before: null, after: lawyerId, auto: true });
    }
  }
  const r = await db.document.updateMany({ where: { listingId, status: "UPLOADED" }, data: { status: "IN_REVIEW" } });
  await audit(user.id, "documents.to_lawyer", "Listing", listingId, { count: r.count, lawyerId });
  if (r.count) {
    await notify([lawyerId], {
      kind: "documents.review_needed",
      ar: [`${r.count} مستند مستني مراجعتك`],
      en: [`${r.count} document(s) waiting for your review`],
      link: `/lawyer`,
    });
  }
  revalidatePath(`/${loc(locale)}/broker`);
}

/** قبول/رفض التوثيق — مش لنفسه ولا لطرف في صفقة مسندة ليه (7.3)، وبعد 3 رفضات للأدمن بس */
export async function kycDecision(locale: string, profileId: string, form: FormData) {
  const user = await requireUser(loc(locale), back(locale));
  const p = await db.kycProfile.findUnique({ where: { id: profileId }, include: { user: true } });
  if (!p) return;
  const conflict = !!(await db.deal.findFirst({
    where: { brokerId: user.id, status: { in: ["ACTIVE", "ON_HOLD"] }, OR: [{ buyerId: p.userId }, { listing: { sellerId: p.userId } }] },
  }));
  await authorize(user, "kyc.decide", { target: { id: p.userId, kycPending: p.status === "PENDING" }, conflict }, { back: back(locale), reason: overrideReason(form) });
  if (p.user.kycRejections >= 3 && user.role !== "ADMIN") redirect(`${back(locale)}&err=admin_review`);
  const approve = form.get("decision") === "APPROVED";
  const reason = String(form.get("reason") ?? "").trim() || null;
  if (!approve && (reason?.length ?? 0) < 10) redirect(`${back(locale)}&err=note_required`);
  await db.kycProfile.update({
    where: { id: profileId },
    data: { status: approve ? "APPROVED" : "REJECTED", reviewedById: user.id, reviewedAt: new Date(), rejectionReason: approve ? null : reason },
  });
  await db.user.update({ where: { id: p.userId }, data: { accountLevel: approve ? "VERIFIED" : "BASIC", ...(approve ? {} : { kycRejections: { increment: 1 } }) } });
  await audit(user.id, `kyc.${approve ? "approve" : "reject"}`, "User", p.userId, { reason, before: p.user.accountLevel, after: approve ? "VERIFIED" : "BASIC" });
  await notify([p.userId], {
    kind: approve ? "kyc.approved" : "kyc.rejected",
    ar: [approve ? "هويتك اتوثّقت — تقدر تعرض قطع وتبدي اهتمام وتوقّع" : "التوثيق اترفض — ارفع الصور تاني", reason ?? undefined],
    en: [approve ? "Your ID is verified — you can list, register interest and sign" : "ID verification was rejected — please upload again", reason ?? undefined],
    link: `/account#kyc`,
  });
  revalidatePath(`/${loc(locale)}/broker`);
}

/** طلبات الخدمة: الحالة (الوسيط أو المندوب المسند) والإسناد (الوسيط) — 5.7 */
export async function updateServiceRequest(locale: string, id: string, form: FormData) {
  const user = await requireUser(loc(locale), back(locale, "services"));
  const before = await db.serviceRequest.findUnique({ where: { id } });
  if (!before) return;
  const status = String(form.get("status")) as ServiceRequestStatus;
  const assignedToId = form.has("assignedToId") ? String(form.get("assignedToId") ?? "") || null : before.assignedToId;
  const sr = { requesterId: before.requesterId, assignedToId: before.assignedToId };
  const b = user.role === "AGENT" ? `/${loc(locale)}/agent` : back(locale, "services");
  await authorize(user, "service.update", { serviceRequest: sr }, { back: b, reason: overrideReason(form) });
  if (assignedToId !== before.assignedToId) await authorize(user, "service.assign", { serviceRequest: sr }, { back: b, reason: overrideReason(form) });
  await db.serviceRequest.update({ where: { id }, data: { status, assignedToId } });
  await audit(user.id, "service_request.update", "ServiceRequest", id, { before: { status: before.status, assignedToId: before.assignedToId }, after: { status, assignedToId } });
  if (assignedToId && assignedToId !== before.assignedToId && assignedToId !== user.id) {
    await notify([assignedToId, before.assignedToId], {
      kind: "service_request.assigned",
      ar: [`اتسند لك طلب خدمة: ${before.contactName}`],
      en: [`A service request was assigned to you: ${before.contactName}`],
      link: `/agent`,
    });
  }
  revalidatePath(b);
}

/**
 * MKT-03: طلب تقييم → عرض مسودة بضغطة: صاحب الطلب بيوصله رابط «اعرض قطعتك» متملي بالمدينة والحي والمساحة
 * (لو عنده حساب بيوصله إشعار، ولو لأ الوسيط بيبعت الرابط على واتساب).
 */
export async function convertValuation(locale: string, id: string) {
  const l = loc(locale);
  const b = back(l, "services");
  const user = await requireUser(l, b);
  const sr = await db.serviceRequest.findUnique({ where: { id } });
  if (!sr || sr.type !== "VALUATION") return;
  await authorize(user, "service.update", { serviceRequest: { requesterId: sr.requesterId, assignedToId: sr.assignedToId } }, { back: b });
  const link = `/list-your-plot?from=${sr.id}`;
  await db.serviceRequest.update({ where: { id }, data: { status: "IN_PROGRESS", assignedToId: sr.assignedToId ?? user.id } });
  await audit(user.id, "valuation.converted", "ServiceRequest", id, { link });
  await notify([sr.requesterId], {
    kind: "valuation.ready",
    ar: ["جهّزنا لك عرض قطعتك", "البيانات اللي بعتها اتملت — كمّل السعر والمستندات."],
    en: ["Your plot listing is ready to finish", "The details you sent are filled in — add the price and documents."],
    link,
  });
  revalidatePath(`/${l}/broker`);
  redirect(`${b}&converted=${id}`);
}

/** الأدمن / مسؤول الوسطاء: تغيير وسيط العرض (القسم 8) */
export async function assignListingBroker(locale: string, listingId: string, form: FormData) {
  const user = await requireUser(loc(locale), back(locale));
  const l = await loadListing(listingId);
  if (!l) return;
  await authorize(user, "listing.assign", { listing: listingCtx(l) }, { back: back(locale), reason: overrideReason(form) });
  const brokerId = String(form.get("brokerId") ?? "") || null;
  if (brokerId && [l.sellerId, l.submittedById].includes(brokerId)) redirect(`${back(locale)}&err=conflict`);
  await db.listing.update({ where: { id: listingId }, data: { assignedBrokerId: brokerId } });
  await audit(user.id, "listing.assign_broker", "Listing", listingId, { before: l.assignedBrokerId, after: brokerId });
  await notify([brokerId, l.assignedBrokerId], {
    kind: "listing.assignment",
    ar: ["إسناد عرض اتغيّر", `${CITY[l.plot.city][0]} — ${districtName(l.plot, "ar")}`],
    en: ["A listing assignment changed", `${CITY[l.plot.city][1]} — ${districtName(l.plot, "en")}`],
    link: `/broker?tab=queue`,
  });
  revalidatePath(`/${loc(locale)}/broker`);
}
