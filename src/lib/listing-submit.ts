import "server-only";
import { db } from "./db";
import { audit } from "./audit";
import { idsByRole, notify } from "./notifications";

/**
 * PUB-01/03: العرض بيتبعت للمراجعة تلقائياً أول ما شروطه تكمل:
 * عرض المالك بنفسه → موثّق + موافق على نموذج 1؛ عرض نيابة → المالك أكّد بالكود (+ الشريك موافق على نموذج 10).
 */
export async function submitListingIfReady(listingId: string, actorId: string | null) {
  const l = await db.listing.findUnique({ where: { id: listingId }, include: { seller: true, submittedBy: true, plot: true } });
  if (!l || l.status !== "DRAFT") return false;
  const onBehalf = !!l.submittedById && l.submittedById !== l.sellerId;
  const ready = onBehalf
    ? !!l.ownerConfirmedAt && !!l.authorizationConsentAt && (l.submittedBy?.role !== "PARTNER_BROKER" || !!l.submittedBy.partnerAgreedAt)
    : !!l.authorizationConsentAt && l.seller.accountLevel === "VERIFIED";
  if (!ready) return false;
  await db.listing.update({ where: { id: listingId }, data: { status: "IN_REVIEW" } });
  await audit(actorId, "listing.submit", "Listing", listingId, { before: "DRAFT", after: "IN_REVIEW", auto: true });
  await notify(l.assignedBrokerId ? [l.assignedBrokerId] : await idsByRole("BROKER_LEAD"), {
    kind: "listing.new",
    ar: [`عرض جديد مستني المراجعة — ${l.plot.code}`, `${l.seller.name}`],
    en: [`A new listing awaits review — ${l.plot.code}`, `${l.seller.name}`],
    link: `/broker?tab=queue`,
  });
  return true;
}
