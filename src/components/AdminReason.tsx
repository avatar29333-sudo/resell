/** حقل «سبب تدخّل الأدمن» — بيظهر بس لما الأدمن بيعمل فعل تبع دور تاني (المبدأ 7) */
export function AdminReason({ show, ar }: { show?: boolean; ar: boolean }) {
  if (!show) return null;
  return (
    <input
      name="overrideReason"
      required
      minLength={5}
      placeholder={ar ? "سبب تدخّل الأدمن (إجباري)" : "Admin override reason (required)"}
      aria-label={ar ? "سبب تدخّل الأدمن" : "Admin override reason"}
      className="min-h-9 w-56 border border-[#F0D9A8] bg-[#FDF3E1] px-2 text-sm"
    />
  );
}
