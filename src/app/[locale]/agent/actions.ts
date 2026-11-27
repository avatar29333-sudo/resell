"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requireUser } from "@/lib/auth";
import { authorize, dealCtx, overrideReason } from "@/lib/authz";
import { loadDealFor } from "@/lib/access";
import { fileFromForm, filesFromForm, saveFile } from "@/lib/storage";
import { authorityDocType, checkAuthorityUpdate, cleanGeo, type AuthorityStatus } from "@/lib/authority";
import { notify } from "@/lib/notifications";
import { isLocale } from "@/i18n/config";

const loc = (l: string) => (isLocale(l) ? l : "ar");
const page = (l: string) => `/${loc(l)}/agent`;

/** OPS-02: تقرير المعاينة — صور من الموبايل بمكانها ووقتها + تقدير نسبة التنفيذ */
export async function submitSiteReport(locale: string, requestId: string, form: FormData) {
  const l = loc(locale);
  const back = page(l);
  const user = await requireUser(l, back);
  const sr = await db.serviceRequest.findUnique({ where: { id: requestId } });
  if (!sr) redirect(back);
  await authorize(user, "service.site_report", { serviceRequest: { requesterId: sr!.requesterId, assignedToId: sr!.assignedToId } }, { back, reason: overrideReason(form) });

  const photos = await filesFromForm(form, "photos", 10);
  if (photos.error) redirect(`${back}?err=photo_${photos.error}#sr-${requestId}`);
  if (!photos.files.length) redirect(`${back}?err=photo_none#sr-${requestId}`);
  if (photos.files.some((f) => f.type === "application/pdf")) redirect(`${back}?err=photo_type#sr-${requestId}`);
  const estRaw = String(form.get("estimate") ?? "").trim();
  const estimate = estRaw === "" ? null : Number(estRaw);
  if (estimate !== null && (!Number.isInteger(estimate) || estimate < 0 || estimate > 100)) redirect(`${back}?err=estimate#sr-${requestId}`);
  const geo = cleanGeo(form.get("lat"), form.get("lng"), form.get("accuracy"), form.get("takenAt"));

  const ids: string[] = [];
  for (const f of photos.files) {
    const s = await saveFile(f.data, f.type);
    const d = await db.document.create({
      data: {
        type: "SITE_PHOTO",
        ownerId: sr!.requesterId ?? user.id,
        uploadedById: user.id,
        serviceRequestId: requestId,
        plotId: sr!.plotId,
        storageKey: s.key,
        sha256: s.sha256,
        sizeBytes: s.sizeBytes,
        fileName: f.name,
        mimeType: f.type,
        geoLat: geo.lat,
        geoLng: geo.lng,
        geoAccuracyM: geo.accuracy,
        takenAt: geo.takenAt,
      },
    });
    ids.push(d.id);
  }
  await db.serviceRequest.update({ where: { id: requestId }, data: { constructionEstimate: estimate, status: sr!.status === "NEW" || sr!.status === "CONTACTED" ? "IN_PROGRESS" : sr!.status } });
  // التقدير بيحدّث نسبة التنفيذ على القطعة لو الطلب مربوط بقطعة
  if (sr!.plotId && estimate !== null) {
    const plot = await db.plot.findUnique({ where: { id: sr!.plotId }, select: { constructionPercent: true } });
    await db.plot.update({ where: { id: sr!.plotId }, data: { constructionPercent: estimate } });
    await audit(user.id, "plot.construction_estimate", "Plot", sr!.plotId, { before: plot?.constructionPercent ?? null, after: estimate, serviceRequestId: requestId });
  }
  await audit(user.id, "service_request.site_report", "ServiceRequest", requestId, { photos: ids.length, estimate, gps: geo.lat !== null });
  await notify([sr!.requesterId], {
    kind: "service_request.site_report",
    ar: ["صور المعاينة وصلت", estimate !== null ? `تقدير نسبة التنفيذ: ${estimate}%` : undefined],
    en: ["Your site inspection photos are in", estimate !== null ? `Estimated construction: ${estimate}%` : undefined],
    link: `/account`,
  });
  revalidatePath(back);
  redirect(`${back}?ok=report#sr-${requestId}`);
}

/** OPS-02: حالة ملف التنازل في الجهاز (اتقدّم، مطلوب استيفاء، اتوافق، اترفض) مع الإيصال/الخطاب */
export async function updateAuthorityStatus(locale: string, dealId: string, form: FormData) {
  const l = loc(locale);
  const back = page(l);
  const user = await requireUser(l, back);
  const deal = await loadDealFor(user, dealId);
  if (!deal) redirect(`${back}?err=forbidden`);
  await authorize(user, "deal.authority_update", { deal: dealCtx(deal!) }, { back, reason: overrideReason(form) });

  const status = String(form.get("status") ?? "");
  const note = String(form.get("note") ?? "").trim().slice(0, 500);
  const f = await fileFromForm(form, "file");
  if ("error" in f && f.error) redirect(`${back}?err=file_${f.error}#deal-${dealId}`);
  const problem = checkAuthorityUpdate(status, !!f.file, note);
  if (problem) redirect(`${back}?err=authority_${problem}#deal-${dealId}`);
  const s = status as AuthorityStatus;

  let documentId: string | null = null;
  if (f.file) {
    const saved = await saveFile(f.file.data, f.file.type);
    const type = authorityDocType(s);
    const doc = await db.document.create({
      data: {
        type,
        ownerId: deal!.listing.sellerId,
        uploadedById: user.id,
        dealId,
        listingId: deal!.listingId,
        storageKey: saved.key,
        sha256: saved.sha256,
        sizeBytes: saved.sizeBytes,
        fileName: f.file.name,
        mimeType: f.file.type,
        // خطاب الموافقة بيروح للمحامي يعتمده قبل ما الصفقة تقفل
        status: type === "AUTHORITY_STATEMENT" ? "IN_REVIEW" : "UPLOADED",
      },
    });
    documentId = doc.id;
  }
  await db.deal.update({ where: { id: dealId }, data: { authorityStatus: s, authorityUpdatedAt: new Date() } });
  await db.dealEvent.create({ data: { dealId, type: "NOTE", actorId: user.id, data: { authorityStatus: s, note: note || null, documentId } } });
  await audit(user.id, "deal.authority_status", "Deal", dealId, { before: deal!.authorityStatus ?? null, after: s, documentId });

  const msg: Record<AuthorityStatus, [string, string]> = {
    SUBMITTED: ["ملف التنازل اتقدّم للجهاز", "The transfer file was submitted to the authority"],
    NEEDS_INFO: ["الجهاز طالب استيفاء أوراق", "The authority asked for more papers"],
    APPROVED: ["الجهاز وافق على التنازل", "The authority approved the transfer"],
    REJECTED: ["الجهاز رفض التنازل", "The authority refused the transfer"],
  };
  await notify([deal!.brokerId, ...(s === "APPROVED" || s === "REJECTED" ? [deal!.buyerId, deal!.listing.sellerId] : [])], {
    kind: "deal.authority_status",
    ar: [msg[s][0], note || undefined],
    en: [msg[s][1], note || undefined],
    link: `/deals/${dealId}`,
  });
  if (s === "APPROVED") {
    await notify([deal!.lawyerId], {
      kind: "documents.review_needed",
      ar: ["خطاب موافقة الجهاز مستني مراجعتك", `صفقة #${dealId.slice(-6).toUpperCase()}`],
      en: ["The authority approval letter is waiting for your review", `Deal #${dealId.slice(-6).toUpperCase()}`],
      link: `/lawyer`,
    });
  }
  revalidatePath(back);
  revalidatePath(`/${l}/deals/${dealId}`);
  redirect(`${back}?ok=authority#deal-${dealId}`);
}
