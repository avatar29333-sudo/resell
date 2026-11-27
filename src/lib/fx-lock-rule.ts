/**
 * DEAL-01 — قفل سعر الصرف (منطق نقي، متغطي باختبار):
 * بيحصل مرة واحدة بس، لحظة اكتمال توقيع الطرفين على العقد الابتدائي (نموذج 3 → SIGNED).
 * قبل كده السعر «استرشادي». بيتخزن: القيمة + وقت القفل + id السجل + المصدر.
 */
export type RateRow = { id: string; sell: number; source: string };

export function fxLockUpdate(i: { contractType: string; signingComplete: boolean; alreadyLockedAt: Date | null; rate: RateRow | null; now: Date }) {
  if (i.contractType !== "PRELIMINARY_CONTRACT" || !i.signingComplete || i.alreadyLockedAt || !i.rate) return null;
  return { lockedUsdEgpRate: i.rate.sell, exchangeRateId: i.rate.id, rateLockedAt: i.now, fxSource: i.rate.source };
}
