import "server-only";
import { createHash, randomInt } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import type { Role, User } from "@prisma/client";
import { db } from "./db";
import type { Locale } from "@/i18n/config";
import { sendCode, type Channel } from "./notify";
import { isDemoMode } from "./demo";
import { headers } from "next/headers";

const SESSION_COOKIE = "resell_session";
const PENDING_COOKIE = "resell_pending";
const SESSION_DAYS = 30;

/** الفريق الداخلي (السمسار الشريك من برّه، مش موظف) */
export const STAFF_ROLES: Role[] = ["ADMIN", "BROKER", "BROKER_LEAD", "LAWYER", "AGENT", "FINANCE"];

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 16) {
    if (process.env.NODE_ENV === "production") throw new Error("SESSION_SECRET لازم يكون 16 حرف على الأقل");
    return new TextEncoder().encode("dev-only-secret-change-me-please");
  }
  return new TextEncoder().encode(s);
}

const secure = process.env.NODE_ENV === "production";

/**
 * الوضع التجريبي (SEC-01): بيتفتح بـ DEMO_MODE=true بس. مقفول = الرمز ما بيظهرش على الشاشة،
 * ومفيش «دخول سريع»، والـ action بتاعه بيرفض في السيرفر.
 */
export const DEMO_MODE = isDemoMode();

// ─── الجلسة ───

/** PERM-08: مدة الجلسة حسب الدور (بالثواني) */
export function sessionSecondsFor(role: Role) {
  switch (role) {
    case "CLIENT":
      return SESSION_DAYS * 86400;
    case "PARTNER_BROKER":
      return 14 * 86400;
    case "FINANCE":
    case "ADMIN":
      return 8 * 3600;
    default:
      return 12 * 3600;
  }
}

export async function createSession(userId: string) {
  const u = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { role: true, sessionVersion: true } });
  const ttl = sessionSecondsFor(u.role);
  const token = await new SignJWT({ sub: userId, sv: u.sessionVersion })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + ttl)
    .sign(secret());
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: ttl,
  });
}

export async function destroySession() {
  const c = await cookies();
  c.delete(SESSION_COOKIE);
  c.delete(REAUTH_COOKIE);
}

/**
 * الجلسة صالحة بس لو: التوقيع سليم + ما خلصتش + رقم نسخة الجلسة = اللي في الحساب
 * (الإيقاف أو تغيير الدور بيزوّد الرقم فكل الجلسات القديمة بتقع) + الحساب مش موقوف.
 */
export async function getCurrentUser(): Promise<User | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    if (!payload.sub) return null;
    const user = await db.user.findUnique({ where: { id: payload.sub } });
    if (!user || user.anonymizedAt || user.status === "SUSPENDED") return null;
    if ((payload.sv ?? 0) !== user.sessionVersion) return null;
    return user;
  } catch {
    return null;
  }
}

// ─── إعادة التحقق قبل الأفعال الحرجة (PERM-08) ───

const REAUTH_COOKIE = "resell_reauth";
export const REAUTH_MINUTES = 10;

export async function markReauthenticated(userId: string) {
  const token = await new SignJWT({ sub: userId, reauth: true })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${REAUTH_MINUTES}m`)
    .sign(secret());
  (await cookies()).set(REAUTH_COOKIE, token, { httpOnly: true, sameSite: "strict", secure, path: "/", maxAge: REAUTH_MINUTES * 60 });
}

export async function recentlyReauthenticated(userId: string) {
  const token = (await cookies()).get(REAUTH_COOKIE)?.value;
  if (!token) return false;
  try {
    const { payload } = await jwtVerify(token, secret());
    return payload.sub === userId && payload.reauth === true;
  } catch {
    return false;
  }
}

/** لو المستخدم ما أكّدش هويته في آخر 10 دقايق → يتحول لصفحة التأكيد ويرجع لنفس الصفحة */
export async function requireRecentAuth(user: User, locale: Locale, back: string) {
  if (await recentlyReauthenticated(user.id)) return;
  redirect(`/${locale}/account/reauth?next=${encodeURIComponent(back)}`);
}

/**
 * التحقق الثنائي إجباري للفريق لما REQUIRE_STAFF_2FA=1.
 * مقفول في النسخة التجريبية عشان «الدخول السريع» يفضل شغال — بيتفتح مع قفله.
 */
export const REQUIRE_STAFF_2FA = process.env.REQUIRE_STAFF_2FA === "1";

/** لو مش داخل: يروح لصفحة الدخول ويرجع لنفس الصفحة بعدها */
export async function requireUser(locale: Locale, next: string, roles?: Role[]) {
  const user = await getCurrentUser();
  if (!user) redirect(`/${locale}/sign-in?next=${encodeURIComponent(next)}`);
  if (roles && !roles.includes(user.role)) redirect(`/${locale}/account?denied=1`);
  if (REQUIRE_STAFF_2FA && STAFF_ROLES.includes(user.role) && !user.totpEnabledAt && !next.includes("/account/security")) {
    redirect(`/${locale}/account/security?required=1`);
  }
  return user;
}

export function homeFor(role: Role) {
  switch (role) {
    case "ADMIN":
      return "settings";
    case "BROKER":
    case "BROKER_LEAD":
      return "broker";
    case "AGENT":
      return "agent";
    case "LAWYER":
      return "lawyer";
    case "FINANCE":
      return "finance";
    case "PARTNER_BROKER":
      return "partner";
    default:
      return "account";
  }
}

// ─── تسجيل جديد معلّق لحد تأكيد الرمز ───

export type PendingSignUp = { name: string; phone: string; email: string | null; country: string | null; locale: Locale };

export async function setPending(data: Pending) {
  const token = await new SignJWT({ data })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("15m")
    .sign(secret());
  (await cookies()).set(PENDING_COOKIE, token, { httpOnly: true, sameSite: "lax", secure, path: "/", maxAge: 900 });
}

/** totp = الرمز الأول اتأكد، ومستنيين رمز تطبيق التحقق */
export type Pending = PendingSignUp | { phone: string; email: string | null; signIn: true; totp?: boolean };

export async function getPending(): Promise<Pending | null> {
  const token = (await cookies()).get(PENDING_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return (payload as { data: Pending }).data;
  } catch {
    return null;
  }
}

export async function clearPending() {
  (await cookies()).delete(PENDING_COOKIE);
}

// ─── رموز الدخول ───

const hash = (code: string) => createHash("sha256").update(code).digest("hex");
const CODE_TTL_MIN = 10;
/** SEC-01: 5 محاولات كل 15 دقيقة — لكل رقم ولكل IP */
export const RATE_WINDOW_MS = 15 * 60_000;
export const RATE_LIMIT = 5;

export async function clientIp() {
  try {
    const h = await headers();
    return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null;
  } catch {
    return null;
  }
}

/**
 * بيعمل رمز جديد ويبعته على واتساب أو الإيميل.
 * الرمز مربوط بالرقم دايماً (هو هوية الحساب)، والقناة بس هي اللي بتختلف.
 * الرمز بيظهر على الشاشة في DEMO_MODE بس.
 */
export async function issueCode(phone: string, purpose: "sign_in" | "sign_up" | "reauth",channel: Channel = "whatsapp", email?: string | null) {
  const since = new Date(Date.now() - RATE_WINDOW_MS);
  const ip = await clientIp();
  const [byPhone, byIp] = await Promise.all([
    db.loginCode.count({ where: { phone, createdAt: { gte: since } } }),
    ip ? db.loginCode.count({ where: { ip, createdAt: { gte: since } } }) : Promise.resolve(0),
  ]);
  if (byPhone >= RATE_LIMIT || byIp >= RATE_LIMIT) {
    await db.auditLog.create({ data: { action: "auth.code_rate_limited", entityType: "Phone", entityId: phone, ip } });
    return { ok: false as const, error: "rate" as const };
  }
  if (channel === "email" && !email) channel = "whatsapp";
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await db.loginCode.create({
    data: { phone, purpose, ip, codeHash: hash(code), expiresAt: new Date(Date.now() + CODE_TTL_MIN * 60_000) },
  });
  await db.auditLog.create({ data: { action: "auth.code_requested", entityType: "Phone", entityId: phone, ip, data: { channel, purpose } } });
  const sent = await sendCode(channel, channel === "email" ? email! : phone, code);
  return { ok: true as const, code: DEMO_MODE ? sent.shownOnScreen : null, channel };
}

/** الرمز: صح مرة واحدة، بيخلص بعد 10 دقايق، و5 محاولات غلط (للرقم أو للـ IP) كل 15 دقيقة بتقفل */
export async function checkCode(phone: string, code: string) {
  const since = new Date(Date.now() - RATE_WINDOW_MS);
  const ip = await clientIp();
  const failures = await db.auditLog.count({
    where: { action: "auth.code_failed", createdAt: { gte: since }, OR: [{ entityId: phone }, ...(ip ? [{ ip }] : [])] },
  });
  if (failures >= RATE_LIMIT) return "locked" as const;
  const row = await db.loginCode.findFirst({
    where: { phone, usedAt: null },
    orderBy: { createdAt: "desc" },
  });
  if (!row) return "missing" as const;
  if (row.expiresAt < new Date()) return "expired" as const;
  if (row.attempts >= RATE_LIMIT) return "locked" as const;
  if (row.codeHash !== hash(code.trim())) {
    await db.loginCode.update({ where: { id: row.id }, data: { attempts: { increment: 1 } } });
    await db.auditLog.create({ data: { action: "auth.code_failed", entityType: "Phone", entityId: phone, ip } });
    return "wrong" as const;
  }
  await db.loginCode.update({ where: { id: row.id }, data: { usedAt: new Date() } });
  return "ok" as const;
}
