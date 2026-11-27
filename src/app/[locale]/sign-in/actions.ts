"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { DEMO_MODE, checkCode, clearPending, createSession, getPending, homeFor, issueCode, setPending } from "@/lib/auth";
import { maskEmail, type Channel } from "@/lib/notify";
import { decryptSecret, verifyTotp } from "@/lib/totp";
import { classifyIdentifier } from "@/lib/identifier";
import { safeNext } from "@/lib/safe-next";
import { isValidPhone, maskPhone, normalizePhone } from "@/lib/format";
import { isLocale, type Locale } from "@/i18n/config";

export type SignInState = {
  step: "identify" | "register" | "code" | "totp";
  error?: string;
  purpose?: "sign_in" | "sign_up";
  channel?: Channel;
  maskedPhone?: string;
  maskedEmail?: string | null;
  demoCode?: string | null;
  prefill?: { name?: string; phone?: string; email?: string };
};

const M = {
  empty: ["اكتب رقم الموبايل أو الإيميل", "Enter your mobile number or email"],
  identifier: [
    "اكتب رقم موبايل بكود الدولة (مثلاً +966501234567) أو إيميل صحيح",
    "Enter a mobile number with country code (e.g. +966501234567) or a valid email",
  ],
  rate: ["محاولات كتير. استنى 15 دقيقة وجرّب تاني", "Too many attempts. Please wait 15 minutes and try again"],
  name: ["اكتب الاسم بالكامل (اسمين على الأقل)", "Enter your full name (at least two words)"],
  phone: ["رقم الموبايل مش صحيح. اكتبه بكود الدولة، مثلاً +966501234567", "Invalid mobile number. Include the country code, e.g. +966501234567"],
  email: ["الإيميل مش صحيح", "Invalid email"],
  emailNeeded: ["عشان يوصلك الرمز على الإيميل لازم تكتب إيميلك", "Enter your email to receive the code by email"],
  phoneTaken: ["الرقم ده عليه حساب بالفعل. ارجع وادخل بيه", "This number already has an account. Go back and sign in with it"],
  emailTaken: ["الإيميل ده عليه حساب بالفعل", "This email already has an account"],
  session: ["الجلسة خلصت. ابدأ من الأول", "Session expired. Please start again"],
  missing: ["مفيش رمز. اطلب رمز جديد", "No code found. Request a new one"],
  expired: ["الرمز خلص. اطلب رمز جديد", "The code expired. Request a new one"],
  locked: ["محاولات كتير غلط. استنى 15 دقيقة واطلب رمز جديد", "Too many wrong attempts. Wait 15 minutes and request a new code"],
  wrong: ["الرمز غلط", "Wrong code"],
  terms: ["لازم توافق على الشروط وسياسة الخصوصية", "You must accept the terms and privacy policy"],
  suspended: ["الحساب ده موقوف. كلّم الدعم لو محتاج مساعدة", "This account is suspended. Contact support if you need help"],
  totpWrong: ["رمز تطبيق التحقق غلط أو خلص — جرّب الرمز اللي ظاهر دلوقتي", "Wrong or expired authenticator code — try the current one"],
} as const;

const msg = (locale: Locale, k: keyof typeof M) => (locale === "ar" ? M[k][0] : M[k][1]);


const channelOf = (f: FormData): Channel => (f.get("channel") === "email" ? "email" : "whatsapp");

export async function identify(locale: Locale, _prev: SignInState, form: FormData): Promise<SignInState> {
  const raw = String(form.get("identifier") ?? "").trim();
  if (!raw) return { step: "identify", error: msg(locale, "empty") };

  // SEC-01: موبايل دولي أو إيميل بس — مفيش بحث بالاسم
  const id = classifyIdentifier(raw);
  if (id.kind === "invalid") return { step: "identify", error: msg(locale, "identifier") };
  const prefill: SignInState["prefill"] = id.kind === "email" ? { email: id.value } : { phone: id.value };
  const user = id.kind === "email" ? await db.user.findUnique({ where: { email: id.value } }) : await db.user.findUnique({ where: { phone: id.value } });

  if (!user || user.anonymizedAt) return { step: "register", prefill };
  // PERM-07: الحساب الموقوف ما يدخلش
  if (user.status === "SUSPENDED") {
    await audit(user.id, "auth.suspended_attempt", "User", user.id);
    return { step: "identify", error: msg(locale, "suspended") };
  }

  // دخل بالإيميل؟ يبقى الرمز يروح الإيميل. غير كده واتساب، ويقدر يغيّر بعدين.
  const channel: Channel = id.kind === "email" && user.email ? "email" : "whatsapp";
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
  if (form.get("terms") !== "on") return { step: "register", prefill, error: msg(locale, "terms") };
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
    // عنده تحقق ثنائي؟ لسه فاضل رمز التطبيق
    if (user.totpEnabledAt && user.totpSecret) {
      await setPending({ ...pending, totp: true });
      return { ...prev, step: "totp", error: undefined };
    }
    await audit(user.id, "auth.sign_in", "User", user.id, { channel: prev.channel });
  } else {
    user = await db.user.create({
      data: {
        name: pending.name,
        phone: pending.phone,
        email: pending.email,
        countryOfResidence: pending.country,
        locale: pending.locale,
        termsAcceptedAt: new Date(),
      },
    });
    await audit(user.id, "auth.sign_up", "User", user.id, { country: pending.country, channel: prev.channel });
  }
  await clearPending();
  await createSession(user.id);
  const fallback = user.role === "CLIENT" ? `account${"signIn" in pending ? "" : "?welcome=1"}` : homeFor(user.role);
  redirect(safeNext(locale, next) ?? `/${locale}/${fallback}`);
}

/** الخطوة التانية للي مفعّل التحقق الثنائي: رمز من تطبيق Authenticator */
export async function verifyTotpStep(locale: Locale, next: string | null, prev: SignInState, form: FormData): Promise<SignInState> {
  const pending = await getPending();
  if (!pending || !("signIn" in pending) || !pending.totp) return { step: "identify", error: msg(locale, "session") };
  const user = await db.user.findUniqueOrThrow({ where: { phone: pending.phone } });
  const ok = !!user.totpSecret && verifyTotp(decryptSecret(user.totpSecret), String(form.get("totp") ?? ""));
  if (!ok) {
    await audit(user.id, "auth.totp_failed", "User", user.id);
    return { ...prev, step: "totp", error: msg(locale, "totpWrong") };
  }
  await audit(user.id, "auth.sign_in", "User", user.id, { channel: prev.channel, totp: true });
  await clearPending();
  await createSession(user.id);
  redirect(safeNext(locale, next) ?? `/${locale}/${homeFor(user.role)}`);
}

/** رمز جديد — على نفس القناة أو على القناة التانية */
export async function resend(locale: Locale, prev: SignInState, channel: Channel): Promise<SignInState> {
  const pending = await getPending();
  if (!pending) return { step: "identify", error: msg(locale, "session") };
  const issued = await issueCode(pending.phone, "signIn" in pending ? "sign_in" : "sign_up", channel, pending.email);
  if (!issued.ok) return { ...prev, error: msg(locale, "rate") };
  return { ...prev, error: undefined, channel: issued.channel, demoCode: issued.code };
}

/** دخول سريع بحسابات التجربة — السيرفر بيرفضه لو DEMO_MODE مش true (SEC-01) */
export async function demoSignIn(locale: string, userId: string, next?: string | null) {
  if (!DEMO_MODE) {
    await audit(null, "auth.demo_sign_in_rejected", "User", userId);
    throw new Error("Demo sign-in is disabled");
  }
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user || user.status === "SUSPENDED") return;
  await audit(user.id, "auth.demo_sign_in", "User", user.id);
  await createSession(user.id);
  const loc = isLocale(locale) ? locale : "ar";
  redirect(safeNext(loc, next) ?? `/${loc}/${homeFor(user.role)}`);
}
