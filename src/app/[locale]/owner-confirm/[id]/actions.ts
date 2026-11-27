"use server";

import { createHash } from "node:crypto";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { publishedFor, userVars } from "@/lib/contract-vars";
import { renderTemplate } from "@/lib/templates";
import { recordClickwrap } from "@/lib/clickwrap";
import { submitListingIfReady } from "@/lib/listing-submit";
import { notify } from "@/lib/notifications";
import { toNum } from "@/lib/format";
import { CITY } from "@/lib/labels";
import { isLocale } from "@/i18n/config";

/** PUB-03: المالك بيأكّد بالكود اللي وصله إنه موافق على عرض قطعته نيابة عنه (نموذج 1) — 5 محاولات غلط بتقفل الكود */
export async function confirmOwner(locale: string, listingId: string, form: FormData) {
  const l = isLocale(locale) ? locale : "ar";
  const back = `/${l}/owner-confirm/${listingId}`;
  const listing = await db.listing.findUnique({ where: { id: listingId }, include: { seller: true, submittedBy: true, plot: true } });
  if (!listing || listing.ownerConfirmedAt || !listing.ownerConfirmCodeHash || !listing.ownerConfirmExpiresAt || listing.ownerConfirmExpiresAt < new Date()) redirect(`${back}?err=expired`);
  if (form.get("agree") !== "on") redirect(`${back}?err=agree`);
  const wrong = await db.auditLog.count({ where: { action: "owner_confirm.wrong", entityId: listingId, createdAt: { gt: new Date(Date.now() - 3600_000) } } });
  if (wrong >= 5) redirect(`${back}?err=locked`);
  const code = String(form.get("code") ?? "").replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).trim();
  if (createHash("sha256").update(code).digest("hex") !== listing!.ownerConfirmCodeHash) {
    await audit(null, "owner_confirm.wrong", "Listing", listingId);
    redirect(`${back}?err=code`);
  }
  await db.listing.update({ where: { id: listingId }, data: { ownerConfirmedAt: new Date(), authorizationConsentAt: new Date(), ownerConfirmCodeHash: null } });
  const tv = await publishedFor({ key: "listing_authorization" });
  if (tv) {
    const text = renderTemplate(tv.bodyMarkdown, await userVars(listing!.seller, tv.version, { plot_city: (CITY[listing!.plot.city] ?? [listing!.plot.city])[0], plot_district: listing!.plot.district, plot_round: "—", plot_code: listing!.plot.code, plot_area: String(toNum(listing!.plot.areaSqm)), listing_price: toNum(listing!.price).toLocaleString("en-US") })).text;
    await recordClickwrap(listing!.seller, { kind: "listing_authorization", versionId: tv.id, title: tv.template.titleAr, version: tv.version, text, listingId, subjectId: listingId });
  }
  await audit(listing!.sellerId, "listing.owner_confirmed", "Listing", listingId, { by: "code" });
  if (listing!.submittedById) await notify([listing!.submittedById], { kind: "listing.owner_confirmed", ar: [`المالك أكّد عرض القطعة ${listing!.plot.code}`], en: [`The owner confirmed listing ${listing!.plot.code}`], link: `/account` });
  await submitListingIfReady(listingId, listing!.sellerId);
  redirect(`${back}?ok=1`);
}
