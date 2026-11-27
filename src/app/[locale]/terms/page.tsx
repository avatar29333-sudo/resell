import Link from "next/link";
import { notFound } from "next/navigation";
import { isLocale } from "@/i18n/config";
import { tr } from "@/lib/format";
import { getSetting } from "@/lib/settings";
import { num } from "@/lib/format";
import { pageMeta } from "@/lib/meta";
import { Container, Notice, PageHeader } from "@/components/ui";

export const generateMetadata = ({ params }: { params: Promise<{ locale: string }> }) => pageMeta(params, "الشروط والأحكام", "Terms and conditions");

export default async function TermsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const L = tr(locale);
  const rates = await getSetting("commission.rates");
  const sections: [string, string][] = [
    [
      L("الخدمة", "The service"),
      L(
        "Resell بتعرض قطع بيت الوطن بعد مراجعة الورق مع محامي، وبتتوسط بين البائع والمشتري لحد التنازل في جهاز المدينة. إحنا مش تابعين لوزارة الإسكان ولا لمشروع بيت الوطن.",
        "Resell lists Beit El Watan plots after a lawyer reviews the papers, and brokers between seller and buyer up to the transfer at the city authority. We are not affiliated with the Ministry of Housing or the Beit El Watan project.",
      ),
    ],
    [
      L("العمولة", "Commission"),
      L(
        `العمولة الحالية ${num(rates.sellerPct, locale, 2)}% من البائع و${num(rates.buyerPct, locale, 2)}% من المشتري من السعر المتفق، وبتتثبت في اتفاق العمولة وقت توقيعه. تغيير النسب بيسري على الصفقات الجديدة بس.`,
        `Current commission is ${rates.sellerPct}% from the seller and ${rates.buyerPct}% from the buyer of the agreed price, fixed in the commission agreement when signed. Rate changes apply to new deals only.`,
      ),
    ],
    [
      L("مصاريف التحويل", "Transfer fees"),
      L(
        "أي عمولات أو مصاريف تحويل بنكي يتحملها المحوَّل له، ولا تتحملها المنصة. عمولة المنصة بتتحسب على الثمن المتفق ولازم توصل كاملة، والفاتورة ما تعتبرش مدفوعة إلا بوصول المبلغ كامل. أقساط الجهاز بتتدفع للجهاز مباشرة ومش بتعدّي على المنصة.",
        "Any bank transfer fees or charges are borne by the recipient, never by the platform. The platform commission is calculated on the agreed price and must arrive in full; an invoice counts as paid only when the full amount arrives. Authority installments are paid to the authority directly and never pass through the platform.",
      ),
    ],
    [
      L("سرية المعلومات وعدم بيعها", "Confidentiality and no sale of data"),
      L(
        "المعلومات المرفوعة على المنصة سرية، ما بتتعرضش للطرف الآخر إلا بموافقة صاحبها، وما بتتباعش ولا بتتشارك لأي جهة لأغراض تسويقية. المشاركة بتكون مع الجهات اللازمة لإتمام الصفقة بس (الجهاز، بنك الضمان، مزوّد التوقيع، التخزين، الرسائل).",
        "Information uploaded to the platform is confidential, shown to the other party only with its owner's consent, and never sold or shared for marketing. It is shared only with parties needed to complete the deal (the authority, the escrow bank, the e-signature provider, storage, messaging).",
      ),
    ],
    [
      L("العربون", "Deposit"),
      L(
        "المنصة ما بتمسكش أي فلوس. العربون بيتحوّل لحساب ضمان عند [البنك الشريك]، وبيترد للمشتري كامل لو الجهاز رفض التنازل.",
        "The platform never holds money. The deposit goes to an escrow account at [PARTNER BANK] and is refunded to the buyer in full if the authority refuses the transfer.",
      ),
    ],
    [
      L("التزامات البائع", "Seller obligations"),
      L(
        "إن الورق اللي بيرفعه صحيح وخاص بيه، وإن القطعة ما عليهاش نزاع أو حجز، وإنه ما يتفقش مع مشتري عرّفته عليه المنصة من ورا اتفاق العمولة.",
        "That the documents uploaded are genuine and theirs, that the plot is free of disputes and liens, and that they will not deal with a buyer introduced by the platform outside the commission agreement.",
      ),
    ],
    [
      L("التوقيع الإلكتروني", "E-signature"),
      L(
        "العقود بتتوقع عن طريق مزوّد مرخّص من ITIDA طبقاً لقانون 15 لسنة 2004، وليها نفس حجية التوقيع على الورق.",
        "Contracts are signed through an ITIDA-licensed provider under Law 15 of 2004, with the same legal force as a signature on paper.",
      ),
    ],
    [
      L("التوكيل", "Power of attorney"),
      L(
        "توكيل المندوب للتقديم والمتابعة في الجهاز بس، مش توكيل بيع.",
        "The field agent's power of attorney covers filing and follow-up at the authority only, not sale.",
      ),
    ],
  ];
  return (
    <>
      <PageHeader title={L("الشروط والأحكام", "Terms and conditions")} subtitle={L("آخر تحديث: نوفمبر 2026", "Last updated: November 2026")} />
      <Container className="flex max-w-3xl flex-col gap-6">
        <Notice tone="amber">{L("مسودة — لازم مراجعة المحامي قبل الإطلاق، والحاجات اللي بين [ ] لسه هتتملي.", "Draft — must be reviewed by the lawyer before launch; items in [ ] are still to be filled.")}</Notice>
        {sections.map(([h, b]) => (
          <section key={h} className="flex flex-col gap-2">
            <h2 className="text-xl font-bold">{h}</h2>
            <p className="leading-8 text-muted">{b}</p>
          </section>
        ))}
        <Link href={`/${locale}/privacy`} className="font-semibold text-brand">
          {L("سياسة الخصوصية ←", "Privacy policy →")}
        </Link>
      </Container>
    </>
  );
}
