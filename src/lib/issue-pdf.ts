import { randomBytes } from "node:crypto";
import { db } from "./db";
import { renderPdf, type Block, type PdfMeta } from "./pdf-ar";
import { siteUrl } from "./meta";

/** CON-06 / TXN-01: يطلّع PDF بكود فريد ويسجله في السجل المرقّم (بصمة + صفحات) — الـ QR بيودّي لصفحة التحقق */
export async function issuePdf(
  meta: Omit<PdfMeta, "code" | "verifyUrl"> & { codePrefix: string; locale: string },
  blocks: Block[],
  rec: { kind: string; dealId?: string | null; contractId?: string | null; templateVersion?: string | null; issuedToId?: string | null; copyFor?: string | null },
) {
  const code = `${meta.codePrefix}-${randomBytes(3).toString("hex").toUpperCase()}`;
  const verifyUrl = `${siteUrl()}/${meta.locale}/verify/${code}`;
  const pdf = await renderPdf({ ...meta, code, verifyUrl }, blocks);
  const row = await db.issuedDocument.create({ data: { code, sha256: pdf.sha256, pages: pdf.pages, ...rec } });
  return { ...pdf, code, seq: row.seq };
}
