import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { isLocale } from "@/i18n/config";
import { DEMO_MODE, REAUTH_MINUTES, requireUser } from "@/lib/auth";
import { maskPhone, tr } from "@/lib/format";
import { Card, Container, Notice, PageHeader, btn, field, labelCls } from "@/components/ui";
import { confirmReauth, sendReauthCode } from "./actions";

type Props = { params: Promise<{ locale: string }>; searchParams: Promise<{ next?: string; sent?: string; err?: string }> };

/** PERM-08: تأكيد الهوية تاني قبل الأفعال الحرجة (صرف، تغيير دور، أسعار الصرف) */
export default async function ReauthPage({ params, searchParams }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const sp = await searchParams;
  const L = tr(locale);
  const next = sp.next ?? `/${locale}/account`;
  const user = await requireUser(locale, `/${locale}/account/reauth?next=${encodeURIComponent(next)}`);
  const hasTotp = !!user.totpEnabledAt;
  const demo = DEMO_MODE ? (await cookies()).get("resell_reauth_demo")?.value : undefined;

  return (
    <>
      <PageHeader
        title={L("أكّد هويتك", "Confirm it's you")}
        subtitle={L(`الفعل ده حساس، فمحتاجين نتأكد إنك إنت. التأكيد صالح ${REAUTH_MINUTES} دقايق.`, `This action is sensitive, so we need to confirm it's you. Confirmation lasts ${REAUTH_MINUTES} minutes.`)}
      />
      <Container className="flex max-w-xl flex-col gap-4">
        {sp.err === "code" && <Notice tone="red">{L("الرمز غلط أو خلص.", "The code is wrong or expired.")}</Notice>}
        {sp.err === "rate" && <Notice tone="red">{L("محاولات كتير. استنى 15 دقيقة.", "Too many attempts. Wait 15 minutes.")}</Notice>}
        {hasTotp && (
          <Card title={L("رمز تطبيق التحقق", "Authenticator code")}>
            <form action={confirmReauth.bind(null, locale, next)} className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="method" value="totp" />
              <label className={labelCls}>
                {L("الرمز من التطبيق", "Code from the app")}
                <input name="code" inputMode="numeric" autoComplete="one-time-code" required className={`${field} w-40`} dir="ltr" />
              </label>
              <button className={btn.primary}>{L("تأكيد", "Confirm")}</button>
            </form>
          </Card>
        )}
        <Card title={L("رمز على الموبايل أو الإيميل", "Code by mobile or email")}>
          {!sp.sent ? (
            <form action={sendReauthCode.bind(null, locale, next)}>
              <p className="mb-3 text-sm text-muted">{L(`هنبعت رمز لـ ${maskPhone(user.phone)}${user.email ? " أو إيميلك" : ""}.`, `We'll send a code to ${maskPhone(user.phone)}${user.email ? " or your email" : ""}.`)}</p>
              <button className={btn.secondary}>{L("ابعت الرمز", "Send the code")}</button>
            </form>
          ) : (
            <form action={confirmReauth.bind(null, locale, next)} className="flex flex-wrap items-end gap-2">
              {demo && <Notice tone="amber">{L(`وضع تجريبي — الرمز: ${demo}`, `Demo mode — code: ${demo}`)}</Notice>}
              <label className={labelCls}>
                {L("الرمز", "Code")}
                <input name="code" inputMode="numeric" autoComplete="one-time-code" required className={`${field} w-40`} dir="ltr" />
              </label>
              <button className={btn.primary}>{L("تأكيد", "Confirm")}</button>
            </form>
          )}
        </Card>
      </Container>
    </>
  );
}
