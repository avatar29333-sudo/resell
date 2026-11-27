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
import { classifyIdentifier } from "@/lib/identifier";
import { queueMessage } from "@/lib/outbox";
import { siteUrl } from "@/lib/meta";

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
  // REL-03: تعارض مصالح — وسيط العرض لو هو نفسه المشتري (موظف كعميل) ما يتسندش لصفقته، ويتسجل
  const conflict = listing!.assignedBrokerId === user.id;
  const brokerId = listing!.assignedBrokerId && !conflict ? listing!.assignedBrokerId : await leastLoaded("BROKER", [user.id, listing!.sellerId]);
  if (conflict) await audit(user.id, "conflict.avoided", "Listing", listingId, { role: "BROKER", reassignedTo: brokerId });
  const source = await readAttribution(); // MKT-10
  // PUB-03: لو شريك أحال المشتري ده على العرض ده → بيتسجل على الصفقة
  const referral = await db.partnerReferral.findUnique({ where: { listingId_buyerId: { listingId, buyerId: user.id } } });
  const deal = await db.deal.create({
    data: {
      ...(source ? { source } : {}),
      ...(referral ? { referredByPartnerId: referral.partnerId } : {}),
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

/**
 * PUB-03: الشريك «يُحيل مشترٍ» على عرض — بيانات المشتري + موافقته.
 * المشتري بيوصله رابط العرض؛ لما يبدي اهتمام الصفقة بتتسجل باسم الشريك (referredByPartnerId).
 */
export async function referBuyer(locale: string, listingId: string, form: FormData) {
  const loc = isLocale(locale) ? locale : "ar";
  const back = `/${loc}/listings/${listingId}`;
  const user = await requireUser(loc, back, ["PARTNER_BROKER"]);
  if (form.get("buyerConsent") !== "on") redirect(`${back}?err=refer_consent#refer`);
  const name = String(form.get("buyerName") ?? "").trim().replace(/\s+/g, " ");
  const id = classifyIdentifier(String(form.get("buyerPhone") ?? ""));
  if (name.length < 3 || id.kind !== "phone") redirect(`${back}?err=refer_fields#refer`);
  const listing = await db.listing.findUnique({ where: { id: listingId }, select: { status: true, sellerId: true } });
  if (!listing || listing.status !== "PUBLISHED") redirect(back);
  const phone = (id as { value: string }).value;
  const buyer = (await db.user.findUnique({ where: { phone } })) ?? (await db.user.create({ data: { name, phone, role: "CLIENT", locale: loc } }));
  if (buyer.id === listing!.sellerId || buyer.id === user.id) redirect(`${back}?err=refer_self#refer`);
  await db.partnerReferral.upsert({ where: { listingId_buyerId: { listingId, buyerId: buyer.id } }, create: { partnerId: user.id, listingId, buyerId: buyer.id, buyerConsentAt: new Date() }, update: {} });
  await audit(user.id, "partner.refer_buyer", "Listing", listingId, { buyerId: buyer.id });
  await queueMessage("whatsapp", phone, "partner.referral", `Resell: ${user.name} رشّح لك قطعة على المنصة. شوفها هنا: ${siteUrl()}/${loc}/listings/${listingId}`);
  redirect(`${back}?ok=referred#refer`);
}
