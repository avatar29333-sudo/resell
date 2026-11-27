import { notFound } from "next/navigation";
import { isLocale } from "@/i18n/config";
import { db } from "@/lib/db";
import { dateTime, tr } from "@/lib/format";
import { Badge, Card, Container, DL, Notice, PageHeader } from "@/components/ui";
import { pageMeta } from "@/lib/meta";
import { dealRef } from "@/lib/action-otp-core";

type Props = { params: Promise<{ locale: string; code: string }> };

export const generateMetadata = ({ params }: { params: Promise<{ locale: string }> }) => pageMeta(params, "التحقق من مستند", "Verify a document", { noindex: true });

const KIND: Record<string, [string, string]> = {
  STATEMENT: ["كشف حساب صفقة", "Deal statement"],
  CONTRACT_DRAFT: ["نسخة عقد للتوقيع", "Contract copy for signing"],
  EXPORT: ["ملف تصدير", "Export file"],
};

/**
 * CON-06 / TXN-01: صفحة التحقق اللي الـ QR بيودّي لها.
 * بتأكد إن الكود صادر من المنصة وبتعرض بصمته وعدد صفحاته — من غير أي بيانات شخصية.
 */
export default async function VerifyPage({ params }: Props) {
  const { locale, code } = await params;
  if (!isLocale(locale)) notFound();
  const L = tr(locale);
  const ar = locale === "ar";
  const row = /^[A-Z0-9-]{6,60}$/.test(code) ? await db.issuedDocument.findUnique({ where: { code } }) : null;
  // CON-06: هل فيه نسخة أحدث لنفس العقد؟
  const newer = row?.supersededAt
    ? true
    : row?.contractId
      ? !!(await db.issuedDocument.findFirst({ where: { contractId: row.contractId, kind: row.kind, seq: { gt: row.seq } }, select: { id: true } }))
      : false;
  // حالة العقد بس — من غير أي بيانات
  const contract = row?.contractId ? await db.contract.findUnique({ where: { id: row.contractId }, select: { status: true } }) : null;
  return (
    <>
      <PageHeader title={L("التحقق من مستند", "Verify a document")} />
      <Container className="flex max-w-2xl flex-col gap-4">
        {!row ? (
          <Notice tone="red">{L("الكود ده مش صادر من المنصة. ما تعتمدش على المستند ده.", "This code wasn't issued by the platform. Don't rely on this document.")}</Notice>
        ) : (
          <>
            <Notice tone={newer ? "amber" : "green"}>
              {newer
                ? L("النسخة دي ملغاة — اتولدت نسخة أحدث من العقد. ما توقّعش عليها، ونزّل آخر نسخة.", "This copy is void — a newer copy of the contract was issued. Don't sign it; download the latest copy.")
                : L("المستند ده صادر من المنصة فعلاً.", "This document was genuinely issued by the platform.")}
            </Notice>
            <Card title={<span dir="ltr">{row.code}</span>} actions={<Badge tone="blue">{(KIND[row.kind] ?? [row.kind, row.kind])[ar ? 0 : 1]}</Badge>}>
              <DL
                items={[
                  [L("رقم الإصدار", "Issue no."), <span key="s" className="tabular-nums">#{row.seq}</span>],
                  [L("الصفقة", "Deal"), row.dealId ? <span key="d" dir="ltr">{dealRef(row.dealId)}</span> : "—"],
                  [L("نسخة النموذج", "Template version"), row.templateVersion ?? "—"],
                  ...(contract ? [[L("حالة العقد", "Contract status"), { DRAFT: L("مسودة", "Draft"), PENDING_LAWYER: L("عند المحامي", "With lawyer"), APPROVED: L("معتمد", "Approved"), SENT_FOR_SIGNATURE: L("مستني التوقيع", "Awaiting signatures"), PARTIALLY_SIGNED: L("موقّع جزئياً", "Partially signed"), SIGNED: L("موقّع — مستني التحقق", "Signed — awaiting verification"), VERIFIED: L("موقّع ومتحقق منه", "Signed and verified"), VOID: L("ملغي", "Void") }[contract.status] ?? contract.status] as [string, string]] : []),
                  [L("عدد الصفحات", "Pages"), <span key="p" className="tabular-nums">{row.pages}</span>],
                  [L("تاريخ الإصدار", "Issued"), dateTime(row.createdAt, locale)],
                  [L("البصمة (SHA-256)", "Fingerprint (SHA-256)"), <code key="h" dir="ltr" className="text-[13px] break-all">{row.sha256}</code>],
                ]}
              />
              <p className="text-sm text-muted">
                {L(
                  "عشان تتأكد إن الملف اللي معاك ما اتعدّلش: احسب بصمة SHA-256 للملف وقارنها بالبصمة هنا. لو النسخة اتطبعت واتوقّعت، عدد الصفحات والكود لازم يطابقوا.",
                  "To confirm your file wasn't altered, compute its SHA-256 and compare it with the fingerprint above. For a printed and signed copy, the page count and code must match.",
                )}
              </p>
            </Card>
          </>
        )}
      </Container>
    </>
  );
}
