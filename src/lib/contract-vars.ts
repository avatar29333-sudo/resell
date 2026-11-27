import "server-only";
import { db } from "./db";
import { getSetting } from "./settings";
import { toNum } from "./format";
import { CITY } from "./labels";
import { dealRef } from "./action-otp-core";
import type { LoadedDeal } from "./access";
import { allCities } from "./cities";
import { isDemoMode } from "./demo";
import { latestRate } from "./listing";

/** رقم القيد: الحقيقي من الإعدادات؛ في الوضع التجريبي بس بيتعبّى برقم تجريبي واضح (على الإنتاج العقد ما يتولدش من غيره) */
async function regNo() {
  const v = (await getSetting("brokerRegistrationNumber")).value;
  return v || (isDemoMode() ? "DEMO-0000 (تجريبي)" : "");
}

async function indicativeFx() {
  const r = await latestRate();
  return r ? `${toNum(r.sell).toFixed(2)} (استرشادي — يُثبت لحظة اكتمال التوقيع)` : "";
}

const n = (v: unknown) => (v == null ? "" : Number(String(v)).toLocaleString("en-US"));
const today = () => new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Cairo" }).format(new Date());

/** CON-01: بيانات الصفقة الحقيقية للتعبئة (اللي مش موجود بيفضل فاضي → المعاينة بتقول ناقص إيه) */
export async function dealVars(deal: LoadedDeal, version: number, viewerId?: string | null) {
  await allCities();
  const plot = deal.listing.plot;
  const round = plot.offeringRoundId ? await db.offeringRound.findUnique({ where: { id: plot.offeringRoundId }, select: { nameAr: true } }) : null;
  const dep = deal.deposits.find((d) => d.escrowStatus !== "REFUNDED_TO_BUYER") ?? deal.deposits[0];
  const reg = await regNo();
  // CON-01: قبل ما العمولة تتحسب (اتفاق العمولة بيتوقّع قبل السعر) → النسب الحالية من الإعدادات
  const rates = await getSetting("commission.rates");
  // PRIV-01: الطرف ما يشوفش اسم الطرف التاني ولا كود القطعة في نص العقد قبل موافقة صاحبها على الكشف
  const disclosed = (uid: string) => new Set((deal.disclosures ?? []).filter((x) => x.userId === uid && !x.revokedAt).flatMap((x) => x.fields));
  const isBuyer = viewerId === deal.buyerId;
  const isSeller = viewerId === deal.listing.sellerId;
  const sellerSees = disclosed(deal.listing.sellerId);
  const buyerSees = disclosed(deal.buyerId);
  const hiddenName = "(بيظهر بعد موافقة صاحبه على الكشف)";
  return {
    deal_ref: dealRef(deal.id),
    today: today(),
    template_version: `v${version}`,
    seller_name: isBuyer && !sellerSees.has("name") ? `البائع ${hiddenName}` : deal.listing.seller.name,
    buyer_name: isSeller && !buyerSees.has("name") ? `المشتري ${hiddenName}` : deal.buyer.name,
    plot_city: (CITY[plot.city] ?? [plot.city])[0],
    plot_district: plot.district,
    plot_round: round?.nameAr ?? "غير محدد",
    plot_code: isBuyer && !sellerSees.has("plotCode") ? "(بيظهر بعد موافقة البائع)" : plot.code,
    plot_area: n(plot.areaSqm),
    listing_price: n(deal.listing.price),
    agreed_price: deal.agreedPrice ? n(deal.agreedPrice) : "",
    deposit_amount: dep ? n(dep.amount) : "",
    // DEAL-01: قبل اكتمال التوقيع سعر اليوم «استرشادي» وبيتثبت لحظة اكتمال توقيع الطرفين
    fx_rate: deal.lockedUsdEgpRate ? toNum(deal.lockedUsdEgpRate).toFixed(2) : await indicativeFx(),
    commission_seller_pct: String(deal.commission ? toNum(deal.commission.sellerRatePct) : rates.sellerPct),
    commission_buyer_pct: String(deal.commission ? toNum(deal.commission.buyerRatePct) : rates.buyerPct),
    commission_seller_amount: deal.commission ? n(deal.commission.sellerAmount) : "",
    commission_buyer_amount: deal.commission ? n(deal.commission.buyerAmount) : "",
    broker_reg_no: reg,
  } as Record<string, string>;
}

/** نموذج غير مرتبط بصفقة (الشروط، تفويض العرض، الإنقاذ، الشريك) */
export async function userVars(user: { name: string; brokerRegNo?: string | null; partnerSharePct?: unknown }, version: number, extra: Record<string, string> = {}) {
  const rescue = await getSetting("rescue");
  return {
    today: today(),
    template_version: `v${version}`,
    user_name: user.name,
    seller_name: user.name,
    partner_reg_no: user.brokerRegNo ?? "",
    partner_share_pct: user.partnerSharePct != null ? String(Number(String(user.partnerSharePct))) : String((await getSetting("partner.defaultSharePct")).value),
    rescue_fee_pct: String(rescue.feePct),
    broker_reg_no: await regNo(),
    ...extra,
  } as Record<string, string>;
}

/** النسخة المنشورة لنوع عقد / مفتاح نموذج */
export function publishedFor(where: { contractType?: string; key?: string }) {
  return db.templateVersion.findFirst({
    where: { status: "PUBLISHED", template: where.key ? { key: where.key } : { contractType: where.contractType } },
    include: { template: true },
    orderBy: { version: "desc" },
  });
}
