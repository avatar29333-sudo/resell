/** نصوص أخطاء الصلاحيات المشتركة (عربي/إنجليزي) — بتظهر لما server action يرجّع ?err=… */
export const AUTHZ_ERRORS: Record<string, [string, string]> = {
  forbidden: ["الفعل ده مش متاح لحسابك.", "This action isn't available to your account."],
  reason_required: ["لازم تكتب سبب التدخّل (5 حروف على الأقل).", "Please write an override reason (at least 5 characters)."],
  note_required: ["لازم ملاحظة واضحة (10 حروف على الأقل).", "A clear note is required (at least 10 characters)."],
  last_admin: ["ما ينفعش تشيل أو توقف آخر أدمن في المنصة.", "You can't demote or suspend the last admin."],
  admin_review: ["الهوية دي اترفضت 3 مرات — القرار دلوقتي للأدمن بس.", "This ID was rejected 3 times — only an admin can decide now."],
  conflict: ["ما ينفعش تسند حد هو طرف في العملية.", "You can't assign someone who is a party."],
  checklist: ["لازم تعلّم على كل بنود المراجعة قبل الاعتماد.", "Tick every checklist item before approving."],
  reauth: ["لازم تأكد هويتك تاني قبل الفعل ده.", "Please confirm your identity again before this action."],
  confirm: ["اكتب التأكيد المطلوب.", "Type the required confirmation."],
  not_verified: ["لازم توثّق هويتك الأول.", "You need to verify your ID first."],
};

export function errorText(code: string | undefined, ar: boolean, extra?: Record<string, [string, string]>) {
  if (!code) return null;
  const t = extra?.[code] ?? AUTHZ_ERRORS[code] ?? AUTHZ_ERRORS.forbidden;
  return t[ar ? 0 : 1];
}
