// الوضع التجريبي (SEC-01): متغير واحد DEMO_MODE، والافتراضي مقفول.
// مقفول = مفيش رمز على الشاشة، ومفيش «دخول سريع»، والـ action بتاعه بيرفض في السيرفر.
export function isDemoMode(env: Record<string, string | undefined> = process.env) {
  return env.DEMO_MODE === "true";
}
