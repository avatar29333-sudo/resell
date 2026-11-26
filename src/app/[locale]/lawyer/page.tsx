import Link from "next/link";
import { notFound } from "next/navigation";
import { isLocale } from "@/i18n/config";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { date, num, tr } from "@/lib/format";
import { CITY, CONTRACT_TYPE, DOC_TYPE, REVIEW_DECISION, label, toneOf } from "@/lib/labels";
import { Badge, Card, Container, Empty, FileLink, PageHeader, Stat, Table, btn, field } from "@/components/ui";
import { reviewDocument } from "./actions";
import { CHECKLISTS } from "./checklists";

export default async function LawyerPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const L = tr(locale);
  await requireUser(locale, `/${locale}/lawyer`, ["LAWYER", "ADMIN"]);

  const [docs, contracts, recent] = await Promise.all([
    db.document.findMany({
      where: { status: "IN_REVIEW", type: { in: ["ALLOCATION_LETTER", "PAYMENT_RECEIPT", "AUTHORITY_STATEMENT", "POWER_OF_ATTORNEY", "OTHER"] } },
      include: { owner: true, listing: { include: { plot: true } } },
      orderBy: { createdAt: "asc" },
    }),
    db.contract.findMany({
      where: { status: "PENDING_LAWYER", deal: { status: { in: ["ACTIVE", "ON_HOLD"] } } },
      include: { deal: { include: { listing: { include: { plot: true } } } } },
      orderBy: { createdAt: "asc" },
    }),
    db.review.findMany({ include: { document: true, contract: true, lawyer: true }, orderBy: { createdAt: "desc" }, take: 15 }),
  ]);

  return (
    <>
      <PageHeader
        title={L("شاشة المحامي", "Lawyer workspace")}
        subtitle={L("مراجعة المستندات ببنود ثابتة، واعتماد العقود قبل التوقيع.", "Review documents against a fixed checklist and approve contracts before signing.")}
      />
      <Container className="flex flex-col gap-6">
        <div className="grid grid-cols-3 gap-3">
          <Stat label={L("مستندات للمراجعة", "Documents to review")} value={num(docs.length, locale)} />
          <Stat label={L("عقود للاعتماد", "Contracts to approve")} value={num(contracts.length, locale)} />
          <Stat label={L("مراجعات اتعملت", "Reviews done")} value={num(await db.review.count(), locale)} />
        </div>

        <Card title={L("مستندات مستنية المراجعة", "Documents awaiting review")}>
          {docs.length === 0 ? (
            <Empty>{L("مفيش مستندات مستنية.", "Nothing waiting.")}</Empty>
          ) : (
            <ul className="flex flex-col gap-4">
              {docs.map((d) => {
                const items = CHECKLISTS[d.type] ?? CHECKLISTS.OTHER;
                return (
                  <li key={d.id} className="border border-line p-4">
                    <form action={reviewDocument.bind(null, locale, d.id)} className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
                      <div className="flex flex-col gap-1.5">
                        <FileLink id={d.id}>
                          {label(DOC_TYPE, d.type, locale)} {d.version > 1 && `v${d.version}`}
                        </FileLink>
                        <span className="text-sm text-muted">{d.owner.name}</span>
                        {d.listing && (
                          <Link href={`/${locale}/listings/${d.listing.id}`} className="text-sm text-brand">
                            {label(CITY, d.listing.plot.city, locale)} — {d.listing.plot.district} ·{" "}
                            <span dir="ltr">{d.listing.plot.code}</span>
                          </Link>
                        )}
                        <span className="text-xs text-muted">{date(d.createdAt, locale)}</span>
                      </div>
                      <div className="flex flex-col gap-2">
                        <fieldset className="flex flex-col gap-1">
                          <legend className="mb-1 text-sm font-semibold">{L("بنود المراجعة", "Checklist")}</legend>
                          {items.map((it) => (
                            <label key={it.key} className="flex min-h-9 items-center gap-2 text-sm">
                              <input type="checkbox" name={`c_${it.key}`} className="size-4" />
                              {locale === "ar" ? it.ar : it.en}
                            </label>
                          ))}
                        </fieldset>
                        <input name="notes" placeholder={L("ملاحظات (بتظهر للوسيط والبائع)", "Notes (shown to broker and seller)")} className={field} />
                        <div className="flex flex-wrap gap-2">
                          <button name="decision" value="APPROVED" className={`${btn.small} bg-ok text-white`}>
                            {L("اعتماد", "Approve")}
                          </button>
                          <button name="decision" value="CHANGES_REQUESTED" className={`${btn.small} border border-[#8A5A00] text-[#8A5A00]`}>
                            {L("طلب تعديل", "Request changes")}
                          </button>
                          <button name="decision" value="REJECTED" className={`${btn.small} border border-[#A32020] text-[#A32020]`}>
                            {L("رفض", "Reject")}
                          </button>
                        </div>
                      </div>
                    </form>
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
