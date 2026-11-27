// مراقبة الأخطاء (Sentry) — شغالة بس لما SENTRY_DSN يتظبط. من غيره ما بتعملش أي حاجة.
import * as Sentry from "@sentry/nextjs";

export async function register() {
  // GEO-01: أسماء المدن من الجدول قبل أول طلب (وبعدها بتتحدث كل 30 ثانية من أي شاشة بتقرا المدن)
  if (process.env.NEXT_RUNTIME === "nodejs") {
    try {
      const { allCities } = await import("./lib/cities");
      await allCities(true);
    } catch {
      // قاعدة البيانات مش جاهزة وقت البناء — بتتحمل مع أول طلب
    }
  }
  if (!process.env.SENTRY_DSN) return;
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
    tracesSampleRate: 0.1,
    // ما بنبعتش بيانات شخصية (أرقام، إيميلات، IP) لـ Sentry
    sendDefaultPii: false,
  });
}

export const onRequestError: typeof Sentry.captureRequestError = (...args) => {
  if (process.env.SENTRY_DSN) Sentry.captureRequestError(...args);
};
