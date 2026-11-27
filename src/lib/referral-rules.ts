/** MKT-06 — مكافأة الإحالة (منطق نقي، متغطي باختبار) */
export type RewardSetting = { type: "pct" | "fixed"; value: number };

type Party = { id: string; phone: string; referredById: string | null };

/**
 * المكافأة بتستحق بس لما صفقة المُحال تتقفل. المُحال ممكن يكون المشتري أو البائع (الأولوية للمشتري).
 * ممنوع: الإحالة الذاتية (نفس الرقم)، وإن صاحب الإحالة يكون هو نفسه الطرف التاني في نفس الصفقة.
 */
export function referralReward(
  deal: { buyer: Party; seller: Party; commissionTotal: number },
  referrers: Record<string, { id: string; phone: string; status: string }>,
  setting: RewardSetting,
): { referrerId: string; referredId: string; amount: number } | null {
  for (const referred of [deal.buyer, deal.seller]) {
    const r = referred.referredById ? referrers[referred.referredById] : null;
    if (!r || r.status !== "ACTIVE") continue;
    if (r.phone === referred.phone) continue; // إحالة ذاتية
    if (r.id === deal.buyer.id || r.id === deal.seller.id) continue; // صاحب الإحالة طرف في الصفقة
    const amount = setting.type === "pct" ? Math.round((deal.commissionTotal * setting.value) / 100) : Math.round(setting.value);
    if (!(amount > 0)) return null;
    return { referrerId: r.id, referredId: referred.id, amount };
  }
  return null;
}
