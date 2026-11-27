import { notFound } from "next/navigation";
import { isLocale } from "@/i18n/config";
import { db } from "@/lib/db";
import { tr } from "@/lib/format";
import { pageMeta } from "@/lib/meta";
import { loadIndex } from "@/lib/price-index-data";
import { Container, PageHeader } from "@/components/ui";
import { ValuationForm } from "./ValuationForm";

export const generateMetadata = ({ params }: { params: Promise<{ locale: string }> }) =>
  pageMeta(params, "اعرف قيمة قطعتك في بيت الوطن", "What is my Beit El Watan plot worth?", {
    description: ["تقييم مجاني لقطعتك من صفقات حقيقية اتقفلت — خلال يوم عمل على واتساب.", "A free valuation of your plot from real closed deals — within one working day on WhatsApp."],
  });

/** MKT-03: «اعرف قيمة قطعتك» */
export default async function ValuationPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const L = tr(locale);
  const [districts, index] = await Promise.all([
    db.district.findMany({ where: { active: true }, orderBy: [{ city: "asc" }, { sort: "asc" }], select: { id: true, city: true, nameAr: true, nameEn: true } }),
    loadIndex(),
  ]);
  const perSqm: Record<string, number | null> = {};
  for (const p of index.points) if (p.avgPerSqm !== null) perSqm[p.city] = p.avgPerSqm;
  return (
    <>
      <PageHeader
        title={L("اعرف قيمة قطعتك", "What's my plot worth?")}
        subtitle={L("5 خانات، ووسيط مرخّص يبعت لك تقييم مبني على صفقات اتقفلت فعلاً — من غير التزام بالبيع.", "Five fields, and a licensed broker sends a valuation based on deals that actually closed — no obligation to sell.")}
      />
      <Container className="max-w-2xl">
        <ValuationForm locale={locale} districts={districts} perSqm={perSqm} />
      </Container>
    </>
  );
}
