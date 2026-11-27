import "server-only";
import type { Role } from "@prisma/client";
import { db } from "./db";

/**
 * PERM-04 — التوزيع الأوتوماتيكي: أقل واحد عنده شغل شغال في الدور ده.
 * exclude = ناس ما ينفعش يتسندوا (أطراف الصفقة — فصل المهام 7.2).
 */
export async function leastLoaded(role: Extract<Role, "BROKER" | "LAWYER" | "AGENT">, exclude: string[] = []) {
  const people = await db.user.findMany({
    where: { role, status: "ACTIVE", anonymizedAt: null, id: { notIn: exclude } },
    select: {
      id: true,
      _count: {
        select: {
          dealsAsBroker: { where: { status: { in: ["ACTIVE", "ON_HOLD"] } } },
          dealsAsLawyer: { where: { status: { in: ["ACTIVE", "ON_HOLD"] } } },
          dealsAsAgent: { where: { status: { in: ["ACTIVE", "ON_HOLD"] } } },
          assignedListingsBroker: { where: { status: { in: ["DRAFT", "IN_REVIEW", "VERIFIED", "PUBLISHED"] } } },
          assignedListingsLawyer: { where: { status: { in: ["IN_REVIEW", "VERIFIED"] } } },
        },
      },
    },
  });
  const load = (p: (typeof people)[number]) =>
    role === "BROKER"
      ? p._count.dealsAsBroker + p._count.assignedListingsBroker
      : role === "LAWYER"
        ? p._count.dealsAsLawyer + p._count.assignedListingsLawyer
        : p._count.dealsAsAgent;
  people.sort((a, b) => load(a) - load(b) || a.id.localeCompare(b.id));
  return people[0]?.id ?? null;
}
