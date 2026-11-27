import { notFound } from "next/navigation";
import { isLocale } from "@/i18n/config";
import { tr } from "@/lib/format";
import { pageMeta } from "@/lib/meta";
import { Container, PageHeader } from "@/components/ui";
import { RemindForm } from "./RemindForm";

export const generateMetadata = ({ params }: { params: Promise<{ locale: string }> }) =>
  pageMeta(params, "فكّرني بمهلتي", "Remind me of my deadline", {
    description: ["تنبيه على واتساب قبل نهاية مهلة بناء قطعتك في بيت الوطن بـ 90 و30 و7 أيام.", "WhatsApp reminders 90, 30 and 7 days before your Beit El Watan build deadline."],
  });

/** MKT-04 */
export default async function RemindMePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const L = tr(locale);
  return (
    <>
      <PageHeader
        title={L("فكّرني بمهلتي", "Remind me of my deadline")}
        subtitle={L("من غير حساب: رقمك ومدينتك وتاريخ نهاية المهلة، ونفكّرك قبلها بـ 90 و30 و7 أيام — وأول ما يصدر قرار تسهيلات جديد.", "No account needed: your number, city and deadline, and we'll remind you 90, 30 and 7 days before — and as soon as new relief is announced.")}
      />
      <Container className="max-w-2xl">
        <RemindForm locale={locale} />
      </Container>
    </>
  );
}
