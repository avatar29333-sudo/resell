import Link from "next/link";
import { notFound } from "next/navigation";
import { isLocale } from "@/i18n/config";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { isStaff } from "@/lib/access";
import { buyerCanSeeFiles, buyerCanSeePlotCode } from "@/lib/deal-machine";
import { latestRate, totalEgp } from "@/lib/listing";
import { date, daysUntil, money, num, toNum, tr } from "@/lib/format";
import { CITY, DEAL_STAGE, DOC_STATUS, DOC_TYPE, LISTING_STATUS, PAYMENT_STATUS, PRICE_TYPE, label, toneOf } from "@/lib/labels";
import { Badge, Card, Container, DL, FileLink, Notice, PageHeader, btn } from "@/components/ui";
import { expressInterest } from "../actions";

type Props = { params: Promise<{ locale: string; id: string }> };

export default async function ListingPage({ params }: Props) {
  const { locale, id } = await params;
  if (!isLocale(locale)) notFound();
  const L = tr(locale);
  const user = await getCurrentUser();

  const listing = await db.listing.findUnique({
    where: { id },
    include: {
      plot: true,
      seller: true,
      documents: { where: { status: { not: "SUPERSEDED" } }, orderBy: { type: "asc" } },
    },
  });
  if (!listing) notFound();

  const owner = user?.id === listing.sellerId;
  const staff = isStaff(user);
  // العروض اللي مش منشورة: صاحبها والفريق بس
  if (!["PUBLISHED", "IN_DEAL", "SOLD"].includes(listing.status) && !owner && !staff) notFound();

  const myDeal = user
    ? await db.deal.findFirst({
        where: { listingId: id, buyerId: user.id, status: { in: ["ACTIVE", "ON_HOLD", "COMPLETED"] } },
        include: { contracts: true },
        orderBy: { createdAt: "desc" },
      })
    : null;
  const canSeeCode = owner || staff || (!!myDeal && buyerCanSeePlotCode(myDeal.stage, myDeal.contracts));
  const canSeeFiles = owner || staff || (!!myDeal && buyerCanSeeFiles(myDeal.stage, myDeal.contracts));

  const rate = await latestRate();
  const usd = toNum(rate?.sell ?? 50);
  const total = totalEgp(listing, usd);
  const area = toNum(listing.plot.areaSqm);
  const days = daysUntil(listing.plot.buildDeadline);
  const photos = listing.documents.filter((d) => d.type === "SITE_PHOTO" && d.status === "APPROVED");
  const papers = listing.documents.filter((d) => d.type !== "SITE_PHOTO");

  return (
    <>
      <PageHeader
        crumbs={[
          { href: `/${locale}/listings`, label: L("سجل العروض", "Listings") },
          { href: `/${locale}/listings/${id}`, label: label(CITY, listing.plot.city, locale) },
        ]}
        title={`${label(CITY, listing.plot.city, locale)} — ${listing.plot.district}`}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <Badge tone={toneOf(listing.status)}>{label(LISTING_STATUS, listing.status, locale)}</Badge>
            {num(area, locale)} {L("م²", "m²")} · {label(PAYMENT_STATUS, listing.plot.paymentStatus, locale)}
          </span>
        }
      />
      <Container className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-6">
          {photos.length > 0 && (
            <div className="grid grid-cols-2 gap-3">
              {photos.slice(0, 4).map((p) => (
                <img
                  key={p.id}
                  src={`/api/files/${p.id}`}
                  alt={L("صورة من موقع القطعة", "Photo of the plot site")}
                  className="aspect-[4/3] w-full border border-line object-cover"
                />
              ))}
            </div>
          )}

          <Card title={L("بيانات القطعة", "Plot details")}>
            <DL
              items={[
                [L("المدينة", "City"), label(CITY, listing.plot.city, locale)],
                [L("المرحلة / الحي", "Phase / district"), listing.plot.district],
                [
                  L("كود القطعة", "Plot code"),
                  canSeeCode ? (
                    <span dir="ltr">{listing.plot.code}</span>
                  ) : (
                    <span className="text-muted">🔒 {L("بيظهر بعد اتفاق العمولة", "Shown after the commission agreement")}</span>
                  ),
                ],
                [L("المساحة", "Area"), `${num(area, locale)} ${L("م²", "m²")}`],
                [L("حالة السداد", "Payment status"), label(PAYMENT_STATUS, listing.plot.paymentStatus, locale)],
                [L("نسبة التنفيذ", "Construction"), `${num(listing.plot.constructionPercent, locale)}%`],
                [
                  L("نهاية مهلة البناء", "Build deadline"),
                  <span key="d" className={days !== null && days < 120 ? "text-[#A32020]" : ""}>
                    {date(listing.plot.buildDeadline, locale)}
                    {days !== null && ` (${days < 0 ? L("خلصت", "passed") : L(`باقي ${num(days, locale)} يوم`, `${days} days left`)})`}
                  </span>,
                ],
                [
                  L("البائع", "Seller"),
                  canSeeCode ? listing.seller.name : <span className="text-muted">🔒 {L("بيظهر بعد اتفاق العمولة", "Shown after the commission agreement")}</span>,
                ],
              ]}
            />
            {days !== null && days < 120 && days >= 0 && (
              <Notice tone="amber">
                {L("مهلة البناء قرّبت تخلص. ", "The build deadline is close. ")}
                <Link href={`/${locale}/rescue`} className="font-semibold underline">
                  {L("اعرف عن خدمة إنقاذ المهلة", "About our deadline rescue service")}
                </Link>
              </Notice>
            )}
          </Card>

          <Card title={L("الورق اللي اتراجع", "Checked paperwork")}>
            <ul className="flex flex-col divide-y divide-line">
              {papers.map((d) => (
                <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                  <span className="flex items-center gap-2">
                    {canSeeFiles ? <FileLink id={d.id}>{label(DOC_TYPE, d.type, locale)}</FileLink> : <span>{label(DOC_TYPE, d.type, locale)}</span>}
                    {d.version > 1 && <span className="text-xs text-muted">v{d.version}</span>}
                  </span>
                  <Badge tone={toneOf(d.status)}>{label(DOC_STATUS, d.status, locale)}</Badge>
                </li>
              ))}
            </ul>
            {!canSeeFiles && (
              <p className="text-sm text-muted">
                {L("الملفات نفسها بتتفتح للمشتري بعد توقيع العقد المبدئي.", "Buyers can open the files after signing the preliminary contract.")}
              </p>
            )}
          </Card>
        </div>

        <aside className="flex flex-col gap-6">
          <Card title={L("السعر", "Price")}>
            <div className="text-3xl font-bold text-navy">{money(total, "EGP", locale)}</div>
            <div className="text-muted">
              {money(total / area, "EGP", locale)} {L("للمتر", "per m²")}
            </div>
            <DL
              items={[
                [L("نوع السعر", "Price type"), label(PRICE_TYPE, listing.priceType, locale)],
                ...(listing.priceType === "PAID_PLUS_PREMIUM"
                  ? ([
                      [L("المدفوع للجهاز", "Paid to authority"), money(listing.paidAmountUsd, "USD", locale)],
                      [L("الأوفر", "Premium"), money(listing.price, listing.currency, locale)],
                    ] as [string, string][])
                  : []),
              ]}
            />
            <p className="text-sm text-muted">
              {L(`محسوب بسعر دولار ${num(usd, locale, 2)} ج.م (${date(rate?.date, locale)})`, `Calculated at USD = EGP ${num(usd, locale, 2)} (${date(rate?.date, locale)})`)}
            </p>
          </Card>

          <Card>
            {owner ? (
              <>
                <p>{L("ده عرضك.", "This is your listing.")}</p>
                <Link href={`/${locale}/account`} className={btn.secondary}>
                  {L("تابع عروضك", "Manage your listings")}
                </Link>
              </>
            ) : staff ? (
              <Link href={`/${locale}/broker?tab=queue`} className={btn.secondary}>
                {L("افتح في لوحة الوسيط", "Open in broker dashboard")}
              </Link>
            ) : myDeal ? (
              <>
                <p>
                  {L("عندك صفقة على القطعة دي — المرحلة: ", "You have a deal on this plot — stage: ")}
                  <strong>{label(DEAL_STAGE, myDeal.stage, locale)}</strong>
                </p>
                <Link href={`/${locale}/deals/${myDeal.id}`} className={btn.primary}>
                  {L("افتح غرفة الصفقة", "Open the deal room")}
                </Link>
              </>
            ) : listing.status === "PUBLISHED" ? (
              <>
                <p className="leading-7">
                  {L(
                    "ابدي اهتمامك وهيتواصل معاك وسيط. بعد اتفاق العمولة بنعرّفك بالبائع وبنتفاوض معاك.",
                    "Register your interest and a broker will contact you. After the commission agreement we introduce you to the seller and negotiate with you.",
                  )}
                </p>
                <form action={expressInterest.bind(null, locale, id)}>
                  <button type="submit" className={`${btn.primary} w-full`}>
                    {user ? L("أنا مهتم بالقطعة دي", "I'm interested in this plot") : L("ادخل وابدي اهتمامك", "Sign in to register interest")}
                  </button>
                </form>
              </>
            ) : (
              <p className="text-muted">{L("القطعة دي في صفقة دلوقتي.", "This plot is currently in a deal.")}</p>
            )}
          </Card>
        </aside>
      </Container>
    </>
  );
}
