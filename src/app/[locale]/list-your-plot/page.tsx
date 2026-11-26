import { notFound } from "next/navigation";
import { isLocale } from "@/i18n/config";
import { requireUser } from "@/lib/auth";
import { tr } from "@/lib/format";
import { Card, Container, PageHeader } from "@/components/ui";
import { Wizard } from "./Wizard";

export default async function ListYourPlotPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const L = tr(locale);
  await requireUser(locale, `/${locale}/list-your-plot`);

  return (
    <>
      <PageHeader
        title={L("اعرض قطعتك", "List your plot")}
        subtitle={L(
          "3 خطوات: بيانات القطعة، السعر، والمستندات. بعدها المحامي يراجع الورق والوسيط ينشر العرض.",
          "3 steps: plot details, price and documents. Then a lawyer checks the papers and a broker publishes the listing.",
        )}
      />
      <Container className="max-w-3xl">
        <Card>
          <Wizard locale={locale} />
        </Card>
      </Container>
    </>
  );
}
