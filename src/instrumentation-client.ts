// أخطاء المتصفح لـ Sentry — بتتحمّل بس لما NEXT_PUBLIC_SENTRY_DSN يتظبط،
// عشان من غيره ما تزودش حجم الصفحة ولا كيلوبايت.
if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  import("@sentry/nextjs").then((Sentry) =>
    Sentry.init({
      dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
      tracesSampleRate: 0.1,
      sendDefaultPii: false,
    }),
  );
}
