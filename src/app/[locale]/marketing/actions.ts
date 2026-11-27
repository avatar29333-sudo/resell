"use server";

import { allCities } from "@/lib/cities";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
/** GEO-01: المدينة = مفتاح نصي من جدول المدن */
type City = string;
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requireUser } from "@/lib/auth";
import { CITY_KEYS } from "@/lib/labels";
import { queueMessage, unsubscribeUrl } from "@/lib/outbox";
import { isLocale } from "@/i18n/config";

const page = (l: string) => `/${isLocale(l) ? l : "ar"}/marketing`;

/** MKT-04: الأدمن يبعت تنبيه «قرار تسهيلات جديد» لكل المشتركين في مدينة (كل رسالة فيها رابط إيقاف) */
export async function broadcastRelief(locale: string, form: FormData) {
  await allCities(); // GEO-01: قايمة المدن من الجدول
  const l = isLocale(locale) ? locale : "ar";
  const me = await requireUser(l, page(l), ["ADMIN"]);
  const city = String(form.get("city") ?? "");
  const textAr = String(form.get("textAr") ?? "").trim();
  const textEn = String(form.get("textEn") ?? "").trim() || textAr;
  if (!CITY_KEYS.includes(city as never) || textAr.length < 20) redirect(`${page(l)}?err=broadcast`);
  const subs = await db.deadlineReminder.findMany({ where: { city: city as City, unsubscribedAt: null } });
  for (const s of subs) {
    const unsub = unsubscribeUrl(s.locale, s.unsubToken);
    await queueMessage("whatsapp", s.phone, "reminder.relief", `${s.locale === "en" ? textEn : textAr} — ${s.locale === "en" ? "Stop alerts" : "لإيقاف التنبيهات"}: ${unsub}`);
  }
  await audit(me.id, "reminder.broadcast", "City", city, { count: subs.length });
  revalidatePath(page(l));
  redirect(`${page(l)}?ok=broadcast&n=${subs.length}`);
}

/** MKT-14: الأدمن بيراجع وينشر قصة (بس لو الطرفين وافقوا) أو يرفضها */
export async function reviewStory(locale: string, id: string, form: FormData) {
  const l = isLocale(locale) ? locale : "ar";
  const me = await requireUser(l, page(l), ["ADMIN"]);
  const s = await db.dealStory.findUnique({ where: { id } });
  if (!s) redirect(page(l));
  const publish = form.get("decision") === "publish";
  if (publish && !(s!.buyerConsentAt && s!.sellerConsentAt)) redirect(`${page(l)}?err=story`);
  const textAr = String(form.get("textAr") ?? "").trim().slice(0, 500);
  const textEn = String(form.get("textEn") ?? "").trim().slice(0, 500);
  await db.dealStory.update({
    where: { id },
    data: publish ? { status: "PUBLISHED", textAr, textEn, reviewedById: me.id, publishedAt: new Date() } : { status: "REJECTED", reviewedById: me.id, publishedAt: null },
  });
  await audit(me.id, publish ? "story.publish" : "story.reject", "DealStory", id, {});
  revalidatePath(page(l));
  revalidatePath(`/${l}`);
  redirect(`${page(l)}?ok=story`);
}

/** MKT-12: مصروف حملة في شهر (إدخال يدوي) */
export async function saveSpend(locale: string, form: FormData) {
  const l = isLocale(locale) ? locale : "ar";
  const me = await requireUser(l, page(l), ["ADMIN"]);
  const channel = String(form.get("channel") ?? "").trim().slice(0, 80);
  const month = String(form.get("month") ?? "");
  const amount = Number(form.get("amount"));
  if (!channel || !/^\d{4}-\d{2}$/.test(month) || !(amount >= 0)) redirect(`${page(l)}?err=spend`);
  await db.campaignSpend.upsert({ where: { channel_month: { channel, month } }, create: { channel, month, amountEgp: amount, enteredById: me.id }, update: { amountEgp: amount, enteredById: me.id } });
  await audit(me.id, "marketing.spend", "CampaignSpend", `${channel}:${month}`, { amount });
  revalidatePath(page(l));
  redirect(`${page(l)}?ok=spend`);
}
