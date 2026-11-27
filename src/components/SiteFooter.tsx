import Link from "next/link";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";
import { Logo } from "./Logo";

export function SiteFooter({ t, locale, regNo }: { t: Dictionary; locale: Locale; regNo?: string }) {
  const year = new Date().getFullYear();
  const ar = locale === "ar";
  return (
    <footer className="bg-navy py-10 text-sm leading-7 text-[#B9C3DE] print:hidden">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-5 md:px-8">
        <Logo tone="white" size={30} />
        <p className="max-w-3xl">{t.footer.legal}</p>
        {/* MKT-15: رقم القيد في سجل الوسطاء */}
        {regNo && (
          <p className="font-semibold text-white">
            {ar ? "وساطة مرخّصة — رقم القيد في سجل الوسطاء: " : "Licensed brokerage — broker registry no.: "}
            <span dir="ltr">{regNo}</span>
          </p>
        )}
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
          <Link href={`/${locale}/valuation`} className="hover:text-white">
            {ar ? "اعرف قيمة قطعتك" : "Plot valuation"}
          </Link>
          <Link href={`/${locale}/remind-me`} className="hover:text-white">
            {ar ? "فكّرني بمهلتي" : "Deadline reminders"}
          </Link>
          <Link href={`/${locale}/guides`} className="hover:text-white">
            {ar ? "الأدلة" : "Guides"}
          </Link>
          <Link href={`/${locale}/beit-el-watan/new-cairo`} className="hover:text-white">
            {ar ? "بيت الوطن حسب المدينة" : "Beit El Watan by city"}
          </Link>
        </nav>
        <p>
          © {year} Resell · {t.footer.rights}
        </p>
      </div>
    </footer>
  );
}
