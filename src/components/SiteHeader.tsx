import Link from "next/link";
import type { User } from "@prisma/client";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";
import { homeFor } from "@/lib/auth";
import { ROLE, label } from "@/lib/labels";
import { signOut } from "@/app/[locale]/auth-actions";
import { Logo } from "./Logo";
import { MobileMenu } from "./MobileMenu";

type Props = { locale: Locale; t: Dictionary; user: User | null; unread?: number };

function Bell({ href, unread, ar }: { href: string; unread: number; ar: boolean }) {
  return (
    <Link
      href={href}
      aria-label={`${ar ? "الإشعارات" : "Notifications"}${unread ? ` (${unread})` : ""}`}
      className="relative inline-flex min-h-11 min-w-11 items-center justify-center text-[#D6DCEE] hover:text-white"
    >
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
        <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0" />
      </svg>
      {unread > 0 && <span className="absolute top-1 end-0 min-w-5 bg-[#D9480F] px-1 text-center text-xs font-bold text-white">{unread > 99 ? "99+" : unread}</span>}
    </Link>
  );
}

export function SiteHeader({ locale, t, user, unread = 0 }: Props) {
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
    { href: `${base}/broker`, label: ar ? "لوحة الوسيط" : "Broker", roles: ["ADMIN", "BROKER", "BROKER_LEAD"] },
    { href: `${base}/agent`, label: ar ? "لوحة المندوب" : "Field agent", roles: ["ADMIN", "AGENT"] },
    { href: `${base}/lawyer`, label: ar ? "شاشة المحامي" : "Lawyer", roles: ["ADMIN", "LAWYER"] },
    { href: `${base}/finance`, label: ar ? "المالية" : "Finance", roles: ["ADMIN", "FINANCE"] },
    { href: `${base}/reports`, label: ar ? "التقارير" : "Reports", roles: ["ADMIN", "FINANCE", "BROKER", "BROKER_LEAD", "LAWYER"] },
    { href: `${base}/partner`, label: ar ? "بوابة الشريك" : "Partner portal", roles: ["PARTNER_BROKER"] },
    { href: `${base}/marketing`, label: ar ? "التسويق" : "Marketing", roles: ["ADMIN"] },
    { href: `${base}/settings`, label: ar ? "الإعدادات" : "Settings", roles: ["ADMIN", "FINANCE"] },
  ].filter((l) => role && l.roles.includes(role));
  const menuLink = "flex min-h-11 items-center border-b border-navy-soft py-2 text-[#D6DCEE] hover:text-white";

  return (
    <header className="bg-navy text-white print:hidden">
      <div className="bg-[#FDF3E1] px-5 py-1 text-center text-xs text-[#5C3D00] md:py-1.5 md:text-sm">{t.demo.banner}</div>

      {/* UX-06: الموبايل (تحت 768px) — لوجو + «اعرض قطعتك» + ☰ وبس، والهيدر ≤ 72px */}
      <div className="relative flex h-[64px] items-center justify-between gap-2 px-4 md:hidden">
        <Link href={base} className="flex items-center text-white no-underline" aria-label="Resell">
          <Logo />
        </Link>
        <div className="flex items-center gap-1">
          {user && <Bell href={`${base}/notifications`} unread={unread} ar={ar} />}
          <Link href={`${base}/list-your-plot`} className="inline-flex min-h-11 items-center bg-white px-3 text-sm font-semibold text-navy">
            {t.nav.listPlot}
          </Link>
          <MobileMenu label={t.nav.menu}>
              {links.map((l) => (
                <Link key={l.href} href={l.href} className={menuLink}>
                  {l.label}
                </Link>
              ))}
              {staffLinks.map((l) => (
                <Link key={l.href} href={l.href} className={menuLink}>
                  {l.label}
                </Link>
              ))}
              {user ? (
                <>
                  <Link href={dash!} className={menuLink}>
                    {user.name} · {label(ROLE, user.role, locale)}
                  </Link>
                  {user.role !== "CLIENT" && (
                    <Link href={`${base}/account`} className={menuLink}>
                      {t.nav.account}
                    </Link>
                  )}
                  <form action={signOut.bind(null, locale)}>
                    <button type="submit" className={`${menuLink} w-full text-start`}>
                      {t.nav.signOut}
                    </button>
                  </form>
                </>
              ) : (
                <Link href={`${base}/sign-in`} className={menuLink}>
                  {t.nav.signIn}
                </Link>
              )}
              <Link href={`/${other}`} hrefLang={other} className={menuLink}>
                {t.nav.otherLanguage}
              </Link>
          </MobileMenu>
        </div>
      </div>

      {/* الشاشات الأكبر */}
      <div className="mx-auto hidden min-h-[68px] max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-3 md:flex md:px-8">
        <Link href={base} className="flex items-center gap-3 text-white no-underline">
          <Logo />
          <span className="hidden border-s border-navy-soft ps-3 text-sm text-[#B9C3DE] lg:inline">{t.brand.tagline}</span>
        </Link>

        <nav aria-label={t.nav.menu} className="flex items-center gap-5 text-[15px]">
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
              <Bell href={`${base}/notifications`} unread={unread} ar={ar} />
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
          <Link href={`${base}/list-your-plot`} className="inline-flex min-h-11 items-center bg-white px-5 font-semibold text-navy hover:bg-paper">
            {t.nav.listPlot}
          </Link>
        </div>

        {staffLinks.length > 0 && (
          <nav aria-label={ar ? "لوحات الفريق" : "Team dashboards"} className="flex w-full flex-wrap gap-1 border-t border-navy-soft pt-2 text-sm">
            {staffLinks.map((l) => (
              <Link key={l.href} href={l.href} className="inline-flex min-h-9 items-center bg-navy-soft px-3 text-[#D6DCEE] hover:text-white">
                {l.label}
              </Link>
            ))}
          </nav>
        )}
      </div>
    </header>
  );
}
