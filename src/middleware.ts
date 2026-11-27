import { NextResponse, type NextRequest } from "next/server";
import { SECURITY_HEADERS, buildCsp } from "@/lib/csp";

/** SEC-08: هيدرز الأمان لكل الصفحات (ملفات /api/files ليها هيدرز خاصة بيها ومش داخلة هنا) */
export function middleware(req: NextRequest) {
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
  return res;
}

export const config = {
  matcher: [
    {
      source: "/((?!api/files|_next/static|_next/image|favicon.ico|icon|apple-icon).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
