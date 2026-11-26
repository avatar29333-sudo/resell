import Link from "next/link";
import type { User } from "@prisma/client";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";
import { homeFor } from "@/lib/auth";
import { ROLE, label } from "@/lib/labels";
import { signOut } from "@/app/[locale]/auth-actions";
import { Logo } from "./Logo";

type Props = { locale: Locale; t: Dictionary; user: User | null };

export function SiteHeader({ locale, t, user }: Props) {
  const other: Locale = locale === "ar" ? "en" : "ar";
  const base = `/${locale}`;
  const links = [
    { href: `${base}/listings`, label: t.nav.listings },
    { href: `${base}/price-index`, label: t.nav.priceIndex },
    { href: `${base}/rescue`, label: t.nav.rescue },
    { href: `${base}#how`, label: t.nav.howItWorks },
  ];
  const dash = user ? `${base}/${homeFor(user.role)}` : null;
  const ar = locale === "ar";
  const role = user?.role;
  const staffLinks = [
    { href: `${base}/broker`, label: ar ? "لوحة الوسيط" : "Broker", roles: ["ADMIN", "BROKER", "AGENT"] },
    { href: `${base}/lawyer`, label: ar ? "شاشة المحامي" : "Lawyer", roles: ["ADMIN", "LAWYER"] },
    { href: `${base}/reports`, label: ar ? "التقارير" : "Reports", roles: ["ADMIN", "FINANCE", "BROKER"] },
    { href: `${base}/settings`, label: ar ? "الإعدادات" : "Settings", roles: ["ADMIN", "FINANCE"] },
  ].filter((l) => role && l.roles.includes(role));

  return (
    <header className="bg-navy text-white">
      <div className="bg-[#FDF3E1] px-5 py-1.5 text-center text-sm text-[#5C3D00]">{t.demo.banner}</div>
      <div className="mx-auto flex min-h-[68px] max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-3 md:px-8">
        <Link href={base} className="flex items-center gap-3 text-white no-underline">
          <Logo />
          <span className="hidden border-s border-navy-soft ps-3 text-sm text-[#B9C3DE] sm:inline">{t.brand.tagline}</span>
        </Link>

        <nav aria-label={t.nav.menu} className="hidden items-center gap-6 text-[15px] lg:flex">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="text-[#D6DCEE] hover:text-white">
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="flex flex-wrap items-center gap-3 text-[15px]">
          <Link href={`/${other}`} className="text-[#D6DCEE] hover:text-white" hrefLang={other}>
            {t.nav.otherLanguage}
          </Link>
          {user ? (
            <>
              <Link href={dash!} className="flex flex-col px-2 py-1 leading-tight text-white hover:text-[#D6DCEE]">
                <span className="font-semibold">{user.name}</span>
                <span className="text-xs text-[#B9C3DE]">{label(ROLE, user.role, locale)}</span>
              </Link>
              {user.role !== "CLIENT" && (
                <Link href={`${base}/account`} className="text-[#D6DCEE] hover:text-white">
                  {t.nav.account}
                </Link>
              )}
              <form action={signOut.bind(null, locale)}>
                <button type="submit" className="min-h-11 px-2 text-[#D6DCEE] hover:text-white">
                  {t.nav.signOut}
                </button>
              </form>
            </>
          ) : (
            <Link href={`${base}/sign-in`} className="px-2 py-2 text-[#D6DCEE] hover:text-white">
              {t.nav.signIn}
            </Link>
          )}
          <Link
            href={`${base}/list-your-plot`}
            className="inline-flex min-h-11 items-center bg-white px-5 font-semibold text-navy hover:bg-paper"
          >
            {t.nav.listPlot}
          </Link>
        </div>

        {staffLinks.length > 0 && (
          <nav aria-label={locale === "ar" ? "لوحات الفريق" : "Team dashboards"} className="flex w-full flex-wrap gap-1 border-t border-navy-soft pt-2 text-sm">
            {staffLinks.map((l) => (
              <Link key={l.href} href={l.href} className="inline-flex min-h-9 items-center bg-navy-soft px-3 text-[#D6DCEE] hover:text-white">
                {l.label}
              </Link>
            ))}
          </nav>
        )}

        <details className="w-full lg:hidden">
          <summary className="flex min-h-11 cursor-pointer items-center text-[#D6DCEE]">{t.nav.menu}</summary>
          <nav aria-label={t.nav.menu} className="flex flex-col gap-1 pb-2">
            {links.map((l) => (
              <Link key={l.href} href={l.href} className="min-h-11 py-2 text-[#D6DCEE] hover:text-white">
                {l.label}
              </Link>
            ))}
          </nav>
        </details>
      </div>
    </header>
  );
}
