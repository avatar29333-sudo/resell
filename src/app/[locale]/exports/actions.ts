"use server";

import { after } from "next/server";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requireRecentAuth, requireUser } from "@/lib/auth";
import { authorize, dealCtx } from "@/lib/authz";
import { loadDealFor } from "@/lib/access";
import { runExport } from "@/lib/export";
import { EXPORT_REASONS } from "@/lib/export-core";
import { isLocale } from "@/i18n/config";

/**
 * ADM-EXP-03: طلب تصدير — للأدمن (والمحامي لصفقته المسندة)، بتأكيد هوية جديد بالكود + سبب إجباري،
 * والتنفيذ في الخلفية؛ لما يخلص بيوصل تنبيه بالرابط وتنبيه منفصل بكلمة السر.
 */
export async function requestExport(locale: string, kind: "DEAL" | "USER", subjectId: string, form: FormData) {
  const l = isLocale(locale) ? locale : "ar";
  const back = kind === "DEAL" ? `/${l}/deals/${subjectId}` : `/${l}/settings/users/${subjectId}`;
  const user = await requireUser(l, back);
  if (kind === "DEAL") {
    const deal = await loadDealFor(user, subjectId);
    if (!deal) redirect(`/${l}/account?denied=1`);
    await authorize(user, "export.deal", { deal: dealCtx(deal!) }, { back, reason: "export" });
  } else {
    await authorize(user, "export.user", {}, { back, reason: "export" });
  }
  await requireRecentAuth(user, l, back);
  const reason = String(form.get("reason") ?? "");
  const note = String(form.get("reasonNote") ?? "").trim().slice(0, 300);
  if (!(EXPORT_REASONS as readonly string[]).includes(reason) || (reason === "other" && note.length < 10)) redirect(`${back}?err=export_reason#export`);
  const job = await db.exportJob.create({ data: { kind, subjectId, reason, reasonNote: note || null, requestedById: user.id } });
  await audit(user.id, `export.${kind.toLowerCase()}.requested`, kind === "DEAL" ? "Deal" : "User", subjectId, { jobId: job.id, reason, note: note || undefined });
  after(() => runExport(job.id));
  redirect(`${back}?ok=export#export`);
}
