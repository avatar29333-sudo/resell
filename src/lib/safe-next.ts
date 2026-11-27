/**
 * UX-03 — الرجوع للصفحة المطلوبة بعد الدخول، من غير open redirect:
 * مسار داخلي بس يبدأ بـ /<اللغة>/، من غير // ولا \ ولا بروتوكول ولا أسطر جديدة.
 */
export function safeNext(locale: string, next: string | null | undefined): string | null {
  if (!next) return null;
  let decoded = next;
  try {
    decoded = decodeURIComponent(next);
  } catch {
    return null;
  }
  for (const s of [next, decoded]) {
    if (!s.startsWith(`/${locale}/`) && s !== `/${locale}`) return null;
    if (s.startsWith("//") || s.includes("\\") || /[\r\n\t]/.test(s) || /^\/[^/]*:/.test(s)) return null;
  }
  if (next.includes("/sign-in")) return null;
  return next;
}
