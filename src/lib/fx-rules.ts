/** OPS-04 — تحقق السعر اليدوي (منطق نقي، متغطي باختبار) */
export function checkManualRate(i: { buy: number; sell: number; lastAutoSell: number | null; maxDeviationPct: number; confirmed: boolean }): "rate_invalid" | "rate_deviation" | null {
  if (!(i.buy > 0) || !(i.sell > 0) || i.sell < i.buy) return "rate_invalid";
  if (i.lastAutoSell && !i.confirmed) {
    const dev = (Math.abs(i.sell - i.lastAutoSell) / i.lastAutoSell) * 100;
    if (dev > i.maxDeviationPct) return "rate_deviation";
  }
  return null;
}
