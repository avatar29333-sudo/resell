import type { Dictionary } from "@/i18n/dictionaries";
import { Logo } from "./Logo";

export function SiteFooter({ t }: { t: Dictionary }) {
  const year = new Date().getFullYear();
  return (
    <footer className="bg-navy py-10 text-sm leading-7 text-[#B9C3DE]">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-5 md:px-8">
        <Logo className="text-white" />
        <p className="max-w-3xl">{t.footer.legal}</p>
        <p>
          © {year} Resell · {t.footer.rights}
        </p>
      </div>
    </footer>
  );
}
