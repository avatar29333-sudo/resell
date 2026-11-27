"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { requireActionCode } from "@/lib/action-otp";
import { pendingConsents, recordClickwrap } from "@/lib/clickwrap";
import { submitListingIfReady } from "@/lib/listing-submit";
import { isLocale } from "@/i18n/config";

/** CON-03: موافقة إلكترونية على نموذج (مربع + كود) — شروط الاستخدام، 1، 9، 10 */
export async function acceptClickwrap(locale: string, key: string, versionId: string, subjectId: string | null, form: FormData) {
  const l = isLocale(locale) ? locale : "ar";
  const back = `/${l}/account#consents`;
  const user = await requireUser(l, back);
  const item = (await pendingConsents(user)).find((p) => p.key === key && p.versionId === versionId && p.subjectId === subjectId);
  if (!item || !item.ok) redirect(back);
  if (form.get("agree") !== "on") redirect(`/${l}/account?err=agree#consents`);
  await requireActionCode(user, "consent.accept", subjectId, { versionId }, form, `/${l}/account`);
  await recordClickwrap(user, { kind: key, versionId, title: item!.title, version: item!.version, text: item!.text, listingId: key === "listing_authorization" ? subjectId : null, subjectId });
  if (key === "terms_of_use") await db.user.update({ where: { id: user.id }, data: { termsAcceptedAt: new Date() } });
  // PUB-01: موافقة نموذج 1 → العرض بيتبعت للمراجعة لو صاحبه موثّق
  if (key === "listing_authorization" && subjectId) {
    await db.listing.update({ where: { id: subjectId }, data: { authorizationConsentAt: new Date() } });
    await submitListingIfReady(subjectId, user.id);
  }
  // PUB-03: موافقة الشريك على نموذج 10 (مرة واحدة)
  if (key === "partner_agreement") await db.user.update({ where: { id: user.id }, data: { partnerAgreedAt: new Date() } });
  revalidatePath(`/${l}/account`);
  redirect(`/${l}/account?ok=consent#consents`);
}
