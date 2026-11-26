"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { DEMO_MODE, checkCode, clearPending, createSession, getPending, homeFor, issueCode, setPending } from "@/lib/auth";
import { maskEmail, type Channel } from "@/lib/notify";
import { isValidPhone, maskPhone, normalizePhone } from "@/lib/format";
import { isLocale, type Locale } from "@/i18n/config";

export type SignInState = {
  step: "identify" | "register" | "code";
  error?: string;
  purpose?: "sign_in" | "sign_up";
  channel?: Channel;
  maskedPhone?: string;
  maskedEmail?: string | null;
  demoCode?: string | null;
  prefill?: { name?: string; phone?: string; email?: string };
};

const M = {
  empty: ["اكتب رقم الموبايل أو الإيميل أو الاسم", "Enter your mobile number, email or name"],
  manyNames: ["فيه أكتر من حساب بالاسم ده. ادخل برقم الموبايل أو الإيميل", "More than one account has this name. Use your mobile or email"],
  rate: ["طلبت رموز كتير. استنى ساعة وجرّب تاني", "Too many codes requested. Try again in an hour"],
  name: ["اكتب الاسم بالكامل (اسمين على الأقل)", "Enter your full name (at least two words)"],
  phone: ["رقم الموبايل مش صحيح. اكتبه بكود الدولة، مثلاً +966501234567", "Invalid mobile number. Include the country code, e.g. +966501234567"],
  email: ["الإيميل مش صحيح", "Invalid email"],
  emailNeeded: ["عشان يوصلك الرمز على الإيميل لازم تكتب إيميلك", "Enter your email to receive the code by email"],
  phoneTaken: ["الرقم ده عليه حساب بالفعل. ارجع وادخل بيه", "This number already has an account. Go back and sign in with it"],
  emailTaken: ["الإيميل ده عليه حساب بالفعل", "This email already has an account"],
  session: ["الجلسة خلصت. ابدأ من الأول", "Session expired. Please start again"],
  missing: ["مفيش رمز. اطلب رمز جديد", "No code found. Request a new one"],
  expired: ["الرمز خلص. اطلب رمز جديد", "The code expired. Request a new one"],
  locked: ["محاولات كتير غلط. اطلب رمز جديد", "Too many wrong attempts. Request a new one"],
  wrong: ["الرمز غلط", "Wrong code"],
} as const;

const msg = (locale: Locale, k: keyof typeof M) => (locale === "ar" ? M[k][0] : M[k][1]);

function safeNext(locale: Locale, next: string | null) {
  return next && next.startsWith(`/${locale}/`) && !next.startsWith("//") ? next : null;
}

const channelOf = (f: FormData): Channel => (f.get("channel") === "email" ? "email" : "whatsapp");

export async function identify(locale: Locale, _prev: SignInState, form: FormData): Promise<SignInState> {
  const raw = String(form.get("identifier") ?? "").trim();
  if (!raw) return { step: "identify", error: msg(locale, "empty") };

  let user = null;
  const prefill: SignInState["prefill"] = {};
  if (raw.includes("@")) {
    user = await db.user.findUnique({ where: { email: raw.toLowerCase() } });
    prefill.email = raw.toLowerCase();
  } else if ((raw.match(/[\d٠-٩]/g) ?? []).length >= 8) {
    const phone = normalizePhone(raw);
    user = await db.user.findUnique({ where: { phone } });
    prefill.phone = phone;
  } else {
    const matches = await db.user.findMany({ where: { name: { equals: raw, mode: "insensitive" }, anonymizedAt: null }, take: 2 });
    if (matches.length > 1) return { step: "identify", error: msg(locale, "manyNames") };
    user = matches[0] ?? null;
    prefill.name = raw;
  }

  if (!user || user.anonymizedAt) return { step: "register", prefill };

  // دخل بالإيميل؟ يبقى الرمز يروح الإيميل. غير كده واتساب، ويقدر يغيّر بعدين.
  const channel: Channel = raw.includes("@") && user.email ? "email" : "whatsapp";
  const issued = await issueCode(user.phone, "sign_in", channel, user.email);
  if (!issued.ok) return { step: "identify", error: msg(locale, "rate") };
  await setPending({ phone: user.phone, email: user.email, signIn: true });
  return {
    step: "code",
    purpose: "sign_in",
    channel: issued.channel,
    maskedPhone: maskPhone(user.phone),
    maskedEmail: user.email ? maskEmail(user.email) : null,
    demoCode: issued.code,
  };
}

export async function register(locale: Locale, _prev: SignInState, form: FormData): Promise<SignInState> {
  const name = String(form.get("name") ?? "").trim().replace(/\s+/g, " ");
  const phone = normalizePhone(String(form.get("phone") ?? ""));
  const emailRaw = String(form.get("email") ?? "").trim().toLowerCase();
  const country = String(form.get("country") ?? "") || null;
  const channel = channelOf(form);
  const prefill = { name, phone, email: emailRaw };

  if (name.split(" ").length < 2 || name.length < 5) return { step: "register", prefill, error: msg(locale, "name") };
  if (!isValidPhone(phone)) return { step: "register", prefill, error: msg(locale, "phone") };
  if (emailRaw && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailRaw)) return { step: "register", prefill, error: msg(locale, "email") };
  if (channel === "email" && !emailRaw) return { step: "register", prefill, error: msg(locale, "emailNeeded") };
  if (await db.user.findUnique({ where: { phone } })) return { step: "register", prefill, error: msg(locale, "phoneTaken") };
  if (emailRaw && (await db.user.findUnique({ where: { email: emailRaw } })))
    return { step: "register", prefill, error: msg(locale, "emailTaken") };

  const issued = await issueCode(phone, "sign_up", channel, emailRaw || null);
  if (!issued.ok) return { step: "register", prefill, error: msg(locale, "rate") };
  await setPending({ name, phone, email: emailRaw || null, country, locale });
  return {
    step: "code",
    purpose: "sign_up",
    channel: issued.channel,
    maskedPhone: maskPhone(phone),
    maskedEmail: emailRaw ? maskEmail(emailRaw) : null,
    demoCode: issued.code,
  };
}

export async function verify(locale: Locale, next: string | null, prev: SignInState, form: FormData): Promise<SignInState> {
  const code = String(form.get("code") ?? "").replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
  const pending = await getPending();
  if (!pending) return { step: "identify", error: msg(locale, "session") };

  const result = await checkCode(pending.phone, code);
  if (result !== "ok") return { ...prev, step: "code", error: msg(locale, result) };

  let user;
  if ("signIn" in pending) {
    user = await db.user.findUniqueOrThrow({ where: { phone: pending.phone } });
    await audit(user.id, "auth.sign_in", "User", user.id, { channel: prev.channel });
  } else {
    user = await db.user.create({
      data: { name: pending.name, phone: pending.phone, email: pending.email, countryOfResidence: pending.country, locale: pending.locale },
    });
    await audit(user.id, "auth.sign_up", "User", user.id, { country: pending.country, channel: prev.channel });
  }
  await clearPending();
  await createSession(user.id);
  const fallback = user.role === "CLIENT" ? `account${"signIn" in pending ? "" : "?welcome=1"}` : homeFor(user.role);
  redirect(safeNext(locale, next) ?? `/${locale}/${fallback}`);
}

/** رمز جديد — على نفس القناة أو على القناة التانية */
export async function resend(locale: Locale, prev: SignInState, channel: Channel): Promise<SignInState> {
  const pending = await getPending();
  if (!pending) return { step: "identify", error: msg(locale, "session") };
  const issued = await issueCode(pending.phone, "signIn" in pending ? "sign_in" : "sign_up", channel, pending.email);
  if (!issued.ok) return { ...prev, error: msg(locale, "rate") };
  return { ...prev, error: undefined, channel: issued.channel, demoCode: issued.code };
}

/** دخول سريع بحسابات التجربة — شغال في الوضع التجريبي بس */
export async function demoSignIn(locale: string, userId: string) {
  if (!DEMO_MODE) return;
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) return;
  await audit(user.id, "auth.demo_sign_in", "User", user.id);
  await createSession(user.id);
  const loc = isLocale(locale) ? locale : "ar";
  redirect(`/${loc}/${homeFor(user.role)}`);
}
