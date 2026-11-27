import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isLocale } from "@/i18n/config";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { isStaff } from "@/lib/access";
import { can, dealCtx, listingCtx, subject } from "@/lib/authz";
import { latestRate, totalEgp } from "@/lib/listing";
import { date, daysUntil, money, num, toNum, tr } from "@/lib/format";
import { districtName } from "@/lib/district";
import { CITY, DEAL_STAGE, DOC_STATUS, DOC_TYPE, LISTING_STATUS, PAYMENT_STATUS, PRICE_TYPE, label, toneOf } from "@/lib/labels";
import { Badge, Card, Container, DL, FileLink, Notice, PageHeader, btn } from "@/components/ui";
import { expressInterest } from "../actions";
import { approximateCenter, plotGeo } from "@/lib/geo";
import { getSetting } from "@/lib/settings";
import { PlotMap } from "@/components/PlotMap";
import { CostCalculator } from "@/components/CostCalculator";

type Props = { params: Promise<{ locale: string; id: string }> };

/** UX-08: «أرض 405م² · القاهرة الجديدة — المرحلة الرابعة · Resell» + وصف للمشاركة */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, id } = await params;
  if (!isLocale(locale)) return {};
  const l = await db.listing.findUnique({ where: { id }, include: { plot: true, seller: { select: { status: true } } } });
  if (!l || !["PUBLISHED", "IN_DEAL", "SOLD"].includes(l.status) || l.seller.status !== "ACTIVE") return { title: locale === "ar" ? "عرض" : "Listing", robots: { index: false } };
  const area = num(l.plot.areaSqm, locale);
  const place = `${label(CITY, l.plot.city, locale)} — ${districtName(l.plot, locale)}`;
  const title = locale === "ar" ? `أرض ${area}م² · ${place}` : `${area} m² plot · ${place}`;
  const rate = await latestRate();
  const price = money(totalEgp(l, toNum(rate?.sell ?? 50)), "EGP", locale);
  const description = locale === "ar" ? `${price} شامل · ورق متراجع مع محامي · بيت الوطن` : `${price} all-in · lawyer-checked papers · Beit El Watan`;
  return { title, description, openGraph: { title: `${title} · Resell`, description, type: "website" }, alternates: { languages: { ar: `/ar/listings/${id}`, en: `/en/listings/${id}` } } };
}

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

  const owner = user?.id === listing.sellerId || (!!listing.submittedById && user?.id === listing.submittedById);
  const staff = isStaff(user);
  const lc = listingCtx({ ...listing, deals: [] });
  // العروض اللي مش منشورة: صاحبها والفريق المسند بس (PERM-02)
  // PERM-07: عروض البائع الموقوف بتختفي من السجل العام
  const hidden = !["PUBLISHED", "IN_DEAL", "SOLD"].includes(listing.status) || listing.seller.status === "SUSPENDED";
  if (hidden && !can(subject(user), "listing.view_private", { listing: lc }).allowed) notFound();

  const myDeal = user
    ? await db.deal.findFirst({
        where: { listingId: id, buyerId: user.id, status: { in: ["ACTIVE", "ON_HOLD", "COMPLETED"] } },
        include: { contracts: true, listing: true, documents: { select: { type: true, status: true } } },
        orderBy: { createdAt: "desc" },
      })
    : null;
  const pc = { listing: lc, ...(myDeal ? { deal: dealCtx(myDeal) } : {}) };
  const canSeeCode = can(subject(user), "listing.view_code", pc).allowed;
  // الملفات: نفس قاعدة فتح المستندات (المشتري بعد العقد المبدئي)
  const canSeeFiles = can(subject(user), "document.view", { ...pc, document: { type: "ALLOCATION_LETTER", ownerId: listing.sellerId, uploadedById: listing.sellerId, status: "APPROVED" } }).allowed;
  const canInterest = can(subject(user), "deal.create", { listing: lc }).allowed;

  const rate = await latestRate();
  const usd = toNum(rate?.sell ?? 50);
  const total = totalEgp(listing, usd);
  const area = toNum(listing.plot.areaSqm);
  const days = daysUntil(listing.plot.buildDeadline);
  const photos = listing.documents.filter((d) => d.type === "SITE_PHOTO" && d.status === "APPROVED");
  const geo = await plotGeo(listing.plotId);
  const [rates, fees] = await Promise.all([getSetting("commission.rates"), getSetting("service.fees")]);
  const papers = listing.documents.filter((d) => d.type !== "SITE_PHOTO");

  return (
    <>
      <PageHeader
        crumbs={[
          { href: `/${locale}/listings`, label: L("سجل العروض", "Listings") },
          { href: `/${locale}/listings/${id}`, label: label(CITY, listing.plot.city, locale) },
        ]}
        title={`${label(CITY, listing.plot.city, locale)} — ${districtName(listing.plot, locale)}`}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <Badge tone={toneOf(listing.status)}>{label(LISTING_STATUS, listing.status, locale)}</Badge>
            {listing.statementExpiredAt && <Badge tone="amber">{L("⚠ محتاج تحديث — إفادة الجهاز انتهت", "⚠ Needs update — authority statement expired")}</Badge>}
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
                [L("المرحلة / الحي", "Phase / district"), districtName(listing.plot, locale)],
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

          {geo.center && (
            <Card
              title={L("الموقع", "Location")}
              actions={
                canSeeFiles && (
                  <Link href={`/${locale}/listings/${id}/report`} className={`${btn.small} border border-brand text-brand`}>
                    {L("تقرير المعاينة (PDF)", "Inspection report (PDF)")}
                  </Link>
                )
              }
            >
              <PlotMap
                polygon={canSeeCode ? geo.polygon : null}
                approx={canSeeCode ? null : approximateCenter(geo.center, listing.plotId)}
                label={L("خريطة موقع القطعة", "Map of the plot location")}
              />
              {!canSeeCode && (
                <p className="text-sm text-muted">
                  {L("الدايرة مكان تقريبي. حدود القطعة بالظبط بتظهر بعد اتفاق العمولة.", "The circle is approximate. Exact plot boundaries appear after the commission agreement.")}
                </p>
              )}
            </Card>
          )}

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

          {listing.status !== "SOLD" && (
            <Card title={L("احسب التكلفة الكاملة", "Full cost calculator")}>
              <CostCalculator
                locale={locale}
                priceEgp={total}
                buyerPct={rates.buyerPct}
                transferPct={fees.authorityTransferPct ?? null}
                lawyerFeeEgp={fees.buyerLawyerFeeEgp ?? 0}
                usdEgp={usd}
              />
            </Card>
          )}

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
                {user && !canInterest ? (
                  <Notice tone="amber">
                    {L("لازم توثّق هويتك الأول عشان تبدي اهتمام بقطعة.", "You need to verify your ID before registering interest in a plot.")}{" "}
                    <Link href={`/${locale}/account#kyc`} className="font-semibold underline">
                      {L("وثّق هويتك", "Verify your ID")}
                    </Link>
                  </Notice>
                ) : (
                  <form action={expressInterest.bind(null, locale, id)}>
                    <button type="submit" className={`${btn.primary} w-full`}>
                      {user ? L("أنا مهتم بالقطعة دي", "I'm interested in this plot") : L("ادخل وابدي اهتمامك", "Sign in to register interest")}
                    </button>
                  </form>
                )}
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
