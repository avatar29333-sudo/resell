/**
 * SEC-08 — سياسة أمان المحتوى (CSP) للصفحات. السكريبتات بـ nonce لكل طلب + strict-dynamic،
 * فأي سكريبت متحقن من برّه ما يشتغلش. الصور: الموقع نفسه + خرائط OpenStreetMap + خزنة الملفات (R2/S3).
 */
export function buildCsp(nonce: string, opts: { dev?: boolean; s3Origin?: string | null; vercelPreview?: boolean } = {}) {
  const files = ["https://*.r2.cloudflarestorage.com", opts.s3Origin].filter(Boolean).join(" ");
  // شريط تعليقات Vercel بيظهر في نسخ المعاينة (preview) بس — مش في الموقع الحقيقي
  const live = opts.vercelPreview ? " https://vercel.live" : "";
  const directives: Record<string, string> = {
    "default-src": "'self'",
    "script-src": `'self' 'nonce-${nonce}' 'strict-dynamic'${opts.dev ? " 'unsafe-eval'" : ""}`,
    // Tailwind والخرايط (Leaflet) بيستخدموا style inline
    "style-src": "'self' 'unsafe-inline'",
    "img-src": `'self' data: blob: https://*.tile.openstreetmap.org ${files}`,
    "font-src": "'self'",
    "connect-src": `'self' https://*.ingest.sentry.io https://*.ingest.de.sentry.io${opts.dev ? " ws:" : ""}`,
    // عارض الـ PDF جوه شاشة المحامي (نفس الموقع أو الخزنة)
    "frame-src": `'self' ${files}${live}`,
    "object-src": "'none'",
    "base-uri": "'self'",
    "form-action": "'self'",
    "frame-ancestors": "'none'",
    ...(opts.dev ? {} : { "upgrade-insecure-requests": "" }),
  };
  return Object.entries(directives)
    .map(([k, v]) => `${k} ${v}`.trim())
    .join("; ");
}

export const SECURITY_HEADERS: Record<string, string> = {
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  // الكاميرا للصورة الشخصية في التوثيق، والموقع لصور المعاينة (OPS-02) — من الموقع نفسه بس
  "Permissions-Policy": "camera=(self), geolocation=(self), microphone=(), payment=(), usb=(), interest-cohort=()",
};
