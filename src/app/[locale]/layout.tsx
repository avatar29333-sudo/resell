import { allCities } from "@/lib/cities";
import type { ReactNode } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { IBM_Plex_Sans_Arabic } from "next/font/google";
import "../globals.css";
import { dirOf, isLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { LocalizedValidity } from "@/components/LocalizedValidity";
import { siteUrl } from "@/lib/meta";
import { ConsentBanner } from "@/components/Analytics";
import { getSetting } from "@/lib/settings";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

const plex = IBM_Plex_Sans_Arabic({
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-plex",
  display: "swap",
});

type Params = Promise<{ locale: string }>;

// كل الصفحات بتتعرض وقت الطلب: فيها بيانات حية وحالة الدخول
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = getDictionary(locale);
  // UX-08: كل صفحة بتحط عنوانها، والقالب بيضيف « · Resell»
  return {
    metadataBase: new URL(siteUrl()),
    title: { default: t.meta.title, template: "%s · Resell" },
    description: t.meta.description,
    alternates: { languages: { ar: "/ar", en: "/en" } },
    openGraph: { siteName: "Resell", locale: locale === "ar" ? "ar_EG" : "en_US", type: "website" },
  };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Params;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = getDictionary(locale);
  // GEO-01: تحديث خرايط المدن (كاش 30 ثانية)
  await allCities();
  const user = await getCurrentUser();
  const unread = user ? await db.notification.count({ where: { userId: user.id, readAt: null } }) : 0;

  return (
    <html lang={locale} dir={dirOf(locale)} className={plex.variable}>
      <body className="flex min-h-screen flex-col bg-white">
        <SiteHeader locale={locale} t={t} user={user} unread={unread} />
        <main className="flex-1">{children}</main>
        <SiteFooter t={t} locale={locale} regNo={(await getSetting("brokerRegistrationNumber")).value} />
        <LocalizedValidity locale={locale} />
        <ConsentBanner ar={locale === "ar"} />
      </body>
    </html>
  );
}
