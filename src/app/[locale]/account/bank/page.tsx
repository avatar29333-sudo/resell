import { notFound } from "next/navigation";
import { isLocale } from "@/i18n/config";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { date, tr } from "@/lib/format";
import { Badge, Card, Container, Notice, PageHeader, btn, field, labelCls } from "@/components/ui";
import { OtpConfirm } from "@/components/OtpConfirm";
import { MultiUpload } from "@/components/MultiUpload";
import { OTP_ERRORS } from "@/lib/action-otp";
import { FEE_NOTICE } from "@/lib/bank-rules";
import { pageMeta } from "@/lib/meta";
import { addBankAccount, disableBank, setDefaultBank } from "./actions";

type Props = { params: Promise<{ locale: string }>; searchParams: Promise<{ ok?: string; err?: string }> };

export const generateMetadata = ({ params }: { params: Promise<{ locale: string }> }) => pageMeta(params, "حساباتي البنكية", "My bank accounts", { noindex: true });

const STATUS: Record<string, [string, string, "amber" | "green" | "red" | "gray"]> = {
  PENDING: ["مستني تحقق المالية", "Awaiting finance verification", "amber"],
  VERIFIED: ["متحقق منه", "Verified", "green"],
  REJECTED: ["مرفوض", "Rejected", "red"],
  DISABLED: ["موقوف", "Disabled", "gray"],
};

/** BANK-01 — «حسابي ← حساباتي البنكية» */
export default async function BankPage({ params, searchParams }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const sp = await searchParams;
  const L = tr(locale);
  const ar = locale === "ar";
  const me = await requireUser(locale, `/${locale}/account/bank`);
  const accounts = await db.bankAccount.findMany({ where: { userId: me.id }, orderBy: [{ status: "asc" }, { createdAt: "desc" }] });
  const ERR: Record<string, string> = {
    iban: L("رقم الـ IBAN مش صحيح (الطول أو رقم المراجعة). المصري بيبدأ بـ EG وطوله 29.", "Invalid IBAN (length or check digits). Egyptian IBANs start with EG and are 29 characters."),
    swift: L("كود SWIFT لازم يكون 8 أو 11 حرف.", "SWIFT/BIC must be 8 or 11 characters."),
    fields: L("كمّل اسم صاحب الحساب واسم البنك.", "Enter the account holder and bank name."),
    taken: L("الحساب ده متسجل لمستخدم تاني — ممنوع حساب طرف تالت.", "This account belongs to another user — third-party accounts aren't allowed."),
    exists: L("الحساب ده متسجل عندك بالفعل.", "You already added this account."),
    locked: L("الحساب ده مثبّت على صفقة شغالة — أي تغيير محتاج موافقة المالية.", "This account is locked to an active deal — changes need finance approval."),
    ...Object.fromEntries(Object.entries(OTP_ERRORS).map(([k, v]) => [k, ar ? v[0] : v[1]])),
  };

  return (
    <>
      <PageHeader
        crumbs={[
          { href: `/${locale}/account`, label: L("حسابي", "My account") },
          { href: `/${locale}/account/bank`, label: L("حساباتي البنكية", "My bank accounts") },
        ]}
        title={L("حساباتي البنكية", "My bank accounts")}
        subtitle={L("الحساب اللي هتستلم عليه أو هيترد لك عليه. لازم يكون باسمك.", "The account you receive or get refunds on. It must be in your name.")}
      />
      <Container className="flex max-w-3xl flex-col gap-6">
        {sp.err && <Notice tone="red">{ERR[sp.err] ?? ERR.fields}</Notice>}
        {sp.ok === "added" && (
          <Notice tone="green">
            {L("الحساب اتضاف وبعتنالك تنبيه. المالية هتراجع إثبات الملكية، والحساب يتستخدم في الصرف بعد 48 ساعة من الإضافة.", "Account added and an alert was sent to you. Finance will review the proof; the account can receive payouts 48 hours after it was added.")}
          </Notice>
        )}
        <Notice tone="amber">{ar ? FEE_NOTICE[0] : FEE_NOTICE[1]}</Notice>

        <Card title={L("حساباتك", "Your accounts")}>
          {accounts.length === 0 ? (
            <p className="text-muted">{L("مفيش حسابات لسه.", "No accounts yet.")}</p>
          ) : (
            <ul className="flex flex-col divide-y divide-line">
              {accounts.map((a) => {
                const cooling = a.usableAfter > new Date();
                return (
                  <li key={a.id} className="flex flex-col gap-2 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="flex flex-col">
                        <span className="font-semibold">
                          {a.bankName} · {a.currency}
                        </span>
                        <span dir="ltr" className="text-start tabular-nums">
                          {a.country}•• •••• •••• {a.ibanLast4}
                        </span>
                        <span className="text-[13px] text-muted">
                          {a.holderName} · {L("اتضاف", "added")} {date(a.createdAt, locale)}
                        </span>
                      </span>
                      <span className="flex flex-wrap items-center gap-2">
                        {a.isDefault && <Badge tone="blue">{L(`افتراضي (${a.currency})`, `Default (${a.currency})`)}</Badge>}
                        <Badge tone={STATUS[a.status][2]}>{STATUS[a.status][ar ? 0 : 1]}</Badge>
                        {cooling && a.status !== "DISABLED" && <Badge tone="amber">{L("فترة انتظار 48 ساعة", "48-hour waiting period")}</Badge>}
                      </span>
                    </div>
                    {!a.nameMatches && a.status === "PENDING" && <span className="text-sm text-[#8A5A00]">{L("الاسم مش مطابق لاسمك الموثّق — المالية هتراجعه يدوياً.", "The name doesn't match your verified name — finance will review it manually.")}</span>}
                    {a.status === "REJECTED" && a.rejectReason && <span className="text-sm text-[#A32020]">{a.rejectReason}</span>}
                    {a.status !== "DISABLED" && (
                      <div className="flex flex-wrap gap-2">
                        {!a.isDefault && (
                          <form action={setDefaultBank.bind(null, locale, a.id)}>
                            <button className={`${btn.small} border border-line`}>{L("خليه الافتراضي", "Make default")}</button>
                          </form>
                        )}
                        <form action={disableBank.bind(null, locale, a.id)}>
                          <button className={`${btn.small} border border-line`}>{L("أوقف الحساب", "Disable")}</button>
                        </form>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          <p className="text-sm text-muted">{L("الحسابات ما بتتمسحش — بتتوقف بس، والمستخدمة في صفقات بتفضل في السجل.", "Accounts are never deleted — only disabled; ones used in deals stay on record.")}</p>
        </Card>

        <Card title={L("أضف حساب", "Add an account")}>
          <OtpConfirm
            locale={locale}
            action="bank.add"
            subjectId={null}
            fields={["iban"]}
            preview={L("إضافة حساب بنكي جديد لحسابك", "Adding a new bank account to your profile")}
            submitLabel={L("أضف الحساب", "Add account")}
            formAction={addBankAccount.bind(null, locale)}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <label className={labelCls}>
                {L("اسم صاحب الحساب (زي البطاقة)", "Account holder (as on your ID)")}
                <input name="holderName" required minLength={3} defaultValue={me.name} className={field} />
              </label>
              <label className={labelCls}>
                {L("اسم البنك", "Bank name")}
                <input name="bankName" required minLength={2} className={field} />
              </label>
              <label className={labelCls}>
                IBAN
                <input name="iban" required dir="ltr" placeholder="EG38 0019 0005 0000 0000 2631 8000 2" autoComplete="off" className={`${field} text-start tabular-nums`} />
              </label>
              <label className={labelCls}>
                {L("العملة", "Currency")}
                <select name="currency" className={field}>
                  {["EGP", "USD", "EUR", "GBP", "SAR", "AED", "KWD", "QAR"].map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
              <label className={labelCls}>
                {L("SWIFT / BIC (للحسابات برّه مصر)", "SWIFT / BIC (for accounts abroad)")}
                <input name="swiftBic" dir="ltr" maxLength={11} className={`${field} text-start uppercase`} />
              </label>
              <label className={labelCls}>
                {L("الفرع (اختياري)", "Branch (optional)")}
                <input name="branch" className={field} />
              </label>
            </div>
            <div className={labelCls}>
              <span>{L("إثبات ملكية: كشف حساب أو خطاب من البنك فيه اسمك والـ IBAN", "Proof of ownership: a statement or bank letter showing your name and IBAN")}</span>
              <MultiUpload locale={locale} single titleRequired={false} defaultTitle={L("إثبات ملكية حساب بنكي", "Bank account proof")} />
            </div>
          </OtpConfirm>
          <p className="text-sm text-muted">
            {L(
              "🔒 رقم الحساب متشفّر ومش بيظهر كامل غير للمالية (وكل فتح بيتسجل). بنستخدمه بس لتحويل مستحقاتك أو رد العربون، ولمدة التعامل + المدة القانونية (قانون 151 لسنة 2020).",
              "🔒 The account number is encrypted and shown in full only to finance (every view is logged). It's used only to pay you or refund your deposit, for the relationship plus the legal retention period (Law 151/2020).",
            )}
          </p>
        </Card>
      </Container>
    </>
  );
}
