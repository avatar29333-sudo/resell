import Link from "next/link";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";
import { Logo } from "./Logo";

type Props = { locale: Locale; t: Dictionary };

export function SiteHeader({ locale, t }: Props) {
  const other: Locale = locale === "ar" ? "en" : "ar";
  const base = `/${locale}`;

  return (
    <header className="bg-navy text-white">
      <div className="mx-auto flex min-h-[68px] max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-3 md:px-8">
        <Link href={base} className="flex items-center gap-3 text-white no-underline">
          <Logo />
          <span className="hidden border-s border-navy-soft ps-3 text-sm text-[#B9C3DE] sm:inline">
            {t.brand.tagline}
          </span>
        </Link>

        <nav aria-label={t.nav.menu} className="hidden items-center gap-7 text-[15px] lg:flex">
          <Link href={`${base}/listings`} className="text-[#D6DCEE] hover:text-white">
            {t.nav.listings}
          </Link>
          <Link href={`${base}/price-index`} className="text-[#D6DCEE] hover:text-white">
            {t.nav.priceIndex}
          </Link>
          <Link href={`${base}#how`} className="text-[#D6DCEE] hover:text-white">
            {t.nav.howItWorks}
          </Link>
        </nav>

        <div className="flex items-center gap-3 text-[15px]">
          <Link href={`/${other}`} className="text-[#D6DCEE] hover:text-white" hrefLang={other}>
            {t.nav.otherLanguage}
          </Link>
          <Link href={`${base}/sign-in`} className="px-2 py-2 text-[#D6DCEE] hover:text-white">
            {t.nav.signIn}
          </Link>
          <Link
            href={`${base}/list-your-plot`}
            className="inline-flex min-h-11 items-center bg-white px-5 font-semibold text-navy hover:bg-paper"
          >
            {t.nav.listPlot}
          </Link>
        </div>
      </div>
    </header>
  );
}
