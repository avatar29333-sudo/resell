import "server-only";
import { randomInt } from "node:crypto";
import type { User } from "@prisma/client";
import { db } from "./db";

const ALPHA = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // من غير حروف بتتلخبط (O/0, I/1)

/** MKT-06: كود إحالة لكل مستخدم موثّق (بيتعمل أول مرة يتطلب) */
export async function ensureReferralCode(user: Pick<User, "id" | "referralCode" | "accountLevel" | "status">) {
  if (user.referralCode) return user.referralCode;
  if (user.accountLevel !== "VERIFIED" || user.status !== "ACTIVE") return null;
  for (let i = 0; i < 6; i++) {
    const code = Array.from({ length: 6 }, () => ALPHA[randomInt(ALPHA.length)]).join("");
    try {
      const r = await db.user.updateMany({ where: { id: user.id, referralCode: null }, data: { referralCode: code } });
      if (r.count) return code;
      const now = await db.user.findUnique({ where: { id: user.id }, select: { referralCode: true } });
      if (now?.referralCode) return now.referralCode;
    } catch {
      const again = await db.user.findUnique({ where: { id: user.id }, select: { referralCode: true } });
      if (again?.referralCode) return again.referralCode;
    }
  }
  return null;
}
