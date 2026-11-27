import type { Locale } from "@/i18n/config";
import { Badge, btn, field, labelCls } from "@/components/ui";
import { OtpConfirm } from "@/components/OtpConfirm";
import { MultiUpload } from "@/components/MultiUpload";
import { ConsentGate } from "@/components/ConsentGate";
import { contractActionKey } from "@/lib/action-otp-core";
import { CONTRACT_TYPE, label } from "@/lib/labels";
import { rejectSignedContract, signContract, uploadSignedContract, verifyContract } from "../actions";

type C = {
  id: string;
  type: string;
  status: string;
  templateVersion: string;
  draftCode: string | null;
  draftSha256: string | null;
  draftPages: number | null;
  draftDocumentId: string | null;
  signedUploadDocumentId: string | null;
  signedVia: string | null;
  rejectReason: string | null;
  poaNumber: string | null;
  poaNotary: string | null;
};

/**
 * CON-04 / CON-06 — لكل عقد 3 خانات ثابتة:
 * ١ المسودة المعتمدة (تنزيل للتوقيع PDF بكود وبصمة)،
 * ٢ النسخة النهائية الموقّعة (مزوّد التوقيع — تجريبي — أو «ارفع النسخة الموقّعة»)،
 * ٣ التحقق (مقارنة المحامي جنب بعض + checklist → VERIFIED، أو رفض بسبب → «أعد الرفع»).
 */
export function ContractSlots({
  locale,
  dealId,
  c,
  mySig,
  canSign,
  canDownload,
  canUpload,
  onBehalf,
  canVerify,
  clickwrap,
}: {
  locale: Locale;
  dealId: string;
  c: C;
  mySig: boolean;
  canSign: boolean;
  canDownload: boolean;
  canUpload: boolean;
  onBehalf: boolean;
  canVerify: boolean;
  /** CON-03: نموذج 2 بالموافقة الإلكترونية (النص معبّى ببيانات الصفقة) */
  clickwrap?: { title: string; version: number; text: string } | null;
}) {
  const ar = locale === "ar";
  const L = (a: string, e: string) => (ar ? a : e);
  const isPoa = c.type === "POWER_OF_ATTORNEY";
  const open = ["SENT_FOR_SIGNATURE", "PARTIALLY_SIGNED"].includes(c.status);
  const ready = !["DRAFT", "PENDING_LAWYER", "VOID"].includes(c.status);
  if (!ready) return null;
  const slot = "flex flex-col gap-2 border border-line p-3 text-sm";
  return (
    <div className="grid w-full gap-2 lg:grid-cols-3">
      {/* ١ المسودة */}
      <div className={slot}>
        <strong>{L("١. المسودة المعتمدة", "1. Approved draft")}</strong>
        {c.draftCode ? (
          <span className="text-[13px] text-muted">
            {L("آخر نسخة:", "Latest copy:")} <code dir="ltr">{c.draftCode}</code> · {L(`${c.draftPages} صفحة`, `${c.draftPages} pages`)} · <span dir="ltr">SHA-256 {c.draftSha256?.slice(0, 10)}…</span>
          </span>
        ) : (
          <span className="text-[13px] text-muted">{L("لسه ما اتنزّلتش نسخة للتوقيع.", "No signing copy downloaded yet.")}</span>
        )}
        {canDownload && (
          <a href={`/api/contracts/${c.id}/draft`} className={`${btn.small} self-start border border-brand text-brand`}>
            {isPoa ? L("نزّل الصيغة المقترحة (PDF)", "Download the proposed wording (PDF)") : L("تنزيل للتوقيع (PDF)", "Download for signing (PDF)")}
          </a>
        )}
        {c.draftCode && <span className="text-[13px] text-muted">{L("أي تنزيل جديد بيلغي النسخ القديمة (الـ QR بتاعها بيقول كده).", "Any new download voids older copies (their QR says so).")}</span>}
      </div>

      {/* ٢ النسخة الموقّعة */}
      <div className={slot}>
        <strong>{isPoa ? L("٢. التوكيل الموثّق", "2. Notarized power of attorney") : L("٢. النسخة النهائية الموقّعة", "2. Final signed copy")}</strong>
        {c.signedUploadDocumentId ? (
          <a href={`/api/files/${c.signedUploadDocumentId}`} className="font-semibold text-brand underline">
            {isPoa ? L(`التوكيل رقم ${c.poaNumber} — ${c.poaNotary}`, `POA no. ${c.poaNumber} — ${c.poaNotary}`) : L("النسخة الموقّعة المرفوعة (PDF)", "Uploaded signed copy (PDF)")}
          </a>
        ) : c.signedVia === "ESIGN" || (!c.signedVia && ["SIGNED", "VERIFIED"].includes(c.status)) ? (
          <span>{L("اتوقّع إلكترونياً عن طريق مزوّد التوقيع.", "Signed electronically via the e-sign provider.")}</span>
        ) : (
          <span className="text-[13px] text-muted">{L("لسه.", "Not yet.")}</span>
        )}
        {c.rejectReason && open && <span className="text-[#A32020]">{L(`المحامي رفض النسخة السابقة: ${c.rejectReason}`, `The lawyer rejected the previous copy: ${c.rejectReason}`)}</span>}
        {open && mySig && clickwrap && c.status !== "APPROVED" && (
          canSign ? (
            <ConsentGate locale={locale} title={clickwrap.title} version={clickwrap.version} text={clickwrap.text} action={contractActionKey(c.type)} subjectId={dealId} fields={["contractId"]} hidden={{ contractId: c.id }} formAction={signContract.bind(null, locale, dealId, c.id)} />
          ) : (
            <span className="text-[#8A5A00]">{L("وثّق هويتك الأول عشان تقدر توافق.", "Verify your ID first to be able to consent.")}</span>
          )
        )}
        {open && mySig && !isPoa && !clickwrap && c.status !== "APPROVED" && (
          canSign ? (
            <details>
              <summary className="min-h-11 cursor-pointer py-2 text-brand">{L("توقيع إلكتروني (مزوّد التوقيع — تجريبي)", "E-signature (provider — demo)")}</summary>
              <OtpConfirm
                locale={locale}
                action={contractActionKey(c.type)}
                subjectId={dealId}
                fields={["contractId"]}
                preview={L(`توقيعك على ${label(CONTRACT_TYPE, c.type, locale)} (نسخة ${c.templateVersion})`, `Your signature on the ${label(CONTRACT_TYPE, c.type, locale)} (version ${c.templateVersion})`)}
                submitLabel={L("وقّع إلكترونياً", "Sign electronically")}
                formAction={signContract.bind(null, locale, dealId, c.id)}
              >
                <input type="hidden" name="contractId" value={c.id} />
              </OtpConfirm>
            </details>
          ) : (
            <span className="text-[#8A5A00]">{L("وثّق هويتك الأول عشان تقدر توقّع.", "Verify your ID first to be able to sign.")}</span>
          )
        )}
        {open && canUpload && !clickwrap && (
          <details>
            <summary className="min-h-11 cursor-pointer py-2 font-semibold text-brand">{isPoa ? L("ارفع التوكيل الموثّق", "Upload the notarized POA") : L("ارفع النسخة الموقّعة", "Upload the signed copy")}</summary>
            <form action={uploadSignedContract.bind(null, locale, dealId, c.id)} className="flex flex-col gap-2">
              <span className="text-[13px] text-muted">
                {L("PDF واحد، أو صوّر الصفحات بالترتيب (JPG/PNG/HEIC) وهتتجمع PDF واحد. لازم كل الصفحات تكون واضحة وعددها زي النسخة المتولّدة.", "One PDF, or photograph the pages in order (JPG/PNG/HEIC) and they'll be merged into one PDF. All pages must be clear and match the generated copy's page count.")}
              </span>
              <MultiUpload locale={locale} titleRequired={false} label={L("اختار الملف أو صور الصفحات", "Choose the file or page photos")} />
              {isPoa ? (
                <>
                  <label className={labelCls}>
                    {L("رقم التوكيل", "POA number")}
                    <input name="poaNumber" required className={field} />
                  </label>
                  <label className={labelCls}>
                    {L("مكتب التوثيق / القنصلية", "Notary office / consulate")}
                    <input name="poaNotary" required className={field} />
                  </label>
                </>
              ) : (
                <>
                  <label className={labelCls}>
                    {L("كود المستند (مطبوع تحت كل صفحة جنب الـ QR)", "Document code (printed at the bottom of each page next to the QR)")}
                    <input name="code" required dir="ltr" placeholder={c.draftCode ?? "RS-DL-…"} className={`${field} text-start uppercase`} />
                  </label>
                  {onBehalf && (
                    <label className="flex min-h-11 items-center gap-2">
                      <input type="checkbox" name="both" className="size-5" /> {L("النسخة دي عليها توقيع الطرفين", "This copy carries both parties' signatures")}
                    </label>
                  )}
                </>
              )}
              {onBehalf && (
                <label className={labelCls}>
                  {L("بالنيابة عن", "On behalf of")}
                  <select name="side" className={field}>
                    <option value="SELLER">{L("البائع", "Seller")}</option>
                    <option value="BUYER">{L("المشتري", "Buyer")}</option>
                  </select>
                </label>
              )}
              <button className={`${btn.small} self-start bg-brand text-white`}>{L("ارفع للمراجعة", "Upload for review")}</button>
            </form>
          </details>
        )}
      </div>

      {/* ٣ التحقق */}
      <div className={slot}>
        <strong>{L("٣. التحقق", "3. Verification")}</strong>
        {c.status === "VERIFIED" ? (
          <Badge tone="green">{L("متحقق منه", "Verified")}</Badge>
        ) : c.status === "SIGNED" ? (
          <span className="text-[#8A5A00]">{L("مستني مراجعة المحامي", "Awaiting the lawyer's review")}</span>
        ) : (
          <span className="text-[13px] text-muted">{L("بيتفتح بعد اكتمال التوقيع.", "Opens once fully signed.")}</span>
        )}
        {canVerify && c.status === "SIGNED" && (
          <>
            {c.signedUploadDocumentId && c.draftDocumentId && (
              <details open>
                <summary className="min-h-11 cursor-pointer py-2 text-brand">{L("قارن جنب بعض", "Compare side by side")}</summary>
                <div className="grid gap-2 md:grid-cols-2">
                  <iframe title={L("النسخة المتولّدة", "Generated copy")} src={`/api/files/${c.draftDocumentId}`} className="h-96 w-full border border-line" />
                  <iframe title={L("النسخة المرفوعة", "Uploaded copy")} src={`/api/files/${c.signedUploadDocumentId}`} className="h-96 w-full border border-line" />
                </div>
              </details>
            )}
            <form action={verifyContract.bind(null, locale, dealId, c.id)} className="flex flex-col gap-1">
              {(
                [
                  ["signatures", L("التوقيعات موجودة", "Signatures present")],
                  ...(c.signedVia === "PAPER"
                    ? [
                        ["initials", L("الأحرف الأولى على كل صفحة", "Initials on every page")],
                        ["no_handwriting", L("مفيش شطب أو إضافة بخط اليد", "No handwritten strikes or additions")],
                      ]
                    : []),
                  ["date", L("التاريخ مكتوب", "Date written")],
                  ...(isPoa ? [["filing_only", L("توكيل تقديم ومتابعة — مش توكيل بيع", "Filing & follow-up POA — not a sale POA")]] : []),
                ] as [string, string][]
              ).map(([k, t]) => (
                <label key={k} className="flex min-h-11 items-center gap-2">
                  <input type="checkbox" name={`chk_${k}`} required className="size-5" /> {t}
                </label>
              ))}
              <label className={labelCls}>
                {L("مكان الأصل الورقي", "Paper original")}
                <select name="paperWhere" className={field}>
                  <option value="">{L("توقيع إلكتروني — مفيش أصل", "E-signed — no paper")}</option>
                  <option value="client">{L("مع العميل", "With the client")}</option>
                  <option value="office">{L("في المكتب", "At the office")}</option>
                  <option value="shipped">{L("اتشحن", "Shipped")}</option>
                </select>
              </label>
              <input name="paperOriginalLocation" aria-label={L("رقم الملف أو بوليصة الشحن", "File no. or waybill")} placeholder={L("رقم الملف / بوليصة الشحن", "File no. / waybill")} className={field} />
              <button className={`${btn.small} self-start bg-ok text-white`}>{L("مطابق — تم التحقق", "Matches — verified")}</button>
            </form>
            {c.signedVia === "PAPER" && (
              <form action={rejectSignedContract.bind(null, locale, dealId, c.id)} className="flex flex-col gap-1 border-t border-line pt-2">
                <input name="reason" required minLength={5} aria-label={L("سبب الرفض", "Rejection reason")} placeholder={L("سبب الرفض (مثلاً: الصفحة 3 من غير أحرف أولى)", "Reason (e.g. page 3 missing initials)")} className={field} />
                <button className={`${btn.small} self-start border border-[#A32020] text-[#A32020]`}>{L("مرفوض — اطلب إعادة الرفع", "Reject — ask to re-upload")}</button>
              </form>
            )}
          </>
        )}
      </div>
    </div>
  );
}
