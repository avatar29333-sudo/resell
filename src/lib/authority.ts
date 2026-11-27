/** OPS-02 — حالة ملف التنازل في الجهاز (منطق نقي، متغطي باختبار) */
export const AUTHORITY_STATUSES = ["SUBMITTED", "NEEDS_INFO", "APPROVED", "REJECTED"] as const;
export type AuthorityStatus = (typeof AUTHORITY_STATUSES)[number];

/** نوع المستند اللي بيترفع مع كل حالة: إيصال التقديم، أو خطاب الموافقة، أو أي ورقة تانية */
export function authorityDocType(s: AuthorityStatus) {
  return s === "SUBMITTED" ? "FILING_RECEIPT" : s === "APPROVED" ? "AUTHORITY_STATEMENT" : "OTHER";
}

/** «اتقدّم» لازم معاه الإيصال، و«اتوافق» لازم معاه الخطاب، والاستيفاء/الرفض لازم ملاحظة */
export function checkAuthorityUpdate(s: string, hasFile: boolean, note: string): null | "status" | "file" | "note" {
  if (!(AUTHORITY_STATUSES as readonly string[]).includes(s)) return "status";
  if ((s === "SUBMITTED" || s === "APPROVED") && !hasFile) return "file";
  if ((s === "NEEDS_INFO" || s === "REJECTED") && note.trim().length < 10) return "note";
  return null;
}

/** صورة الموقع: الإحداثيات منطقية والوقت مش في المستقبل */
export function cleanGeo(lat: unknown, lng: unknown, acc: unknown, takenAt: unknown, now = new Date()) {
  const la = Number(lat);
  const ln = Number(lng);
  const ok = Number.isFinite(la) && Number.isFinite(ln) && Math.abs(la) <= 90 && Math.abs(ln) <= 180 && !(la === 0 && ln === 0);
  const t = takenAt ? new Date(String(takenAt)) : null;
  return {
    lat: ok ? la : null,
    lng: ok ? ln : null,
    accuracy: ok && Number.isFinite(Number(acc)) ? Math.max(0, Number(acc)) : null,
    takenAt: t && !Number.isNaN(t.getTime()) && t <= new Date(now.getTime() + 5 * 60_000) ? t : now,
  };
}
