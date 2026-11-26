import "server-only";
import { headers } from "next/headers";
import type { Prisma } from "@prisma/client";
import { db } from "./db";

/** كل فعل حساس بيتسجل هنا: مين، عمل إيه، على إيه، امتى، منين */
export async function audit(
  actorId: string | null,
  action: string,
  entityType: string,
  entityId: string,
  data?: Prisma.InputJsonValue,
) {
  let ip: string | null = null;
  let userAgent: string | null = null;
  try {
    const h = await headers();
    ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip");
    userAgent = h.get("user-agent");
  } catch {
    // برّه طلب HTTP (زي السكريبتات)
  }
  await db.auditLog.create({ data: { actorId, action, entityType, entityId, ip, userAgent, data } });
}
