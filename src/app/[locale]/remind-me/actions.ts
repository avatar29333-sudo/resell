"use server";

import type { City } from "@prisma/client";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { isValidPhone, normalizePhone } from "@/lib/format";
import { CITY, CITY_KEYS } from "@/lib/labels";
import { readAttribution } from "@/lib/attribution";
import { newToken, queueMessage, unsubscribeUrl } from "@/lib/outbox";

export type RemindState = { ok?: boolean; error?: string; fieldErrors?: Partial<Record<"phone" | "city" | "deadline" | "consent", string>> };

/** MKT-04: «فكّرني بمهلتي» — رقم واتساب + مدينة + تاريخ نهاية المهلة، بموافقة صريحة */
export async function subscribeReminder(locale: string, _p: RemindState, form: FormData): Promise<RemindState> {
  const ar = locale !== "en";
  const phone = normalizePhone(String(form.get("phone") ?? ""));
  const city = String(form.get("city") ?? "");
  const deadlineRaw = String(form.get("deadline") ?? "");
  const deadline = /^\d{4}-\d{2}-\d{2}$/.test(deadlineRaw) ? new Date(`${deadlineRaw}T00:00:00Z`) : null;
  const fe: RemindState["fieldErrors"] = {};
  if (!isValidPhone(phone)) fe.phone = ar ? "رقم الواتساب مش صحيح — اكتبه بكود الدولة" : "Invalid WhatsApp number — include the country code";
  if (!CITY_KEYS.includes(city as never)) fe.city = ar ? "اختار المدينة" : "Choose the city";
  if (!deadline || deadline.getTime() < Date.now() - 86_400_000) fe.deadline = ar ? "اكتب تاريخ نهاية المهلة (النهارده أو بعده)" : "Enter the deadline date (today or later)";
  // الموافقة لازم تكون صريحة — الخانة مش متعلّمة من الأول
  if (form.get("consent") !== "on") fe.consent = ar ? "لازم توافق على استلام التنبيهات" : "Please agree to receive reminders";
  if (Object.keys(fe).length) return { error: ar ? "راجع الخانات المعلّمة" : "Please check the highlighted fields", fieldErrors: fe };

  const token = newToken();
  const source = await readAttribution();
  const r = await db.deadlineReminder.create({
    data: {
      phone,
      city: city as City,
      deadline: deadline!,
      plotCode: String(form.get("plotCode") ?? "").trim().slice(0, 30) || null,
      locale: ar ? "ar" : "en",
      consentAt: new Date(),
      unsubToken: token,
      ...(source ? { source } : {}),
    },
  });
  await audit(null, "reminder.subscribe", "DeadlineReminder", r.id, { city });
  const unsub = unsubscribeUrl(locale, token);
  await queueMessage(
    "whatsapp",
    phone,
    "reminder.welcome",
    ar
      ? `Resell: هنفكّرك بمهلة قطعتك في ${CITY[city][0]} قبلها بـ 90 و30 و7 أيام، ولو صدر قرار تسهيلات جديد. لإيقاف التنبيهات: ${unsub}`
      : `Resell: we'll remind you about your ${CITY[city][1]} deadline 90, 30 and 7 days before, and when new relief is announced. Stop reminders: ${unsub}`,
  );
  return { ok: true };
}
