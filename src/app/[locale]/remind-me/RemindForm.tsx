"use client";

import type { Locale } from "@/i18n/config";
import { tr } from "@/lib/format";
import type { CityOption } from "@/lib/cities";
import { Notice, btn, field, labelCls } from "@/components/ui";
import { useKeptAction } from "@/components/useKeptAction";
import { subscribeReminder, type RemindState } from "./actions";

export function RemindForm({ locale, cities }: { locale: Locale; cities: CityOption[]; }) {
  const L = tr(locale);
  const [state, onSubmit, pending] = useKeptAction((p: RemindState, f: FormData) => subscribeReminder(locale, p, f), {} as RemindState);
  const fe = state.fieldErrors ?? {};
  const Err = ({ k }: { k: keyof typeof fe }) => (fe[k] ? <span role="alert" className="text-sm font-semibold text-[#A32020]">{fe[k]}</span> : null);
  if (state.ok)
    return (
      <Notice tone="green">
        {L("تمام — هنبعت لك على واتساب قبل المهلة بـ 90 و30 و7 أيام. كل رسالة فيها رابط إيقاف.", "Done — we'll message you on WhatsApp 90, 30 and 7 days before your deadline. Every message has a stop link.")}
      </Notice>
    );
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3.5 border border-line p-6">
      {state.error && (
        <p role="alert" className="border border-[#EFC4C4] bg-[#FBEAEA] px-3 py-2 text-[#A32020]">
          {state.error}
        </p>
      )}
      <label className={labelCls}>
        {L("رقم الواتساب", "WhatsApp number")}
        <input name="phone" type="tel" required dir="ltr" placeholder="+966 5x xxx xxxx" className={`${field} text-start`} />
        <Err k="phone" />
      </label>
      <div className="grid gap-3.5 sm:grid-cols-2">
        <label className={labelCls}>
          {L("المدينة", "City")}
          <select name="city" className={field}>
            {cities.map((c) => (
              <option key={c.id} value={c.id}>
                {locale === "ar" ? c.nameAr : c.nameEn}
              </option>
            ))}
          </select>
          <Err k="city" />
        </label>
        <label className={labelCls}>
          {L("تاريخ نهاية المهلة", "Deadline date")}
          <input name="deadline" type="date" required className={field} />
          <Err k="deadline" />
        </label>
      </div>
      <label className={labelCls}>
        {L("كود القطعة (اختياري)", "Plot code (optional)")}
        <input name="plotCode" dir="ltr" className={`${field} text-start`} />
      </label>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="consent" className="mt-1 size-5 shrink-0" />
        <span>{L("موافق إن Resell تبعتلي تنبيهات المهلة وقرارات التسهيلات الجديدة على واتساب. أقدر أوقفها في أي وقت من الرابط اللي في الرسالة.", "I agree that Resell may send me deadline reminders and new relief decisions on WhatsApp. I can stop them any time from the link in each message.")}</span>
      </label>
      <Err k="consent" />
      <button type="submit" disabled={pending} className={btn.primary}>
        {pending ? L("بنسجّل…", "Saving…") : L("فكّرني بمهلتي", "Remind me")}
      </button>
    </form>
  );
}
