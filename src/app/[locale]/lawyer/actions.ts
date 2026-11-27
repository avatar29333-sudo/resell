"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requireUser } from "@/lib/auth";
import { authorize, dealCtx, listingCtx, overrideReason } from "@/lib/authz";
import { isLocale } from "@/i18n/config";
import { notify } from "@/lib/notifications";
import { DOC_TYPE } from "@/lib/labels";
import { checkReview } from "./review-rules";
import { CHECKLISTS } from "./checklists";

/** مراجعة مستند (SEC-02): الاعتماد بكل البنود بس، والرفض/التعديل بملاحظة ≥ 10 حروف */
export async function reviewDocument(locale: string, documentId: string, form: FormData) {
  const l = isLocale(locale) ? locale : "ar";
  const back = `/${l}/lawyer`;
  const user = await requireUser(l, back, ["LAWYER", "ADMIN"]);
  const doc = await db.document.findUnique({
    where: { id: documentId },
    include: {
      listing: { include: { documents: { select: { type: true, status: true } }, deals: { select: { stage: true, status: true } } } },
      deal: { include: { listing: true, contracts: { select: { type: true, status: true } }, documents: { select: { type: true, status: true } } } },
    },
  });
  if (!doc || !["UPLOADED", "IN_REVIEW"].includes(doc.status)) return;
  await authorize(
    user,
    "document.review",
    {
      document: { type: doc.type, ownerId: doc.ownerId, uploadedById: doc.uploadedById, status: doc.status },
      listing: doc.listing ? listingCtx(doc.listing) : doc.deal ? listingCtx({ ...doc.deal.listing, documents: [] }) : undefined,
      deal: doc.deal ? dealCtx(doc.deal) : undefined,
    },
    { back, reason: overrideReason(form) },
  );

  const items = CHECKLISTS[doc.type] ?? CHECKLISTS.OTHER;
  const checklist = items.map((it) => ({ key: it.key, label: it.ar, passed: form.get(`c_${it.key}`) === "on" }));
  const raw = String(form.get("decision"));
  const decision = raw === "APPROVED" ? "APPROVED" : raw === "REJECTED" ? "REJECTED" : "CHANGES_REQUESTED";
  const notes = String(form.get("notes") ?? "").trim() || null;
  const problem = checkReview(decision, checklist, notes);
  if (problem) {
    await audit(user.id, "document.review_refused", "Document", documentId, { decision, problem });
    redirect(`${back}?err=${problem}#d-${documentId}`);
  }

  await db.review.create({ data: { documentId, lawyerId: user.id, checklist, decision, notes } });
  await db.document.update({ where: { id: documentId }, data: { status: decision === "APPROVED" ? "APPROVED" : "REJECTED" } });
  await audit(user.id, "document.review", "Document", documentId, { decision, before: doc.status, after: decision === "APPROVED" ? "APPROVED" : "REJECTED" });
  const t = DOC_TYPE[doc.type] ?? ["مستند", "Document"];
  if (decision !== "APPROVED") {
    await notify([doc.ownerId], {
      kind: "document.rejected",
      ar: [`المحامي طلب نسخة جديدة من ${t[0]}`, notes ?? "ارفع النسخة الجديدة من حسابك."],
      en: [`The lawyer asked for a new version of the ${t[1]}`, notes ?? "Upload the new version from your account."],
      link: doc.dealId ? `/deals/${doc.dealId}` : `/account`,
    });
  }
  // الإشعار للوسيط المسند بس (مش لكل الوسطاء)
  const brokerId = doc.listing?.assignedBrokerId ?? doc.deal?.brokerId ?? null;
  await notify([brokerId], {
    kind: decision === "APPROVED" ? "document.approved" : "document.rejected_broker",
    ar: [decision === "APPROVED" ? `المحامي اعتمد ${t[0]}` : `المحامي رفض ${t[0]}`],
    en: [decision === "APPROVED" ? `Lawyer approved the ${t[1]}` : `Lawyer rejected the ${t[1]}`],
    link: doc.dealId ? `/deals/${doc.dealId}` : `/broker?tab=queue`,
  });
  revalidatePath(back);
}
