import Link from "next/link";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";
import { Logo } from "./Logo";

export function SiteFooter({ t, locale }: { t: Dictionary; locale: Locale }) {
  const year = new Date().getFullYear();
  const ar = locale === "ar";
  return (
    <footer className="bg-navy py-10 text-sm leading-7 text-[#B9C3DE] print:hidden">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-5 md:px-8">
        <Logo className="text-white" />
        <p className="max-w-3xl">{t.footer.legal}</p>
        <nav className="flex flex-wrap gap-5" aria-label={ar ? "روابط قانونية" : "Legal links"}>
          <Link href={`/${locale}/privacy`} className="hover:text-white">
            {ar ? "سياسة الخصوصية" : "Privacy policy"}
          </Link>
          <Link href={`/${locale}/terms`} className="hover:text-white">
            {ar ? "الشروط والأحكام" : "Terms"}
          </Link>
          <Link href={`/${locale}/rescue`} className="hover:text-white">
            {ar ? "إنقاذ المهلة" : "Deadline rescue"}
          </Link>
        </nav>
        <p>
          © {year} Resell · {t.footer.rights}
        </p>
      </div>
    </footer>
  );
}
