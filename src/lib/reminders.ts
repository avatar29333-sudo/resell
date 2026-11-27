/** MKT-04 — تنبيهات المهلة قبل النهاية بـ 90 / 30 / 7 أيام (منطق نقي، متغطي باختبار) */
const DAY = 86_400_000;

export type ReminderStage = 90 | 30 | 7;

/** أقرب تنبيه مستحق ولسه ما اتبعتش (لو بقى فاضل 7 أيام والتنبيهات اللي قبله ما اتبعتتش، بنبعت الأقرب بس) */
export function dueStage(deadline: Date, now: Date, sent: { sent90At?: Date | null; sent30At?: Date | null; sent7At?: Date | null }): ReminderStage | null {
  const days = Math.ceil((deadline.getTime() - now.getTime()) / DAY);
  if (days < 0) return null;
  if (days <= 7) return sent.sent7At ? null : 7;
  if (days <= 30) return sent.sent30At ? null : 30;
  if (days <= 90) return sent.sent90At ? null : 90;
  return null;
}

export function reminderText(stage: ReminderStage, locale: string, city: string, unsub: string) {
  return locale === "en"
    ? `Resell: your Beit El Watan build deadline in ${city} is in ${stage} days. See your options (extension, extra floor or selling): resell /rescue — Stop reminders: ${unsub}`
    : `Resell: مهلة بناء قطعتك في ${city} فاضل عليها ${stage} يوم. شوف اختياراتك (مد المهلة، دور زيادة، أو البيع) من صفحة «إنقاذ المهلة». لإيقاف التنبيهات: ${unsub}`;
}
