"use client";

import { useState } from "react";

type Item = { key: string; ar: string; en: string };

/**
 * فورم مراجعة المحامي (SEC-02): «اعتماد» مقفول لحد ما كل البنود تتعلّم،
 * والرفض/طلب التعديل محتاجين ملاحظة ≥ 10 حروف، وفيه تأكيد قبل أي قرار.
 * السيرفر بيفحص نفس القواعد تاني (review-rules.ts).
 */
export function ReviewForm({ action, items, ar, adminReason }: { action: (f: FormData) => void; items: Item[]; ar: boolean; adminReason?: boolean }) {
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [notes, setNotes] = useState("");
  const allTicked = items.length > 0 && items.every((i) => checked[i.key]);
  const noteOk = notes.trim().length >= 10;
  const L = (a: string, e: string) => (ar ? a : e);

  function confirmSubmit(e: React.FormEvent<HTMLFormElement>) {
    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const d = submitter?.value;
    const msg =
      d === "APPROVED"
        ? L("متأكد إنك عايز تعتمد المستند ده؟", "Approve this document?")
        : d === "REJECTED"
          ? L("متأكد إنك عايز ترفض المستند ده؟", "Reject this document?")
          : L("تبعت طلب تعديل لصاحب المستند؟", "Send a change request to the owner?");
    if (!window.confirm(msg)) e.preventDefault();
  }

  return (
    <form action={action} onSubmit={confirmSubmit} className="flex flex-col gap-2">
      <fieldset className="flex flex-col gap-1">
        <legend className="mb-1 text-sm font-semibold">{L("بنود المراجعة (كلها مطلوبة للاعتماد)", "Checklist (all required to approve)")}</legend>
        {items.map((it) => (
          <label key={it.key} className="flex min-h-9 items-center gap-2 text-sm">
            <input type="checkbox" name={`c_${it.key}`} className="size-4" checked={!!checked[it.key]} onChange={(e) => setChecked((c) => ({ ...c, [it.key]: e.target.checked }))} />
            {ar ? it.ar : it.en}
          </label>
        ))}
      </fieldset>
      <label className="flex flex-col gap-1 text-sm">
        <span>{L("ملاحظات (إجبارية للرفض أو طلب التعديل — 10 حروف على الأقل)", "Notes (required to reject or request changes — 10+ characters)")}</span>
        <textarea name="notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="border border-line px-2 py-1.5" />
      </label>
      {adminReason && (
        <input aria-label={L("سبب تدخّل الأدمن (إجباري)", "Admin override reason (required)")} name="overrideReason" required minLength={5} placeholder={L("سبب تدخّل الأدمن (إجباري)", "Admin override reason (required)")} className="min-h-9 border border-[#F0D9A8] bg-[#FDF3E1] px-2 text-sm" />
      )}
      <div className="flex flex-wrap gap-2">
        <button name="decision" value="APPROVED" disabled={!allTicked} className="inline-flex min-h-9 items-center bg-ok px-3 text-sm font-semibold text-white disabled:opacity-40">
          {L("اعتماد", "Approve")}
        </button>
        <button name="decision" value="CHANGES_REQUESTED" disabled={!noteOk} className="inline-flex min-h-9 items-center border border-[#8A5A00] px-3 text-sm font-semibold text-[#8A5A00] disabled:opacity-40">
          {L("طلب تعديل", "Request changes")}
        </button>
        <button name="decision" value="REJECTED" disabled={!noteOk} className="inline-flex min-h-9 items-center border border-[#A32020] px-3 text-sm font-semibold text-[#A32020] disabled:opacity-40">
          {L("رفض", "Reject")}
        </button>
      </div>
    </form>
  );
}
