"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { REQUIRE_STAFF_2FA, STAFF_ROLES, destroySession, requireUser } from "@/lib/auth";
import { decryptSecret, encryptSecret, newSecret, verifyTotp } from "@/lib/totp";
import { isLocale } from "@/i18n/config";

const loc = (l: string) => (isLocale(l) ? l : "ar");
const page = (l: string) => `/${loc(l)}/account/security`;

/** بداية التفعيل: سر جديد (لسه مش مفعّل لحد ما يأكد برمز) */
export async function startTotp(locale: string) {
  const user = await requireUser(loc(locale), page(locale));
  if (user.totpEnabledAt) return;
  await db.user.update({ where: { id: user.id }, data: { totpSecret: encryptSecret(newSecret()) } });
  revalidatePath(page(locale));
}

export async function confirmTotp(locale: string, form: FormData) {
  const user = await requireUser(loc(locale), page(locale));
  if (!user.totpSecret || user.totpEnabledAt) redirect(page(locale));
  if (!verifyTotp(decryptSecret(user.totpSecret!), String(form.get("code") ?? ""))) redirect(`${page(locale)}?err=code`);
  await db.user.update({ where: { id: user.id }, data: { totpEnabledAt: new Date(), twoFactorEnabled: true } });
  await audit(user.id, "auth.totp_enabled", "User", user.id);
  redirect(`${page(locale)}?ok=enabled`);
}

export async function disableTotp(locale: string, form: FormData) {
  const user = await requireUser(loc(locale), page(locale));
  if (!user.totpSecret || !user.totpEnabledAt) redirect(page(locale));
  // الفريق ما يقدرش يقفله لما يكون إجباري
  if (REQUIRE_STAFF_2FA && STAFF_ROLES.includes(user.role)) redirect(`${page(locale)}?err=required`);
  if (!verifyTotp(decryptSecret(user.totpSecret!), String(form.get("code") ?? ""))) redirect(`${page(locale)}?err=code`);
  await db.user.update({ where: { id: user.id }, data: { totpSecret: null, totpEnabledAt: null, twoFactorEnabled: false } });
  await audit(user.id, "auth.totp_disabled", "User", user.id);
  redirect(`${page(locale)}?ok=disabled`);
}

/**
 * حذف الحساب بالطلب (قانون 151 لسنة 2020): البيانات الشخصية بتتمسح من الحساب،
 * والسجلات اللي القانون بيلزمنا نحتفظ بيها (العقود الموقّعة وسجل التدقيق) بتفضل من غير اسم.
 */
export async function deleteMyAccount(locale: string, form: FormData) {
  const l = loc(locale);
  const user = await requireUser(l, page(locale));
  if (STAFF_ROLES.includes(user.role)) redirect(`${page(locale)}?err=staff`);
  if (String(form.get("confirm") ?? "").trim() !== "احذف" && String(form.get("confirm") ?? "").trim().toUpperCase() !== "DELETE")
    redirect(`${page(locale)}?err=confirm#delete`);

  const open = await db.deal.count({
    where: { status: { in: ["ACTIVE", "ON_HOLD"] }, OR: [{ buyerId: user.id }, { listing: { sellerId: user.id } }] },
  });
  if (open > 0) redirect(`${page(locale)}?err=open_deals#delete`);

  await db.listing.updateMany({ where: { sellerId: user.id, status: { in: ["DRAFT", "IN_REVIEW", "VERIFIED", "PUBLISHED"] } }, data: { status: "WITHDRAWN" } });
  await db.buyRequest.updateMany({ where: { buyerId: user.id, status: { in: ["ACTIVE", "PAUSED"] } }, data: { status: "CANCELLED" } });
  await db.user.update({
    where: { id: user.id },
    data: {
      name: "مستخدم محذوف",
      phone: `deleted:${user.id}`,
      email: null,
      countryOfResidence: null,
      totpSecret: null,
      totpEnabledAt: null,
      anonymizedAt: new Date(),
    },
  });
  await audit(user.id, "user.delete_request", "User", user.id);
  await destroySession();
  redirect(`/${l}?deleted=1`);
}

/** DEAL-03: تغيير قناة كود التحقق — بكود على القناة القديمة */
export async function setOtpChannel(locale: string, form: FormData) {
  const { CHANNELS, requireActionCode } = await import("@/lib/action-otp");
  const user = await requireUser(loc(locale), page(locale));
  const ch = String(form.get("channel") ?? "");
  if (!(CHANNELS as string[]).includes(ch) || (ch === "totp" && !user.totpEnabledAt) || (ch === "email" && !user.email)) redirect(`${page(locale)}?err=channel`);
  await requireActionCode(user, "otp.channel_change", null, { channel: ch }, form, page(locale));
  await db.user.update({ where: { id: user.id }, data: { otpChannel: ch } });
  await audit(user.id, "user.otp_channel", "User", user.id, { before: user.otpChannel, after: ch });
  redirect(`${page(locale)}?ok=channel`);
}
