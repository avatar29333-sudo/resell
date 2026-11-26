import "server-only";

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

export function maskEmail(email: string) {
  const [user, domain] = email.split("@");
  return `${user.slice(0, 2)}•••@${domain}`;
}
