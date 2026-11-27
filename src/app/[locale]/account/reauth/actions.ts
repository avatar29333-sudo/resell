"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { audit } from "@/lib/audit";
import { checkCode, issueCode, markReauthenticated, requireUser } from "@/lib/auth";
import { decryptSecret, verifyTotp } from "@/lib/totp";
import { isLocale } from "@/i18n/config";

const loc = (l: string) => (isLocale(l) ? l : "ar");
/** مسار داخلي بس (منع open redirect) */
const safe = (l: string, next: string | null) => (next && next.startsWith(`/${l}/`) && !next.startsWith("//") ? next : `/${l}/account`);
const self = (l: string, next: string, q: string) => `/${l}/account/reauth?next=${encodeURIComponent(next)}&${q}`;

/** PERM-08: يبعت رمز تأكيد للموبايل/الإيميل */
export async function sendReauthCode(locale: string, nextRaw: string) {
  const l = loc(locale);
  const next = safe(l, nextRaw);
  const user = await requireUser(l, self(l, next, ""));
  const r = await issueCode(user.phone, "reauth", user.email ? "email" : "whatsapp", user.email);
  if (!r.ok) redirect(self(l, next, "err=rate"));
  // الوضع التجريبي بس: الرمز يظهر على الشاشة (في كوكي قصيرة، مش في الرابط)
  if (r.code) (await cookies()).set("resell_reauth_demo", r.code, { httpOnly: true, sameSite: "strict", path: `/${l}/account/reauth`, maxAge: 600 });
  redirect(self(l, next, "sent=1"));
}

export async function confirmReauth(locale: string, nextRaw: string, form: FormData) {
  const l = loc(locale);
  const next = safe(l, nextRaw);
  const user = await requireUser(l, self(l, next, ""));
  const code = String(form.get("code") ?? "").replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).trim();
  const viaTotp = form.get("method") === "totp";
  const ok = viaTotp ? !!user.totpSecret && !!user.totpEnabledAt && verifyTotp(decryptSecret(user.totpSecret), code) : (await checkCode(user.phone, code)) === "ok";
  if (!ok) {
    await audit(user.id, "auth.reauth_failed", "User", user.id, { method: viaTotp ? "totp" : "code" });
    redirect(self(l, next, `err=code${viaTotp ? "" : "&sent=1"}`));
  }
  await markReauthenticated(user.id);
  await audit(user.id, "auth.reauth", "User", user.id, { method: viaTotp ? "totp" : "code" });
  redirect(next);
}
