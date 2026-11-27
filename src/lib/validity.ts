/** DATA-03 — صلاحية المستندات (منطق نقي، متغطي باختبار) */
const DAY = 86_400_000;

export type ValidityState = "ok" | "warn" | "expired";

/** حالة مستند ليه تاريخ انتهاء: سليم، هيخلص خلال فترة التنبيه، أو خلص */
export function validityState(expiresAt: Date | null | undefined, now: Date, warnDays: number): ValidityState {
  if (!expiresAt) return "ok";
  if (expiresAt.getTime() < now.getTime()) return "expired";
  if (expiresAt.getTime() - now.getTime() <= warnDays * DAY) return "warn";
  return "ok";
}

/** تاريخ انتهاء إفادة الجهاز: عدد شهور (إعداد) من تاريخها */
export function statementExpiry(from: Date, months: number) {
  const d = new Date(from);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d;
}
