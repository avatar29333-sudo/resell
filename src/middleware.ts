import { NextResponse, type NextRequest } from "next/server";
import { SECURITY_HEADERS, buildCsp } from "@/lib/csp";
import { isPrivatePath } from "@/lib/meta";
import { analyticsCsp } from "@/lib/analytics";
import { FT_COOKIE, LT_COOKIE, REF_COOKIE, REF_MAX_AGE, TOUCH_MAX_AGE, encodeTouch, touchFrom } from "@/lib/attribution-core";

/** SEC-08: هيدرز الأمان لكل الصفحات (ملفات /api/files ليها هيدرز خاصة بيها ومش داخلة هنا) */
export function middleware(req: NextRequest) {
  // UX-11: مسار من غير لغة (مثلاً /xyz) → /ar/xyz عشان يطلع بصفحة الموقع (404 عربي لو مش موجود)
  const first = req.nextUrl.pathname.split("/")[1] ?? "";
  if (first && first !== "ar" && first !== "en" && first !== "api" && !first.includes(".")) {
    const url = req.nextUrl.clone();
    url.pathname = `/ar${req.nextUrl.pathname}`;
    return NextResponse.redirect(url);
  }
  const nonce = btoa(crypto.randomUUID());
  let s3Origin: string | null = null;
  try {
    s3Origin = process.env.S3_ENDPOINT ? new URL(process.env.S3_ENDPOINT).origin : null;
  } catch {
    s3Origin = null;
  }
  const csp = buildCsp(nonce, { dev: process.env.NODE_ENV !== "production", s3Origin, vercelPreview: process.env.VERCEL_ENV === "preview", analytics: analyticsCsp() });

  // Next.js بياخد الـ nonce من هيدر الطلب ويحطه على سكريبتاته
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const res = NextResponse.next({ request: { headers: requestHeaders } });
  res.headers.set("Content-Security-Policy", csp);
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.headers.set(k, v);
  // UX-08: الصفحات الخاصة noindex حتى لو حد لقى رابطها
  if (isPrivatePath(req.nextUrl.pathname)) res.headers.set("X-Robots-Tag", "noindex, nofollow");

  // MKT-10: أول لمسة وآخر لمسة (utm + الموقع اللي جه منه + كود الإحالة) — كوكي من نفس الموقع بس
  const touch = req.method === "GET" ? touchFrom(req.nextUrl, req.headers.get("referer"), req.nextUrl.hostname) : null;
  if (touch) {
    const opts = { httpOnly: true, sameSite: "lax" as const, secure: req.nextUrl.protocol === "https:", path: "/", maxAge: TOUCH_MAX_AGE };
    if (!req.cookies.get(FT_COOKIE)) res.cookies.set(FT_COOKIE, encodeTouch(touch), opts);
    res.cookies.set(LT_COOKIE, encodeTouch(touch), opts);
    // MKT-06: كود الإحالة بيفضل 60 يوم
    if (touch.ref) res.cookies.set(REF_COOKIE, touch.ref, { ...opts, maxAge: REF_MAX_AGE });
  }
  return res;
}

export const config = {
  matcher: [
    {
      source: "/((?!api/files|_next/static|_next/image|favicon.ico|icon|apple-icon|sitemap.xml|robots.txt).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
