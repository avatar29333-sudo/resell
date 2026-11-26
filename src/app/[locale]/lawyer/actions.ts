"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requireUser } from "@/lib/auth";
import { isLocale } from "@/i18n/config";
import { CHECKLISTS } from "./checklists";

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
  revalidatePath(`/${l}/lawyer`);
}
