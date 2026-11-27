import "server-only";
import { createHash, randomInt } from "node:crypto";
import { redirect } from "next/navigation";
import type { User } from "@prisma/client";
import { db } from "./db";
import { audit } from "./audit";
import { clientIp } from "./auth";
import { isDemoMode } from "./demo";
import { queueMessage } from "./outbox";
import { notify } from "./notifications";
import { decryptSecret, verifyTotp } from "./totp";
import { headers } from "next/headers";
import { CODE_TTL_MS, MAX_PER_HOUR, decide, hashCode, lockAfterWrong, paramsHash, type ActionKey, type Verdict } from "./action-otp-core";

export type Channel = "whatsapp" | "sms" | "email" | "totp";
export const CHANNELS: Channel[] = ["whatsapp", "sms", "email", "totp"];
export const CHANNEL_LABEL: Record<Channel, [string, string]> = {
  whatsapp: ["واتساب", "WhatsApp"],
  sms: ["رسالة SMS", "SMS"],
  email: ["الإيميل", "email"],
  totp: ["تطبيق التحقق", "authenticator app"],
};

/** القناة الفعلية: التطبيق محتاج يكون متفعّل، والإيميل محتاج إيميل — وإلا واتساب */
export function effectiveChannel(u: Pick<User, "otpChannel" | "totpEnabledAt" | "email">): Channel {
  const c = (CHANNELS as string[]).includes(u.otpChannel) ? (u.otpChannel as Channel) : "whatsapp";
  if (c === "totp" && !u.totpEnabledAt) return "whatsapp";
  if (c === "email" && !u.email) return "whatsapp";
  return c;
}

async function lockedUntil(userId: string, action: string) {
  const l = await db.actionLock.findUnique({ where: { userId_action: { userId, action } } });
  return l && l.lockedUntil > new Date() ? l.lockedUntil : null;
}

/** DEAL-03: يطلب كود لإجراء واحد. الملخص بيتكتب في الرسالة نفسها. الكود بيظهر على الشاشة في الوضع التجريبي بس. */
export async function requestActionCode(user: User, action: ActionKey, dealId: string | null, params: Record<string, unknown>, summary: string) {
  if (await lockedUntil(user.id, action)) return { ok: false as const, error: "locked" as const };
  const hour = await db.actionCode.count({ where: { userId: user.id, createdAt: { gte: new Date(Date.now() - 3600_000) } } });
  if (hour >= MAX_PER_HOUR) return { ok: false as const, error: "rate" as const };
  const channel = effectiveChannel(user);
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await db.actionCode.create({
    data: {
      userId: user.id,
      action,
      dealId,
      paramsHash: paramsHash(action, dealId, params),
      summary,
      codeHash: channel === "totp" ? "totp" : hashCode(code),
      channel,
      expiresAt: new Date(Date.now() + CODE_TTL_MS),
      ip: await clientIp(),
    },
  });
  if (channel !== "totp") {
    const body = `Resell — ${summary}: ${code}\n${user.locale === "en" ? "Valid for 5 minutes. Never share it." : "صالح 5 دقايق. ما تديهوش لحد."}`;
    await queueMessage(channel, channel === "email" ? user.email! : user.phone, `otp.${action}`, body);
  }
  await audit(user.id, "otp.requested", "Action", action, { dealId, channel });
  return { ok: true as const, channel, demoCode: isDemoMode() && channel !== "totp" ? code : null };
}

/** DEAL-03: يتحقق من الكود. لازم نفس الإجراء + نفس الصفقة + نفس القيم. بيسجّل الموافقة في ConsentRecord. */
export async function consumeActionCode(user: User, action: ActionKey, dealId: string | null, params: Record<string, unknown>, code: string): Promise<Verdict> {
  const now = new Date();
  const lock = await lockedUntil(user.id, action);
  const row = await db.actionCode.findFirst({ where: { userId: user.id, action, dealId, usedAt: null }, orderBy: { createdAt: "desc" } });
  const ph = paramsHash(action, dealId, params);
  let verdict = decide(row, { action, dealId, paramsHash: ph, code, now, lockedUntil: lock });
  // التطبيق: الكود من Google Authenticator مش من الرسالة
  if (row && row.channel === "totp" && verdict === "wrong") verdict = user.totpSecret && verifyTotp(decryptSecret(user.totpSecret), code) ? "ok" : "wrong";
  if (verdict === "wrong" && row) {
    const r = await db.actionCode.update({ where: { id: row.id }, data: { attempts: { increment: 1 } } });
    const until = lockAfterWrong(r.attempts, now);
    if (until) {
      await db.actionLock.upsert({ where: { userId_action: { userId: user.id, action } }, create: { userId: user.id, action, lockedUntil: until }, update: { lockedUntil: until } });
      await notify([user.id], {
        kind: "otp.locked",
        ar: ["محاولات كتير غلط في كود التحقق", "الإجراء اتقفل 15 دقيقة. لو مش إنت اللي بتحاول، كلّمنا فوراً."],
        en: ["Too many wrong verification codes", "The action is locked for 15 minutes. If this wasn't you, contact us now."],
      });
    }
    await audit(user.id, "otp.failed", "Action", action, { dealId, attempts: r.attempts });
  }
  if (verdict !== "ok") return verdict;
  await db.actionCode.update({ where: { id: row!.id }, data: { usedAt: now } });
  const h = await headers().catch(() => null);
  await db.consentRecord.create({
    data: {
      userId: user.id,
      kind: "action",
      action,
      dealId,
      summary: row!.summary,
      sha256: createHash("sha256").update(row!.summary).digest("hex"),
      channel: row!.channel,
      phoneLast4: user.phone.slice(-4),
      otpVerifiedAt: now,
      ip: await clientIp(),
      userAgent: h?.get("user-agent")?.slice(0, 300) ?? null,
    },
  });
  await audit(user.id, "otp.verified", "Action", action, { dealId, channel: row!.channel, summary: row!.summary });
  return "ok";
}

/** للـ server actions: من غير كود صالح ومربوط بنفس الإجراء → يرجع بخطأ */
export async function requireActionCode(user: User, action: ActionKey, dealId: string | null, params: Record<string, unknown>, form: FormData | undefined | null, back: string) {
  const code = String(form?.get("otp_code") ?? "").replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
  const v = await consumeActionCode(user, action, dealId, params, code);
  if (v !== "ok") redirect(`${back}${back.includes("?") ? "&" : "?"}err=otp_${v}`);
}

export const OTP_ERRORS: Record<string, [string, string]> = {
  otp_wrong: ["كود التحقق غلط.", "Wrong verification code."],
  otp_expired: ["كود التحقق خلص — اطلب كود جديد.", "The code expired — request a new one."],
  otp_used: ["الكود ده اتستخدم قبل كده — اطلب كود جديد.", "This code was already used — request a new one."],
  otp_mismatch: ["الكود ده مش للإجراء ده (أو القيم اتغيرت) — اطلب كود جديد.", "This code isn't for this action (or the values changed) — request a new one."],
  otp_missing: ["لازم تطلب كود تأكيد الأول.", "Request a confirmation code first."],
  otp_locked: ["محاولات كتير غلط — الإجراء مقفول 15 دقيقة.", "Too many wrong attempts — locked for 15 minutes."],
};
