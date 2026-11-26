"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requireUser } from "@/lib/auth";
import { isLocale } from "@/i18n/config";

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
  redirect(`/${loc}/deals/${deal.id}?new=1`);
}
