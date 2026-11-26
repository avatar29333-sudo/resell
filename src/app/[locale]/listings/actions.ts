"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requireUser } from "@/lib/auth";
import { isLocale } from "@/i18n/config";
import { notify } from "@/lib/notifications";

/** المشتري بيبدي اهتمام → صفقة جديدة في مرحلة «اهتمام» مع وسيط */
export async function expressInterest(locale: string, listingId: string) {
  const loc = isLocale(locale) ? locale : "ar";
  const user = await requireUser(loc, `/${loc}/listings/${listingId}`);
  const listing = await db.listing.findUnique({ where: { id: listingId } });
  if (!listing || listing.status !== "PUBLISHED" || listing.sellerId === user.id) redirect(`/${loc}/listings/${listingId}`);

  const existing = await db.deal.findFirst({
    where: { listingId, buyerId: user.id, status: { in: ["ACTIVE", "ON_HOLD"] } },
  });
  if (existing) redirect(`/${loc}/deals/${existing.id}`);

  // الوسيط اللي عليه أقل صفقات شغالة
  const brokers = await db.user.findMany({
    where: { role: "BROKER" },
    include: { _count: { select: { dealsAsBroker: { where: { status: "ACTIVE" } } } } },
  });
  brokers.sort((a, b) => a._count.dealsAsBroker - b._count.dealsAsBroker);

  const deal = await db.deal.create({
    data: {
      listingId,
      buyerId: user.id,
      brokerId: brokers[0]?.id,
      events: { create: { type: "CREATED", toStage: "INTEREST", actorId: user.id } },
    },
  });
  await audit(user.id, "deal.create", "Deal", deal.id, { listingId });
  await notify([deal.brokerId], {
    kind: "deal.new_interest",
    ar: [`مشتري جديد مهتم: ${user.name}`, "كلّمه لاتفاق العمولة."],
    en: [`New interested buyer: ${user.name}`, "Contact them about the commission agreement."],
    link: `/deals/${deal.id}`,
  });
  await notify([listing!.sellerId], {
    kind: "listing.interest",
    ar: ["فيه مشتري مهتم بقطعتك", "الوسيط هيتابع معاه، وبياناته بتظهر لك بعد اتفاق العمولة."],
    en: ["A buyer is interested in your plot", "The broker will follow up; their details appear after the commission agreement."],
    link: `/account`,
  });
  redirect(`/${loc}/deals/${deal.id}?new=1`);
}
