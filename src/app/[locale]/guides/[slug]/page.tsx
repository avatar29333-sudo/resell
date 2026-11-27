import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { isLocale } from "@/i18n/config";
import { date, tr } from "@/lib/format";
import { siteUrl } from "@/lib/meta";
import { guideBySlug } from "@/content/guides";
import { Container, Notice, PageHeader, btn } from "@/components/ui";

type Props = { params: Promise<{ locale: string; slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  const g = guideBySlug(slug);
  if (!isLocale(locale) || !g) return {};
  const i = locale === "ar" ? 0 : 1;
  return { title: g.title[i], description: g.description[i], openGraph: { title: g.title[i], description: g.description[i], type: "article" } };
}

/** MKT-09: دليل — عنوان، وصف، تاريخ آخر مراجعة، المحتوى، أسئلة، مصادر، CTA + JSON-LD (Article و FAQPage) */
export default async function GuidePage({ params }: Props) {
  const { locale, slug } = await params;
  if (!isLocale(locale)) notFound();
  const g = guideBySlug(slug);
  if (!g) notFound();
  const L = tr(locale);
  const i = locale === "ar" ? 0 : 1;
  const cta = {
    rescue: [`/${locale}/rescue`, L("افحص مهلة قطعتك", "Check your deadline")],
    list: [`/${locale}/list-your-plot`, L("اعرض قطعتك", "List your plot")],
    valuation: [`/${locale}/valuation`, L("اعرف قيمة قطعتك", "Get your plot's value")],
  }[g.cta];
  const url = `${siteUrl()}/${locale}/guides/${g.slug}`;
  const ld = [
    { "@context": "https://schema.org", "@type": "Article", headline: g.title[i], description: g.description[i], dateModified: g.reviewedAt, inLanguage: locale, mainEntityOfPage: url, publisher: { "@type": "Organization", name: "Resell" } },
    { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: g.faq.map(([q, a]) => ({ "@type": "Question", name: q[i], acceptedAnswer: { "@type": "Answer", text: a[i] } })) },
  ];
  return (
    <>
      <PageHeader crumbs={[{ href: `/${locale}/guides`, label: L("الأدلة", "Guides") }]} title={g.title[i]} subtitle={g.description[i]} />
      <Container className="flex max-w-3xl flex-col gap-6">
        <p className="text-sm text-muted">{L(`آخر مراجعة: ${date(g.reviewedAt, locale)}`, `Last reviewed: ${date(g.reviewedAt, locale)}`)}</p>
        {g.draft && <Notice tone="amber">{L("المحتوى ده مبدئي وتحت المراجعة القانونية — مش استشارة قانونية.", "This content is preliminary and under legal review — it is not legal advice.")}</Notice>}
        <article className="flex flex-col gap-5">
          {g.sections.map((s) => (
            <section key={s.h[1]} className="flex flex-col gap-2">
              <h2 className="text-2xl font-bold">{s.h[i]}</h2>
              {s.p.map((p) => (
                <p key={p[1]} className="leading-8">
                  {p[i]}
                </p>
              ))}
            </section>
          ))}
        </article>
        <section className="flex flex-col gap-3">
          <h2 className="text-2xl font-bold">{L("أسئلة شائعة", "FAQ")}</h2>
          {g.faq.map(([q, a]) => (
            <details key={q[1]} className="border border-line px-5 py-4">
              <summary className="cursor-pointer font-bold">{q[i]}</summary>
              <p className="mt-2 leading-7 text-muted">{a[i]}</p>
            </details>
          ))}
        </section>
        <section className="flex flex-col gap-1 text-sm">
          <h2 className="font-bold">{L("المصادر", "Sources")}</h2>
          <ul className="list-inside list-disc text-muted">
            {g.sources.map((s) => (
              <li key={s.label[1]}>
                {s.url ? (
                  <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-brand underline">
                    {s.label[i]}
                  </a>
                ) : (
                  s.label[i]
                )}
              </li>
            ))}
          </ul>
        </section>
        <Link href={cta[0]} className={`${btn.primary} self-start`}>
          {cta[1]}
        </Link>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld).replace(/</g, "\\u003c") }} />
      </Container>
    </>
  );
}
