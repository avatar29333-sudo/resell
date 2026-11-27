import Link from "next/link";
import { notFound } from "next/navigation";
import { isLocale } from "@/i18n/config";
import { tr } from "@/lib/format";
import { pageMeta } from "@/lib/meta";
import { Container, Notice, PageHeader } from "@/components/ui";

export const generateMetadata = ({ params }: { params: Promise<{ locale: string }> }) => pageMeta(params, "سياسة الخصوصية", "Privacy policy");

export default async function PrivacyPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const L = tr(locale);
  const sections: [string, string][] = [
    [
      L("مين إحنا", "Who we are"),
      L(
        "Resell منصة وساطة خاصة لإعادة بيع أراضي بيت الوطن، مقيدة بسجل الوسطاء العقاريين برقم [رقم القيد]. إحنا المسؤولين عن البيانات اللي بتدخلها على المنصة.",
        "Resell is a private brokerage for reselling Beit El Watan plots, registered in the real estate brokers register under [REG. NO.]. We are responsible for the data you enter on the platform.",
      ),
    ],
    [
      L("بنجمع إيه", "What we collect"),
      L(
        "الاسم، رقم الموبايل، الإيميل (اختياري)، بلد الإقامة، صورة الهوية والصورة الشخصية للتوثيق، ومستندات القطعة (خطاب التخصيص، الإيصالات، إفادة الجهاز)، وبيانات الصفقات والعقود. وبنسجل كل فتح لمستند وكل فعل حساس (مين، إمتى، ومن أنهي عنوان).",
        "Name, mobile number, optional email, country of residence, ID and selfie images for verification, plot documents (allocation letter, receipts, authority statement), and deal and contract data. We log every document view and sensitive action (who, when, from which address).",
      ),
    ],
    [
      L("بنستخدمها في إيه", "How we use it"),
      L(
        "توثيق هويتك، مراجعة الورق مع المحامي، إتمام الصفقة والتنازل في الجهاز، وإرسال رموز الدخول والإشعارات على واتساب أو الإيميل. مش بنبيع بياناتك ومش بنستخدمها في إعلانات.",
        "To verify your identity, have a lawyer review the papers, complete the deal and transfer at the authority, and send sign-in codes and notifications by WhatsApp or email. We do not sell your data or use it for advertising.",
      ),
    ],
    [
      L("مين يشوفها", "Who sees it"),
      L(
        "رقمك وبياناتك ما بتظهرش للطرف التاني قبل توقيع اتفاق العمولة، والمستندات ما بتتفتحش للمشتري قبل العقد المبدئي. فريقنا (الوسيط والمحامي والمندوب) بيشوف اللي محتاجه لشغله بس. ممكن نشارك بيانات مع الجهاز أو البنك أو مزوّد التوقيع الإلكتروني عشان إتمام الصفقة.",
        "Your number and details are not shown to the other party before the commission agreement is signed, and documents are not opened to the buyer before the preliminary contract. Our team (broker, lawyer, field agent) sees only what their work needs. We may share data with the city authority, the bank or the e-signature provider to complete the deal.",
      ),
    ],
    [
      L("بتتخزن فين وقد إيه", "Where and how long"),
      L(
        "البيانات على سيرفرات مشفّرة [مكان الاستضافة — قرار مفتوح حسب رأي المحامي]. بنحتفظ بالعقود وسجل التدقيق المدة اللي القانون بيطلبها، والباقي بيتمسح لما تحذف حسابك.",
        "Data is kept on encrypted servers [hosting location — open decision pending legal advice]. Contracts and the audit log are retained as the law requires; the rest is erased when you delete your account.",
      ),
    ],
    [
      L("حقوقك (قانون 151 لسنة 2020)", "Your rights (Law 151 of 2020)"),
      L(
        "تقدر تعرف إيه البيانات اللي عندنا، تطلب تصحيحها، أو تحذف حسابك من صفحة «الخصوصية والأمان» في حسابك. لأي طلب تاني كلّمنا على [إيميل الخصوصية].",
        "You can see what data we hold, ask for corrections, or delete your account from the Privacy & security page in your account. For anything else contact [PRIVACY EMAIL].",
      ),
    ],
  ];
  return (
    <>
      <PageHeader title={L("سياسة الخصوصية", "Privacy policy")} subtitle={L("آخر تحديث: نوفمبر 2026", "Last updated: November 2026")} />
      <Container className="flex max-w-3xl flex-col gap-6">
        <Notice tone="amber">{L("مسودة — لازم مراجعة المحامي قبل الإطلاق، والحاجات اللي بين [ ] لسه هتتملي.", "Draft — must be reviewed by the lawyer before launch; items in [ ] are still to be filled.")}</Notice>
        {sections.map(([h, b]) => (
          <section key={h} className="flex flex-col gap-2">
            <h2 className="text-xl font-bold">{h}</h2>
            <p className="leading-8 text-muted">{b}</p>
          </section>
        ))}
        <Link href={`/${locale}/terms`} className="font-semibold text-brand">
          {L("الشروط والأحكام ←", "Terms and conditions →")}
        </Link>
      </Container>
    </>
  );
}
