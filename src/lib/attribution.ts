import "server-only";
import { cookies } from "next/headers";
import type { Prisma } from "@prisma/client";
import { FT_COOKIE, LT_COOKIE, REF_COOKIE, decodeTouch, sourceOf } from "./attribution-core";

/** MKT-10: المصدر من الكوكيز (بيتخزن مع المستخدم / الطلب / الصفقة) */
export async function readAttribution(): Promise<Prisma.InputJsonValue | null> {
  try {
    const c = await cookies();
    return sourceOf(decodeTouch(c.get(FT_COOKIE)?.value), decodeTouch(c.get(LT_COOKIE)?.value)) as Prisma.InputJsonValue | null;
  } catch {
    return null;
  }
}

/** MKT-06: كود الإحالة اللي الزائر جه بيه (آخر 60 يوم) */
export async function readReferralCode(): Promise<string | null> {
  try {
    const v = (await cookies()).get(REF_COOKIE)?.value;
    return v && /^[A-Z0-9]{4,24}$/.test(v) ? v : null;
  } catch {
    return null;
  }
}
