/** DATA-01 — اختيار السعر اللي بيتثبت (منطق نقي، متغطي باختبار) */
export type RateRow = { id: string; date: Date; createdAt: Date };

/** آخر سعر اتسجل لحد لحظة التوقيع — أي سعر بعدها ما يأثرش */
export function pickRateAt<T extends RateRow>(rows: T[], at: Date): T | null {
  const eligible = rows.filter((r) => r.createdAt <= at);
  eligible.sort((a, b) => b.date.getTime() - a.date.getTime() || b.createdAt.getTime() - a.createdAt.getTime());
  return eligible[0] ?? null;
}
