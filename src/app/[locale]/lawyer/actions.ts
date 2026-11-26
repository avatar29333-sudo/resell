"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requireUser } from "@/lib/auth";
import { isLocale } from "@/i18n/config";
import { CHECKLISTS } from "./checklists";
import { idsByRole, notify } from "@/lib/notifications";
import { DOC_TYPE } from "@/lib/labels";

export async function reviewDocument(locale: string, documentId: string, form: FormData) {
  const l = isLocale(locale) ? locale : "ar";
  const user = await requireUser(l, `/${l}/lawyer`, ["LAWYER", "ADMIN"]);
  const doc = await db.document.findUnique({ where: { id: documentId } });
  if (!doc || !["UPLOADED", "IN_REVIEW"].includes(doc.status)) return;

  const items = CHECKLISTS[doc.type] ?? CHECKLISTS.OTHER;
  const checklist = items.map((it) => ({ key: it.key, label: it.ar, passed: form.get(`c_${it.key}`) === "on" }));
  const raw = String(form.get("decision"));
  const decision = raw === "APPROVED" ? "APPROVED" : raw === "REJECTED" ? "REJECTED" : "CHANGES_REQUESTED";
  const notes = String(form.get("notes") ?? "").trim() || null;

  await db.review.create({ data: { documentId, lawyerId: user.id, checklist, decision, notes } });
  await db.document.update({ where: { id: documentId }, data: { status: decision === "APPROVED" ? "APPROVED" : "REJECTED" } });
  await audit(user.id, "document.review", "Document", documentId, { decision });
  const t = DOC_TYPE[doc.type] ?? ["مستند", "Document"];
  if (decision !== "APPROVED") {
    await notify([doc.ownerId], {
      kind: "document.rejected",
      ar: [`المحامي طلب نسخة جديدة من ${t[0]}`, notes ?? "ارفع النسخة الجديدة من حسابك."],
      en: [`The lawyer asked for a new version of the ${t[1]}`, notes ?? "Upload the new version from your account."],
      link: `/account`,
    });
  }
  if (doc.listingId) {
    await notify(await idsByRole("BROKER"), {
      kind: decision === "APPROVED" ? "document.approved" : "document.rejected_broker",
      ar: [decision === "APPROVED" ? `المحامي اعتمد ${t[0]}` : `المحامي رفض ${t[0]}`],
      en: [decision === "APPROVED" ? `Lawyer approved the ${t[1]}` : `Lawyer rejected the ${t[1]}`],
      link: `/broker?tab=queue`,
    });
  }
  revalidatePath(`/${l}/lawyer`);
}
