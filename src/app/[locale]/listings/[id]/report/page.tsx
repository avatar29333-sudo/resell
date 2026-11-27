import { notFound, redirect } from "next/navigation";
import { isLocale } from "@/i18n/config";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { can, listingCtx, subject } from "@/lib/authz";
import { buyerCanSeeFiles } from "@/lib/deal-machine";
import { plotGeo } from "@/lib/geo";
import { audit } from "@/lib/audit";
import { date, daysUntil, num, tr } from "@/lib/format";
import { districtName } from "@/lib/district";
import { CITY, DOC_STATUS, DOC_TYPE, PAYMENT_STATUS, REVIEW_DECISION, label } from "@/lib/labels";
import { PlotMap } from "@/components/PlotMap";
import { PrintButton } from "@/components/PrintButton";
import { Logo } from "@/components/Logo";

// تقرير المعاينة — صفحة مجهّزة للطباعة أو الحفظ PDF من المتصفح
export default async function InspectionReport({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  if (!isLocale(locale)) notFound();
  const L = tr(locale);
  const me = await requireUser(locale, `/${locale}/listings/${id}/report`);

  const listing = await db.listing.findUnique({
    where: { id },
    include: {
      plot: true,
      seller: true,
      documents: {
        where: { status: { not: "SUPERSEDED" } },
        include: { uploadedBy: true, reviews: { include: { lawyer: true }, orderBy: { createdAt: "desc" }, take: 1 } },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!listing) notFound();

  // نفس قاعدة المستندات (PERM-01): صاحب القطعة والفريق المسند، والمشتري بعد العقد المبدئي
  let allowed = can(subject(me), "listing.view_private", { listing: listingCtx({ ...listing, deals: [] }) }).allowed;
  if (!allowed) {
    const deals = await db.deal.findMany({ where: { listingId: id, buyerId: me.id }, include: { contracts: true } });
    allowed = deals.some((d) => buyerCanSeeFiles(d.stage, d.contracts));
  }
  if (!allowed) redirect(`/${locale}/listings/${id}`);
  await audit(me.id, "report.view", "Listing", id);

  const geo = await plotGeo(listing.plotId);
  const photos = listing.documents.filter((d) => d.type === "SITE_PHOTO" && d.status === "APPROVED");
  const papers = listing.documents.filter((d) => d.type !== "SITE_PHOTO");
  const agent = photos[0]?.uploadedBy;
  const days = daysUntil(listing.plot.buildDeadline);
  const ref = `R-${id.slice(-6).toUpperCase()}`;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 bg-white px-6 py-8 print:max-w-none print:px-0 print:py-0">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b-[3px] border-navy pb-4">
        <div className="flex flex-col gap-1">
          <span className="text-navy">
            <Logo />
          </span>
          <h1 className="text-2xl font-bold">{L("تقرير معاينة قطعة", "Plot inspection report")}</h1>
          <span className="text-sm text-muted">
            {ref} · {L("اتعمل", "Generated")} {date(new Date(), locale)}
          </span>
        </div>
        <PrintButton label={L("اطبع أو احفظ PDF", "Print or save as PDF")} />
      </div>

      <section className="grid gap-x-8 gap-y-2 sm:grid-cols-2">
        {(
          [
            [L("المدينة", "City"), label(CITY, listing.plot.city, locale)],
            [L("المرحلة / الحي", "Phase / district"), districtName(listing.plot, locale)],
            [L("كود القطعة", "Plot code"), listing.plot.code],
            [L("المساحة", "Area"), `${num(listing.plot.areaSqm, locale)} ${L("م²", "m²")}`],
            [L("حالة السداد", "Payment status"), label(PAYMENT_STATUS, listing.plot.paymentStatus, locale)],
            [L("نسبة التنفيذ", "Construction"), `${num(listing.plot.constructionPercent, locale)}%`],
            [
              L("نهاية مهلة البناء", "Build deadline"),
              `${date(listing.plot.buildDeadline, locale)}${days !== null ? ` (${days < 0 ? L("خلصت", "passed") : L(`باقي ${num(days, locale)} يوم`, `${days} days left`)})` : ""}`,
            ],
            [L("المالك", "Owner"), listing.seller.name],
            [L("المعاينة", "Inspected by"), agent ? `${agent.name} · ${date(photos[0].createdAt, locale)}` : "—"],
          ] as [string, string][]
        ).map(([k, v]) => (
          <div key={k} className="flex justify-between gap-3 border-b border-line py-1.5">
            <span className="text-muted">{k}</span>
            <span className="font-semibold" dir={k === L("كود القطعة", "Plot code") ? "ltr" : undefined}>
              {v}
            </span>
          </div>
        ))}
      </section>

      {geo.polygon && (
        <section className="flex flex-col gap-2 break-inside-avoid">
          <h2 className="text-lg font-bold">{L("حدود القطعة", "Plot boundary")}</h2>
          <PlotMap polygon={geo.polygon} label={L("خريطة حدود القطعة", "Map of the plot boundary")} height={300} />
          {geo.center && (
            <span className="text-xs text-muted" dir="ltr">
              {geo.center[0].toFixed(6)}, {geo.center[1].toFixed(6)} (WGS84)
            </span>
          )}
        </section>
      )}

      {photos.length > 0 && (
        <section className="flex flex-col gap-2 break-inside-avoid">
          <h2 className="text-lg font-bold">{L("صور الموقع", "Site photos")}</h2>
          <div className="grid grid-cols-2 gap-3">
            {photos.map((p) => (
              <figure key={p.id} className="flex flex-col gap-1">
                <img src={`/api/files/${p.id}`} alt={L("صورة من موقع القطعة", "Photo of the plot site")} className="aspect-[4/3] w-full border border-line object-cover" />
                <figcaption className="text-xs text-muted">{date(p.createdAt, locale)}</figcaption>
              </figure>
            ))}
          </div>
        </section>
      )}

      <section className="flex flex-col gap-2 break-inside-avoid">
        <h2 className="text-lg font-bold">{L("مراجعة المستندات", "Document review")}</h2>
        <table className="w-full border-collapse text-sm">
          <thead className="bg-paper text-muted">
            <tr>
              <th className="px-2 py-1.5 text-start">{L("المستند", "Document")}</th>
              <th className="px-2 py-1.5 text-start">{L("الحالة", "Status")}</th>
              <th className="px-2 py-1.5 text-start">{L("قرار المحامي", "Lawyer decision")}</th>
            </tr>
          </thead>
          <tbody>
            {papers.map((d) => (
              <tr key={d.id} className="border-t border-line">
                <td className="px-2 py-1.5">
                  {label(DOC_TYPE, d.type, locale)} {d.version > 1 && `v${d.version}`}
                </td>
                <td className="px-2 py-1.5">{label(DOC_STATUS, d.status, locale)}</td>
                <td className="px-2 py-1.5">
                  {d.reviews[0] ? `${label(REVIEW_DECISION, d.reviews[0].decision, locale)} — ${d.reviews[0].lawyer.name}, ${date(d.reviews[0].createdAt, locale)}` : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <p className="border-t border-line pt-3 text-xs leading-6 text-muted">
        {L(
          "التقرير ده من واقع معاينة مندوب Resell ومراجعة المحامي للمستندات المرفوعة، وما بيغنيش عن إفادة الجهاز الرسمية. نسبة التنفيذ النهائية بيحددها جهاز المدينة.",
          "This report reflects the Resell agent's inspection and the lawyer's review of uploaded documents. It does not replace the official authority statement; the final construction percentage is set by the city authority.",
        )}
      </p>
    </div>
  );
}
