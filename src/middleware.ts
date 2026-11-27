import { NextResponse, type NextRequest } from "next/server";
import { SECURITY_HEADERS, buildCsp } from "@/lib/csp";
import { isPrivatePath } from "@/lib/meta";

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
  const csp = buildCsp(nonce, { dev: process.env.NODE_ENV !== "production", s3Origin, vercelPreview: process.env.VERCEL_ENV === "preview" });

  // Next.js بياخد الـ nonce من هيدر الطلب ويحطه على سكريبتاته
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const res = NextResponse.next({ request: { headers: requestHeaders } });
  res.headers.set("Content-Security-Policy", csp);
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.headers.set(k, v);
  // UX-08: الصفحات الخاصة noindex حتى لو حد لقى رابطها
  if (isPrivatePath(req.nextUrl.pathname)) res.headers.set("X-Robots-Tag", "noindex, nofollow");
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
