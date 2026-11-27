"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requireUser } from "@/lib/auth";
import { extractVariables, sha256 } from "@/lib/templates";
import { isLocale } from "@/i18n/config";

const loc = (l: string) => (isLocale(l) ? l : "ar");
const back = (l: string, key: string, q = "") => `/${loc(l)}/templates?t=${key}${q}`;

/** CON-01: أي تعديل = نسخة DRAFT جديدة (المعتمد/المنشور ما بيتعدّلش) */
export async function createDraft(locale: string, templateId: string, form: FormData) {
  const l = loc(locale);
  const me = await requireUser(l, `/${l}/templates`, ["ADMIN", "LAWYER"]);
  const tpl = await db.contractTemplate.findUnique({ where: { id: templateId } });
  if (!tpl) redirect(`/${l}/templates`);
  const body = String(form.get("body") ?? "").replace(/\r\n/g, "\n").trim();
  const note = String(form.get("changeNote") ?? "").trim().slice(0, 500);
  if (body.length < 50 || note.length < 5) redirect(back(l, tpl!.key, "&err=draft"));
  const last = await db.templateVersion.findFirst({ where: { templateId }, orderBy: { version: "desc" } });
  const v = await db.templateVersion.create({
    data: { templateId, version: (last?.version ?? 0) + 1, bodyMarkdown: body, variables: extractVariables(body), sha256: sha256(body), changeNote: note, createdById: me.id },
  });
  await audit(me.id, "template.draft", "TemplateVersion", v.id, { key: tpl!.key, version: v.version, note });
  revalidatePath(`/${l}/templates`);
  redirect(back(l, tpl!.key, `&v=${v.version}`));
}

/** اعتماد المحامي (المحامي بس — فصل مهام: الأدمن ما يعتمدش، المحامي ما ينشرش) */
export async function approveVersion(locale: string, versionId: string) {
  const l = loc(locale);
  const me = await requireUser(l, `/${l}/templates`, ["LAWYER"]);
  const v = await db.templateVersion.findUnique({ where: { id: versionId }, include: { template: true } });
  if (!v || v.status !== "DRAFT") redirect(`/${l}/templates`);
  await db.templateVersion.update({ where: { id: versionId }, data: { status: "LAWYER_APPROVED", approvedByLawyerId: me.id, approvedAt: new Date() } });
  await audit(me.id, "template.lawyer_approved", "TemplateVersion", versionId, { key: v!.template.key, version: v!.version });
  revalidatePath(`/${l}/templates`);
  redirect(back(l, v!.template.key, `&v=${v!.version}`));
}

/** النشر (الأدمن بس، وبعد اعتماد المحامي). النسخة المنشورة القديمة بتتقاعد، والعقود القديمة بتفضل على نسختها */
export async function publishVersion(locale: string, versionId: string) {
  const l = loc(locale);
  const me = await requireUser(l, `/${l}/templates`, ["ADMIN"]);
  const v = await db.templateVersion.findUnique({ where: { id: versionId }, include: { template: true } });
  if (!v || v.status !== "LAWYER_APPROVED") redirect(`/${l}/templates?err=publish`);
  await db.$transaction([
    db.templateVersion.updateMany({ where: { templateId: v!.templateId, status: "PUBLISHED" }, data: { status: "RETIRED" } }),
    db.templateVersion.update({ where: { id: versionId }, data: { status: "PUBLISHED", publishedById: me.id, publishedAt: new Date() } }),
  ]);
  await audit(me.id, "template.published", "TemplateVersion", versionId, { key: v!.template.key, version: v!.version });
  revalidatePath(`/${l}/templates`);
  redirect(back(l, v!.template.key, `&v=${v!.version}&ok=published`));
}
