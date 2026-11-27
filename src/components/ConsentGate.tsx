"use client";

import { useState } from "react";
import { OtpConfirm } from "./OtpConfirm";

/**
 * CON-03 — ConsentGate (Clickwrap + كود): النص كامل قابل للتمرير، مربع غير متعلّم افتراضياً،
 * وزرار الكود مقفول لحد ما المربع يتعلّم. الموافقة مع الكود تُعد توقيعاً.
 */
export function ConsentGate({
  locale,
  title,
  version,
  text,
  action,
  subjectId,
  fields,
  hidden,
  formAction,
  submitLabel,
}: {
  locale: string;
  title: string;
  version: number | string;
  text: string;
  action: string;
  subjectId: string | null;
  fields: string[];
  hidden: Record<string, string>;
  formAction: (f: FormData) => void;
  submitLabel?: string;
}) {
  const ar = locale !== "en";
  const [checked, setChecked] = useState(false);
  const v = String(version).startsWith("v") ? String(version) : `v${version}`;
  return (
    <div className="flex flex-col gap-2">
      <div tabIndex={0} aria-label={ar ? `نص ${title}` : `${title} text`} dir="rtl" className="max-h-72 overflow-auto border border-line bg-paper p-3 text-sm leading-7 whitespace-pre-wrap">
        {text}
      </div>
      <OtpConfirm
        locale={locale}
        action={action}
        subjectId={subjectId}
        fields={fields}
        preview={ar ? `موافقتك على ${title} (نسخة ${v})` : `Your consent to the ${title} (version ${v})`}
        submitLabel={submitLabel ?? (ar ? "أوافق وأرسل للمراجعة" : "I agree — submit")}
        formAction={formAction}
        disabled={!checked}
      >
        {Object.entries(hidden).map(([k, val]) => (
          <input key={k} type="hidden" name={k} value={val} />
        ))}
        <label className="flex items-start gap-2 text-sm leading-6">
          <input type="checkbox" name="agree" required checked={checked} onChange={(e) => setChecked(e.target.checked)} className="mt-1 size-5 shrink-0" />
          <span>
            {ar
              ? `قرأت نموذج «${title}» (نسخة ${v}) وأوافق عليه، وأقرّ بصحة البيانات الواردة فيه، وأعلم أن هذه الموافقة مع كود التحقق تُعد توقيعاً مني.`
              : `I have read the “${title}” (version ${v}) and agree to it, I confirm the data in it is correct, and I understand that this consent together with the verification code counts as my signature.`}
          </span>
        </label>
      </OtpConfirm>
    </div>
  );
}
