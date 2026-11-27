"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requireUser } from "@/lib/auth";
import { authorize, listingCtx } from "@/lib/authz";
import { leastLoaded } from "@/lib/assign";
import { isLocale } from "@/i18n/config";
import { notify } from "@/lib/notifications";
import { readAttribution } from "@/lib/attribution";

/** المشتري بيبدي اهتمام → صفقة جديدة في مرحلة «اهتمام» مع وسيط العرض (5.4 + القسم 8) */
export async function expressInterest(locale: string, listingId: string) {
  const loc = isLocale(locale) ? locale : "ar";
  const back = `/${loc}/listings/${listingId}`;
  const user = await requireUser(loc, back);
  const listing = await db.listing.findUnique({ where: { id: listingId }, include: { documents: { select: { type: true, status: true } }, deals: { select: { stage: true, status: true } } } });
  if (!listing) redirect(back);
  // موثّق + مش صاحب العرض + العرض منشور
  await authorize(user, "deal.create", { listing: listingCtx(listing!) }, { back });

  const existing = await db.deal.findFirst({ where: { listingId, buyerId: user.id, status: { in: ["ACTIVE", "ON_HOLD"] } } });
  if (existing) redirect(`/${loc}/deals/${existing.id}`);

  // وسيط الصفقة = وسيط العرض افتراضياً، أو أقل وسيط عنده شغل (مش طرف)
  const brokerId = listing!.assignedBrokerId ?? (await leastLoaded("BROKER", [user.id, listing!.sellerId]));
  const source = await readAttribution(); // MKT-10
  const deal = await db.deal.create({
    data: {
      ...(source ? { source } : {}),
      listingId,
      buyerId: user.id,
      brokerId,
      lawyerId: listing!.assignedLawyerId,
      events: { create: { type: "CREATED", toStage: "INTEREST", actorId: user.id } },
    },
  });
  await audit(user.id, "deal.create", "Deal", deal.id, { listingId, brokerId });
  await notify([brokerId], {
    kind: "deal.new_interest",
    ar: ["مشتري جديد مهتم بقطعة مسندة ليك", "جهّز اتفاق العمولة."],
    en: ["A new buyer is interested in a plot assigned to you", "Prepare the commission agreement."],
    link: `/deals/${deal.id}`,
  });
  await notify([listing!.sellerId], {
    kind: "listing.interest",
    ar: ["فيه مشتري مهتم بقطعتك", "الوسيط هيتابع معاه، واسمه بيظهر لك بعد توقيع اتفاق العمولة."],
    en: ["A buyer is interested in your plot", "The broker will follow up; their name appears after the commission agreement is signed."],
    link: `/account`,
  });
  redirect(`/${loc}/deals/${deal.id}?new=1`);
}
