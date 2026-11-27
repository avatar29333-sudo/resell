import "server-only";
import { randomBytes } from "node:crypto";
import { db } from "./db";
import { siteUrl } from "./meta";

/**
 * رسايل برّه المنصة (واتساب، وإيميل احتياطي). كل رسالة بتتسجل في OutboundMessage؛
 * لما مزوّد واتساب (قالب معتمد من Meta) أو الإيميل يتظبط، الإرسال الفعلي بيتعمل هنا.
 * لحد كده الحالة بتفضل QUEUED وتتعرض للأدمن في لوحة التسويق.
 */
export async function queueMessage(channel: "whatsapp" | "email", to: string, kind: string, body: string) {
  const status = (channel === "whatsapp" && process.env.WHATSAPP_TOKEN) || (channel === "email" && process.env.EMAIL_API_KEY) ? "READY" : "QUEUED";
  return db.outboundMessage.create({ data: { channel, to, kind, body, status } });
}

/** حد أقصى رسالة واحدة في اليوم لنفس الشخص ونفس النوع (MKT-13) */
export async function sentToday(to: string, kind: string, now = new Date()) {
  const since = new Date(now.getTime() - 24 * 3600_000);
  return (await db.outboundMessage.count({ where: { to, kind, createdAt: { gte: since } } })) > 0;
}

export const newToken = () => randomBytes(18).toString("base64url");

/** رابط الإيقاف اللي بيتحط في آخر كل رسالة */
export const unsubscribeUrl = (locale: string, token: string) => `${siteUrl()}/${locale === "en" ? "en" : "ar"}/unsubscribe?t=${token}`;
