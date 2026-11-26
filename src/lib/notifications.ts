import "server-only";
import { db } from "./db";
import { deliver } from "./notify";

export type Message = {
  kind: string;
  ar: [title: string, body?: string];
  en: [title: string, body?: string];
  /** المسار من غير اللغة، مثلاً /deals/abc */
  link?: string;
};

/**
 * إشعار لمستخدم أو أكتر: بيتسجل جوه المنصة دايماً (الجرس في الهيدر)،
 * وبيتبعت واتساب/إيميل لو المزوّد متظبط. أي خطأ في الإرسال ما يوقفش العملية الأصلية.
 */
export async function notify(userIds: (string | null | undefined)[], msg: Message) {
  const ids = [...new Set(userIds.filter((x): x is string => !!x))];
  if (!ids.length) return;
  try {
    const users = await db.user.findMany({ where: { id: { in: ids }, anonymizedAt: null } });
    for (const u of users) {
      const [title, body] = u.locale === "en" ? msg.en : msg.ar;
      const link = msg.link ? `/${u.locale}${msg.link}` : null;
      const sentVia = await deliver(u, title, body ?? null, link).catch(() => null);
      await db.notification.create({ data: { userId: u.id, kind: msg.kind, title, body, link, sentVia } });
    }
  } catch (e) {
    console.error("notify failed", msg.kind, e);
  }
}

/** كل الناس في دور معيّن (مثلاً كل الوسطاء) */
export async function idsByRole(role: "BROKER" | "LAWYER" | "AGENT" | "FINANCE" | "ADMIN") {
  return (await db.user.findMany({ where: { role, anonymizedAt: null }, select: { id: true } })).map((u) => u.id);
}
