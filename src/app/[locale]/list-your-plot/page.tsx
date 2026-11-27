import { activeCities, cityOptions } from "@/lib/cities";
import Link from "next/link";
import { notFound } from "next/navigation";
import { isLocale } from "@/i18n/config";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { can, subject } from "@/lib/authz";
import { tr } from "@/lib/format";
import { Card, Container, Notice, PageHeader } from "@/components/ui";
import { pageMeta } from "@/lib/meta";
import { Wizard } from "./Wizard";

export const generateMetadata = ({ params }: { params: Promise<{ locale: string }> }) => pageMeta(params, "اعرض قطعتك", "List your plot", { noindex: true });

export default async function ListYourPlotPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ from?: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const L = tr(locale);
  const { from } = await searchParams;
  const user = await requireUser(locale, `/${locale}/list-your-plot${from ? `?from=${encodeURIComponent(from)}` : ""}`);
  // MKT-03: جاي من طلب تقييم → البيانات بتتملى (طلب صاحب الحساب نفسه بس: نفس الحساب أو نفس الرقم)
  const sr = from ? await db.serviceRequest.findFirst({ where: { id: from, type: "VALUATION", OR: [{ requesterId: user.id }, { contactPhone: user.phone }] } }) : null;
  const district = sr?.city && sr.district ? await db.district.findFirst({ where: { city: sr.city, nameAr: sr.district } }) : null;
  const initial = sr
    ? {
        city: sr.city ?? "",
        districtId: district?.id ?? "",
        area: sr.message?.match(/(\d+(?:\.\d+)?)\s*(?:م²|m²)/)?.[1] ?? "",
        paymentStatus: sr.message?.includes("مسددة بالكامل") || sr.message?.includes("fully paid") ? "FULLY_PAID" : "INSTALLMENTS",
      }
    : undefined;
  const allowed = can(subject(user), "listing.create", {}).allowed;
  const staff = !["CLIENT", "PARTNER_BROKER", "ADMIN"].includes(user.role);

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
        {allowed ? (
          <Card>
            <Wizard
              locale={locale}
              partner={user.role === "PARTNER_BROKER"}
              initial={initial}
              cities={cityOptions(await activeCities())}
              districts={await db.district.findMany({ where: { active: true }, orderBy: [{ city: "asc" }, { sort: "asc" }], select: { id: true, city: true, nameAr: true, nameEn: true } })}
              rounds={await db.offeringRound.findMany({ where: { isActive: true }, orderBy: [{ cityId: "asc" }, { number: "asc" }], select: { id: true, cityId: true, nameAr: true, nameEn: true } })}
            />
          </Card>
        ) : staff ? (
          <Notice tone="amber">{L("حسابات الفريق ما بتعرضش قطع. العرض بيتعمل من حساب المالك أو السمسار الشريك.", "Team accounts can't list plots. Listings are created by the owner or a partner broker.")}</Notice>
        ) : (
          <Notice tone="amber">
            {L("لازم توثّق هويتك الأول عشان تعرض قطعة. التوثيق بياخد دقيقتين: صورة البطاقة أو الباسبور + صورة شخصية.", "You need to verify your ID before listing a plot. It takes two minutes: a photo of your ID or passport plus a selfie.")}{" "}
            <Link href={`/${locale}/account#kyc`} className="font-semibold text-brand underline">
              {L("وثّق هويتك", "Verify your ID")}
            </Link>
          </Notice>
        )}
      </Container>
    </>
  );
}
