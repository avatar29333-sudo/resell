import type { Metadata } from "next";

/** UX-08: عنوان الصفحة بالعربي أو الإنجليزي (الـ layout بيضيف « · Resell») */
export async function pageMeta(params: Promise<{ locale: string }>, ar: string, en: string, opts: { description?: [string, string]; noindex?: boolean } = {}): Promise<Metadata> {
  const { locale } = await params;
  const isAr = locale !== "en";
  return {
    title: isAr ? ar : en,
    ...(opts.description ? { description: isAr ? opts.description[0] : opts.description[1] } : {}),
    ...(opts.noindex ? { robots: { index: false, follow: false } } : {}),
  };
}

/** رابط الموقع الأساسي (للـ sitemap و Open Graph) */
export function siteUrl() {
  const u = process.env.NEXT_PUBLIC_SITE_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000");
  return u.replace(/\/$/, "");
}

/** الصفحات الخاصة: ما تتأرشفش في محركات البحث */
export const PRIVATE_PREFIXES = ["account", "deals", "broker", "agent", "lawyer", "finance", "reports", "settings", "notifications", "sign-in", "list-your-plot"];

export function isPrivatePath(pathname: string) {
  const seg = pathname.split("/").filter(Boolean);
  return seg[0] === "api" || (["ar", "en"].includes(seg[0]) && PRIVATE_PREFIXES.includes(seg[1] ?? "")) || pathname.endsWith("/report");
}
