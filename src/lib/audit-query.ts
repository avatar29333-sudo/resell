import "server-only";
import type { Prisma, User } from "@prisma/client";
import { scopeAuditFor } from "./authz/scope";

/** UX-09: فلاتر سجل التدقيق (التاريخ، المستخدم، المجموعة، النوع) — نفس الشروط للصفحة وللتصدير */
export type AuditFilter = { from?: string; to?: string; actor?: string; group?: string; entity?: string };

export function auditWhere(me: User, f: AuditFilter): Prisma.AuditLogWhereInput {
  const day = (s?: string) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T00:00:00+02:00`) : null);
  const from = day(f.from);
  const to = day(f.to);
  if (to) to.setUTCDate(to.getUTCDate() + 1); // لحد آخر اليوم
  const actor = f.actor?.trim();
  return {
    AND: [
      scopeAuditFor(me),
      f.entity ? { entityType: f.entity } : {},
      f.group ? { action: { startsWith: `${f.group}.` } } : {},
      from || to ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lt: to } : {}) } } : {},
      actor
        ? actor === "system"
          ? { actorId: null }
          : { actor: { OR: [{ name: { contains: actor, mode: "insensitive" } }, { phone: { contains: actor } }, { email: { contains: actor, mode: "insensitive" } }] } }
        : {},
    ],
  };
}
