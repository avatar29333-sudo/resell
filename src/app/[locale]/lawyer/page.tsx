import Link from "next/link";
import { notFound } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { isLocale } from "@/i18n/config";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { errorText } from "@/lib/errors";
import { date, num, tr } from "@/lib/format";
import { districtName } from "@/lib/district";
import { CITY, CONTRACT_TYPE, DOC_TYPE, REVIEW_DECISION, label, toneOf } from "@/lib/labels";
import { Badge, Card, Container, Empty, FileLink, Notice, PageHeader, Stat, Table, btn } from "@/components/ui";
import { reviewDocument } from "./actions";
import { CHECKLISTS } from "./checklists";
import { pageMeta } from "@/lib/meta";
import { ReviewForm } from "./ReviewForm";

const REVIEWABLE = ["ALLOCATION_LETTER", "PAYMENT_RECEIPT", "AUTHORITY_STATEMENT", "POWER_OF_ATTORNEY", "OTHER"] as const;

type Props = { params: Promise<{ locale: string }>; searchParams: Promise<{ err?: string }> };

export const generateMetadata = ({ params }: { params: Promise<{ locale: string }> }) => pageMeta(params, "شاشة المحامي", "Lawyer workspace", { noindex: true });

export default async function LawyerPage({ params, searchParams }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const sp = await searchParams;
  const L = tr(locale);
  const ar = locale === "ar";
  const me = await requireUser(locale, `/${locale}/lawyer`, ["LAWYER", "ADMIN"]);
  const isAdmin = me.role === "ADMIN";

  // PERM-02: المحامي يشوف مستندات العروض والصفقات المسندة ليه بس، ومش ورق هو رافعه أو صاحبه
  const docScope: Prisma.DocumentWhereInput = isAdmin
    ? {}
    : {
        OR: [{ listing: { assignedLawyerId: me.id } }, { deal: { lawyerId: me.id } }],
        ownerId: { not: me.id },
        uploadedById: { not: me.id },
      };
  const [docs, contracts, recent, reviewsDone] = await Promise.all([
    db.document.findMany({
      where: { AND: [docScope, { status: "IN_REVIEW", type: { in: [...REVIEWABLE] } }] },
      include: { owner: true, listing: { include: { plot: true } }, deal: { include: { listing: { include: { plot: true } } } } },
      orderBy: { createdAt: "asc" },
    }),
    db.contract.findMany({
      where: { status: "PENDING_LAWYER", deal: { status: { in: ["ACTIVE", "ON_HOLD"] }, ...(isAdmin ? {} : { lawyerId: me.id }) } },
      include: { deal: { include: { listing: { include: { plot: true } } } } },
      orderBy: { createdAt: "asc" },
    }),
    db.review.findMany({ where: isAdmin ? {} : { lawyerId: me.id }, include: { document: true, contract: true, lawyer: true }, orderBy: { createdAt: "desc" }, take: 15 }),
    db.review.count({ where: isAdmin ? {} : { lawyerId: me.id } }),
  ]);

  return (
    <>
      <PageHeader
        title={L("شاشة المحامي", "Lawyer workspace")}
        subtitle={L("مراجعة المستندات المسندة ليك ببنود ثابتة، واعتماد العقود قبل التوقيع.", "Review documents assigned to you against a fixed checklist and approve contracts before signing.")}
      />
      <Container className="flex flex-col gap-6">
        {sp.err && <Notice tone="red">{errorText(sp.err, ar)}</Notice>}
        <div className="grid grid-cols-3 gap-3">
          <Stat label={L("مستندات للمراجعة", "Documents to review")} value={num(docs.length, locale)} />
          <Stat label={L("عقود للاعتماد", "Contracts to approve")} value={num(contracts.length, locale)} />
          <Stat label={L("مراجعات اتعملت", "Reviews done")} value={num(reviewsDone, locale)} />
        </div>

        <Card title={L("مستندات مستنية المراجعة", "Documents awaiting review")}>
          {docs.length === 0 ? (
            <Empty>{L("مفيش مستندات مستنية.", "Nothing waiting.")}</Empty>
          ) : (
            <ul className="flex flex-col gap-4">
              {docs.map((d) => {
                const items = CHECKLISTS[d.type] ?? CHECKLISTS.OTHER;
                const plot = d.listing?.plot ?? d.deal?.listing.plot;
                const isImage = d.mimeType.startsWith("image/");
                return (
                  <li key={d.id} id={`d-${d.id}`} className="border border-line p-4">
                    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
                      {/* OPS-03: المستند جنب البنود */}
                      <div className="flex flex-col gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <FileLink id={d.id}>
                            {label(DOC_TYPE, d.type, locale)} {d.version > 1 && `v${d.version}`}
                          </FileLink>
                          {d.dealId && <Badge tone="blue">{L("مستند صفقة", "Deal document")}</Badge>}
                        </div>
                        <span className="text-sm text-muted">
                          {d.owner.name} · {date(d.createdAt, locale)}
                        </span>
                        {plot && (
                          <Link href={d.dealId ? `/${locale}/deals/${d.dealId}` : `/${locale}/listings/${d.listingId}`} className="text-sm text-brand">
                            {label(CITY, plot.city, locale)} — {districtName(plot, locale)} · <span dir="ltr">{plot.code}</span>
                          </Link>
                        )}
                        <div className="h-[420px] border border-line bg-paper">
                          {isImage ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={`/api/files/${d.id}`} alt={label(DOC_TYPE, d.type, locale)} className="h-full w-full object-contain" />
                          ) : (
                            <iframe src={`/api/files/${d.id}`} title={label(DOC_TYPE, d.type, locale)} className="h-full w-full" />
                          )}
                        </div>
                      </div>
                      <ReviewForm action={reviewDocument.bind(null, locale, d.id)} items={items} ar={ar} adminReason={isAdmin} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card title={L("عقود مستنية الاعتماد", "Contracts awaiting approval")}>
          {contracts.length === 0 ? (
            <Empty>{L("مفيش عقود مستنية.", "No contracts waiting.")}</Empty>
          ) : (
            <Table head={[L("العقد", "Contract"), L("الصفقة", "Deal"), L("من", "Since"), ""]}>
              {contracts.map((c) => (
                <tr key={c.id}>
                  <td className="font-semibold">
                    {label(CONTRACT_TYPE, c.type, locale)} <span className="text-xs text-muted">{c.templateVersion}</span>
                  </td>
                  <td>
                    #{c.dealId.slice(-6).toUpperCase()} · {label(CITY, c.deal.listing.plot.city, locale)}
                  </td>
                  <td>{date(c.createdAt, locale)}</td>
                  <td>
                    <Link href={`/${locale}/deals/${c.dealId}`} className={`${btn.small} bg-brand text-white`}>
                      {L("راجع في غرفة الصفقة", "Review in deal room")}
                    </Link>
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </Card>

        <Card title={L("آخر المراجعات", "Recent reviews")}>
          <Table head={[L("على", "On"), L("القرار", "Decision"), L("ملاحظات", "Notes"), L("المحامي", "Lawyer"), L("التاريخ", "Date")]}>
            {recent.map((r) => (
              <tr key={r.id}>
                <td>{r.document ? label(DOC_TYPE, r.document.type, locale) : r.contract ? label(CONTRACT_TYPE, r.contract.type, locale) : "—"}</td>
                <td>
                  <Badge tone={toneOf(r.decision)}>{label(REVIEW_DECISION, r.decision, locale)}</Badge>
                </td>
                <td className="max-w-xs">{r.notes ?? "—"}</td>
                <td>{r.lawyer.name}</td>
                <td>{date(r.createdAt, locale)}</td>
              </tr>
            ))}
          </Table>
        </Card>
      </Container>
    </>
  );
}
