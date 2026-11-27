/** OPS-01 — المطابقة الشهرية (منطق نقي، متغطي باختبار) */
export type DepositLite = { amount: number; heldAt: Date | null; settledAt: Date | null };

/** آخر لحظة في الشهر (بتوقيت UTC) — month = YYYY-MM */
export function monthEnd(month: string) {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 1) - 1);
}

/** إجمالي العرابين اللي كانت محفوظة في البنك آخر الشهر: اتحفظت قبله وما اتصرفتش/اتردتش لحد آخره */
export function heldTotalAt(deposits: DepositLite[], end: Date) {
  return deposits.filter((d) => d.heldAt && d.heldAt <= end && (!d.settledAt || d.settledAt > end)).reduce((s, d) => s + d.amount, 0);
}

export function reconcileDiff(systemTotal: number, bankTotal: number) {
  const diff = Math.round((bankTotal - systemTotal) * 100) / 100;
  return { diff, matched: diff === 0 };
}
