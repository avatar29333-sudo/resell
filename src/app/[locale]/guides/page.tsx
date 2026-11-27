import Link from "next/link";
import { notFound } from "next/navigation";
import { isLocale } from "@/i18n/config";
import { date, tr } from "@/lib/format";
import { pageMeta } from "@/lib/meta";
import { GUIDES } from "@/content/guides";
import { Container, PageHeader } from "@/components/ui";

export const generateMetadata = ({ params }: { params: Promise<{ locale: string }> }) => pageMeta(params, "أدلة بيت الوطن", "Beit El Watan guides");

/** MKT-09 */
export default async function GuidesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const L = tr(locale);
  const i = locale === "ar" ? 0 : 1;
  return (
    <>
      <PageHeader title={L("أدلة بيت الوطن", "Beit El Watan guides")} subtitle={L("شرح بسيط للشروط والرسوم والخطوات — مع مصادره.", "Plain explanations of conditions, fees and steps — with sources.")} />
      <Container>
        <ul className="grid gap-4 md:grid-cols-2">
          {GUIDES.map((g) => (
            <li key={g.slug}>
              <Link href={`/${locale}/guides/${g.slug}`} className="flex h-full flex-col gap-2 border border-line p-5 hover:border-brand">
                <span className="text-lg font-bold text-navy">{g.title[i]}</span>
                <span className="text-muted">{g.description[i]}</span>
                <span className="text-[13px] text-muted">{L(`آخر مراجعة: ${date(g.reviewedAt, locale)}`, `Last reviewed: ${date(g.reviewedAt, locale)}`)}</span>
              </Link>
            </li>
          ))}
        </ul>
      </Container>
    </>
  );
}
