// PERM-03 — إخفاء الحقول حسب الدور والمرحلة (القسم 4 و 5.1) قبل ما البيانات توصل للواجهة.
// من غير قاعدة بيانات عشان يتختبر لوحده.
import type { Role } from "./policy";

export type Viewer = { id: string; role: Role } | null;

/** موبايل مخفي: +20 10•• ••• •123 */
export function maskedPhone(phone: string) {
  if (phone.length < 8) return "•••";
  return `${phone.slice(0, 3)} ${phone.slice(3, 5)}•• ••• •${phone.slice(-3)}`;
}

/**
 * رقم موبايل عميل: الطرف التاني في الصفقة عمره ما يشوفه (التواصل عن طريق الوسيط).
 * الفريق يشوفه كامل لو العميل في شغله المسند، والمالي مخفي دايماً.
 */
export function phoneFor(
  viewer: Viewer,
  target: { id: string; phone: string },
  rel: { assignedToViewer?: boolean; kycQueue?: boolean; partnerClient?: boolean } = {},
): string {
  if (!viewer) return maskedPhone(target.phone);
  if (viewer.id === target.id || viewer.role === "ADMIN") return target.phone;
  if (viewer.role === "FINANCE") return maskedPhone(target.phone);
  if ((viewer.role === "BROKER" || viewer.role === "BROKER_LEAD") && (rel.assignedToViewer || rel.kycQueue)) return target.phone;
  if ((viewer.role === "LAWYER" || viewer.role === "AGENT") && rel.assignedToViewer) return target.phone;
  if (viewer.role === "PARTNER_BROKER" && rel.partnerClient) return target.phone;
  return maskedPhone(target.phone);
}

/** اسم الطرف التاني: من مرحلة ٢ بعد توقيع الطرفين على اتفاق العمولة، وبيتقفل لو الصفقة اتلغت */
export function partyNameVisible(opts: { viewerIsParty: boolean; commissionSigned: boolean; dealOpen: boolean }) {
  if (!opts.viewerIsParty) return true; // الفريق
  return opts.commissionSigned && opts.dealOpen;
}

export const HIDDEN = "•••";
