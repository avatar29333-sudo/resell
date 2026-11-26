import "server-only";
import type { User } from "@prisma/client";

export type Channel = "whatsapp" | "email";

/**
 * إرسال رمز الدخول. لحد ما مزوّد واتساب (WHATSAPP_TOKEN) ومزوّد الإيميل (EMAIL_API_KEY)
 * يتظبطوا، الرمز بيرجع عشان يتعرض على الشاشة (الوضع التجريبي).
 */
export async function sendCode(channel: Channel, to: string, code: string): Promise<{ shownOnScreen: string | null }> {
  if (channel === "whatsapp" && process.env.WHATSAPP_TOKEN) {
    // TODO: قالب واتساب «رمز الدخول» عبر WhatsApp Business Cloud API
    return { shownOnScreen: null };
  }
  if (channel === "email" && process.env.EMAIL_API_KEY) {
    // TODO: إيميل الرمز عبر مزوّد الإيميل
    return { shownOnScreen: null };
  }
  void to;
  return { shownOnScreen: code };
}

/**
 * إرسال إشعار برّه المنصة. بيرجّع القناة اللي اتبعت عليها، أو null لو مفيش مزوّد متظبط
 * (الإشعار بيفضل ظاهر جوه المنصة في الحالتين).
 */
export async function deliver(user: User, title: string, body: string | null, link: string | null): Promise<Channel | null> {
  const url = link && process.env.NEXT_PUBLIC_SITE_URL ? `${process.env.NEXT_PUBLIC_SITE_URL}${link}` : null;
  void url;
  void body;
  void title;
  if (process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID) {
    // TODO: قالب واتساب «تحديث صفقة» — بيتفعّل مع ربط حساب WhatsApp Business
    return null;
  }
  if (process.env.EMAIL_API_KEY && user.email) {
    // TODO: إيميل الإشعار عبر مزوّد الإيميل
    return null;
  }
  return null;
}

export function maskEmail(email: string) {
  const [user, domain] = email.split("@");
  return `${user.slice(0, 2)}•••@${domain}`;
}
