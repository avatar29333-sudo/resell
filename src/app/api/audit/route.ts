import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth";
import { can, subject } from "@/lib/authz";
import { auditWhere } from "@/lib/audit-query";
import { auditLabel } from "@/lib/audit-labels";

// UX-09: تصدير سجل التدقيق CSV بنفس الفلاتر (الأدمن الكل، والمالي أحداث الفلوس بس)
export const dynamic = "force-dynamic";

const cell = (v: unknown) => {
  const s = v === null || v === undefined ? "" : String(v);
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

export async function GET(req: Request) {
  const me = await getCurrentUser();
  if (!me || !(can(subject(me), "audit.view").allowed || can(subject(me), "audit.view_money").allowed)) return new Response("Forbidden", { status: 403 });
  const p = new URL(req.url).searchParams;
  const locale = p.get("locale") === "en" ? "en" : "ar";
  const f = { from: p.get("from") ?? undefined, to: p.get("to") ?? undefined, actor: p.get("actor") ?? undefined, group: p.get("group") ?? undefined, entity: p.get("entity") ?? undefined };
  const rows = await db.auditLog.findMany({ where: auditWhere(me, f), include: { actor: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 20000 });
  const head = ["time_utc", "who", "action", "description", "entity_type", "entity_id", "ip"];
  const lines = rows.map((r) => [r.createdAt.toISOString(), r.actor?.name ?? "", r.action, auditLabel(r.action, locale), r.entityType, r.entityId, r.ip ?? ""].map(cell).join(","));
  await audit(me.id, "audit.export", "AuditLog", "csv", { count: rows.length, ...f });
  return new Response("﻿" + [head.join(","), ...lines].join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="audit-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
