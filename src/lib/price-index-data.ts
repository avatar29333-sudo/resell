import "server-only";
import { db } from "./db";
import { isDemoMode } from "./demo";
import { getSetting } from "./settings";
import { toNum } from "./format";
import { computeIndex, dealPriceEgp, type ClosedDeal } from "./price-index";

/**
 * DATA-04 — الصفقات المقفولة من قاعدة البيانات. بيانات التجربة (isDemo) بتدخل بس لو DEMO_MODE شغال.
 * from/to اختياري عشان التقارير تحسب نفس الفترة.
 */
export async function loadIndex(opts: { from?: Date; to?: Date } = {}) {
  const [{ minDeals }, rows] = await Promise.all([
    getSetting("priceIndex"),
    db.deal.findMany({
      where: {
        status: "COMPLETED",
        agreedPrice: { not: null },
        ...(isDemoMode() ? {} : { isDemo: false }),
        ...(opts.from || opts.to ? { closedAt: { ...(opts.from ? { gte: opts.from } : {}), ...(opts.to ? { lt: opts.to } : {}) } } : {}),
      },
      select: { closedAt: true, stageChangedAt: true, agreedPrice: true, agreedCurrency: true, lockedUsdEgpRate: true, listing: { select: { plot: { select: { city: true, areaSqm: true } } } } },
    }),
  ]);
  const deals: ClosedDeal[] = rows.map((r) => ({
    city: r.listing.plot.city,
    closedAt: r.closedAt ?? r.stageChangedAt,
    areaSqm: toNum(r.listing.plot.areaSqm),
    priceEgp: dealPriceEgp(toNum(r.agreedPrice), r.agreedCurrency, r.lockedUsdEgpRate ? toNum(r.lockedUsdEgpRate) : null),
  }));
  return { points: computeIndex(deals, minDeals), minDeals, total: deals.length };
}
