import Link from "next/link";
import { notFound } from "next/navigation";
import { isLocale } from "@/i18n/config";
import { tr } from "@/lib/format";
import { pageMeta } from "@/lib/meta";
import { Container, Notice, PageHeader } from "@/components/ui";
import { ALLOWED_THIRD_PARTIES } from "@/lib/third-parties";

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
        "المعلومات اللي بترفعها سرية: ما بتتعرضش للطرف التاني غير بموافقتك الصريحة (بكود تأكيد) — الاسم وكود القطعة والمستندات كل واحد بموافقة. أي مستند ترفعه في الصفقة بيفضل «خاص» لحد ما تضغط «شارك مع الطرف الآخر». فريقنا بيشوف حسب الدور والإسناد بس (الوسيط المسؤول، المحامي المراجع، والمالية للمدفوعات)، وكل فتح لمستند بيتسجل وتقدر تشوفه في «مين شاف ملفاتي؟».",
        "What you upload is confidential: it's shown to the other party only with your explicit consent (confirmed by code) — name, plot code and documents each need consent. Any document you upload in a deal stays private until you choose “Share with the other party”. Our team sees data by role and assignment only (the assigned broker, the reviewing lawyer, and finance for payments), and every document view is logged — see “Who viewed my files?”.",
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
    [
      L("مش بنبيع بياناتك", "We never sell your data"),
      L(
        "ممنوع أي بيع أو مشاركة لبياناتك لأغراض إعلانية أو تسويقية. أدوات القياس عندنا ما بتستلمش اسم ولا موبايل ولا إيميل. تصدير بيانات المستخدمين للأدمن بس وبيتسجل.",
        "Your data is never sold or shared for advertising or marketing. Our analytics never receive names, phone numbers or emails. Exporting user data is admin-only and logged.",
      ),
    ],
    [
      L("الجهات الخارجية المسموحة بس", "Only these external parties"),
      ALLOWED_THIRD_PARTIES.map((p) => (locale === "ar" ? `${p.ar}: ${p.purposeAr}` : `${p.en}: ${p.purposeEn}`)).join(" · ") +
        L(". أي إضافة على القائمة بقرار أدمن مسجّل وتحديث للسياسة دي.", ". Any addition requires a logged admin decision and an update to this policy."),
    ],
    [
      L("الحسابات البنكية", "Bank accounts"),
      L(
        "بنحفظ رقم حسابك (IBAN) متشفّر، وما بيظهرش كامل غير للمالية وكل عرض بيتسجل. الغرض: تحويل مستحقاتك أو رد العربون بس. المدة: طول التعامل + المدة القانونية (قانون 151 لسنة 2020). أي عمولات أو مصاريف تحويل بنكي يتحملها المحوَّل له، ولا تتحملها المنصة.",
        "Your IBAN is stored encrypted and shown in full only to finance, with every view logged. Purpose: paying you or refunding your deposit only. Retention: the relationship plus the legal period (Law 151/2020). Any bank transfer fees are borne by the recipient, never by the platform.",
      ),
    ],
    [
      L("طلبات الجهات الرسمية", "Requests from authorities"),
      L(
        "لو جهة رسمية طلبت بيانات بسند قانوني، بنسجل الجهة ورقم الطلب واللي اتسلّم، وبنبلّغك إلا لو القانون بيمنع.",
        "If an authority requests data with a legal basis, we record the authority, request number and what was delivered, and notify you unless the law forbids it.",
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
