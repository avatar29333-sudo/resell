"use client";

import { useRef, useState, type ReactNode } from "react";
import { requestCode } from "@/app/otp/actions";

/**
 * DEAL-03: أي موافقة من البائع أو المشتري جوه الصفقة → ملخص واضح، بعدين «أرسل كود التأكيد»، بعدين الكود.
 * الكود مربوط بالإجراء ده بالذات (والقيم المكتوبة في الفورم وقت الطلب). كل إجراء ليه كوده.
 */
export function OtpConfirm({
  locale,
  action,
  subjectId,
  fields = [],
  preview,
  submitLabel,
  formAction,
  children,
  className = "",
  submitClass = "inline-flex min-h-11 items-center bg-brand px-4 font-semibold text-white",
}: {
  locale: string;
  action: string;
  subjectId: string | null;
  /** أسماء حقول الفورم اللي بتتربط بالكود (مثلاً price أو contractId) */
  fields?: string[];
  /** ملخص مبدئي للعرض قبل طلب الكود */
  preview: string;
  submitLabel: string;
  formAction: (f: FormData) => void;
  children?: ReactNode;
  className?: string;
  submitClass?: string;
}) {
  const ar = locale !== "en";
  const L = (a: string, e: string) => (ar ? a : e);
  const form = useRef<HTMLFormElement>(null);
  const [step, setStep] = useState<"summary" | "code">("summary");
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<{ summary?: string; channel?: string; demoCode?: string | null; error?: string }>({});
  const ERR: Record<string, string> = {
    locked: L("محاولات كتير غلط — استنى 15 دقيقة.", "Too many wrong attempts — wait 15 minutes."),
    rate: L("طلبت أكواد كتير — أقصى حد 5 في الساعة.", "Too many codes — at most 5 per hour."),
    forbidden: L("الإجراء ده مش متاح لحسابك.", "This action isn't available to your account."),
    action: L("حصل خطأ — جرّب تاني.", "Something went wrong — try again."),
  };

  async function send() {
    const fd = form.current ? new FormData(form.current) : new FormData();
    const values = Object.fromEntries(fields.map((f) => [f, String(fd.get(f) ?? "")]));
    setBusy(true);
    const r = await requestCode(locale, action, subjectId, values);
    setBusy(false);
    if (r.ok) {
      setInfo(r);
      setStep("code");
    } else setInfo({ error: ERR[r.error ?? "action"] ?? ERR.action });
  }

  return (
    <form ref={form} action={formAction} className={`flex flex-col gap-2 ${className}`}>
      {children}
      <div className="flex flex-col gap-2 border border-[#C9D6F2] bg-[#EEF3FC] p-3 text-sm">
        <span className="font-semibold">{L("هتوافق على:", "You're approving:")}</span>
        <span>{info.summary ?? preview}</span>
        {step === "summary" ? (
          <>
            {info.error && <span role="alert" className="font-semibold text-[#A32020]">{info.error}</span>}
            <button type="button" onClick={send} disabled={busy} className="inline-flex min-h-11 items-center self-start border border-brand bg-white px-4 font-semibold text-brand disabled:opacity-50">
              {busy ? L("بنبعت…", "Sending…") : L("أرسل كود التأكيد", "Send confirmation code")}
            </button>
          </>
        ) : (
          <>
            <span className="text-muted">{L(`بعتنا الكود على ${info.channel}. صالح 5 دقايق ولمرة واحدة.`, `We sent the code by ${info.channel}. Valid for 5 minutes, once.`)}</span>
            {info.demoCode && <span className="font-semibold text-[#8A5A00]">{L(`وضع تجريبي — الكود: ${info.demoCode}`, `Demo mode — code: ${info.demoCode}`)}</span>}
            <label className="flex flex-col gap-1">
              {L("كود التأكيد", "Confirmation code")}
              <input name="otp_code" required inputMode="numeric" autoComplete="one-time-code" pattern="[0-9٠-٩]{6}" maxLength={6} dir="ltr" className="min-h-11 w-40 border border-line px-2 text-lg tracking-widest" />
            </label>
            <div className="flex flex-wrap gap-2">
              <button className={submitClass}>{submitLabel}</button>
              <button type="button" onClick={() => { setStep("summary"); setInfo({}); }} className="min-h-11 px-3 text-brand underline">
                {L("كود جديد", "New code")}
              </button>
            </div>
          </>
        )}
      </div>
    </form>
  );
}
