import Link from "next/link";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { isLocale } from "@/i18n/config";
import { REQUIRE_STAFF_2FA, STAFF_ROLES, requireUser } from "@/lib/auth";
import { decryptSecret, otpauthUri } from "@/lib/totp";
import { date, tr } from "@/lib/format";
import { Badge, Card, Container, Notice, PageHeader, btn, field, labelCls } from "@/components/ui";
import { pageMeta } from "@/lib/meta";
import { confirmTotp, deleteMyAccount, disableTotp, setOtpChannel, startTotp } from "./actions";
import { CHANNELS, CHANNEL_LABEL, OTP_ERRORS, effectiveChannel } from "@/lib/action-otp";
import { OtpConfirm } from "@/components/OtpConfirm";

type Props = { params: Promise<{ locale: string }>; searchParams: Promise<{ ok?: string; err?: string; required?: string }> };

export const generateMetadata = ({ params }: { params: Promise<{ locale: string }> }) => pageMeta(params, "الأمان والتحقق الثنائي", "Security", { noindex: true });

export default async function SecurityPage({ params, searchParams }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const sp = await searchParams;
  const L = tr(locale);
  const me = await requireUser(locale, `/${locale}/account/security`);
  const staff = STAFF_ROLES.includes(me.role);
  const ar = locale === "ar";
  const channel = effectiveChannel(me);

  // سر لسه في التفعيل: نعرض QR والمفتاح عشان يتضاف للتطبيق
  let qr: string | null = null;
  let manual: string | null = null;
  if (me.totpSecret && !me.totpEnabledAt) {
    manual = decryptSecret(me.totpSecret);
    qr = await QRCode.toString(otpauthUri(manual, me.email ?? me.phone), { type: "svg", margin: 1, width: 200 });
  }

  const errors: Record<string, string> = {
    code: L("الرمز غلط أو خلص. اكتب الرمز اللي ظاهر في التطبيق دلوقتي.", "Wrong or expired code. Enter the code currently shown in the app."),
    required: L("التحقق الثنائي إجباري لحسابات الفريق.", "Two-factor authentication is required for team accounts."),
    confirm: L("اكتب كلمة «احذف» عشان نتأكد.", "Type DELETE to confirm."),
    open_deals: L("عندك صفقات شغالة. لازم تخلص أو تتلغي الأول قبل حذف الحساب.", "You have open deals. They must finish or be cancelled before deleting your account."),
    channel: L("القناة دي مش متاحة لحسابك (التطبيق لازم يكون متفعّل، والإيميل لازم يكون متسجّل).", "That channel isn't available (the app must be on, and email must be set)."),
    ...Object.fromEntries(Object.entries(OTP_ERRORS).map(([k, v]) => [k, ar ? v[0] : v[1]])),
    staff: L("حسابات الفريق بتتقفل من الأدمن، مش من هنا.", "Team accounts are closed by an admin, not here."),
  };

  return (
    <>
      <PageHeader
        crumbs={[
          { href: `/${locale}/account`, label: L("حسابي", "My account") },
          { href: `/${locale}/account/security`, label: L("الخصوصية والأمان", "Privacy & security") },
        ]}
        title={L("الخصوصية والأمان", "Privacy & security")}
      />
      <Container className="flex max-w-3xl flex-col gap-6">
        {sp.required && <Notice tone="amber">{errors.required} {L("فعّله عشان تكمّل لشاشات الفريق.", "Turn it on to continue to team screens.")}</Notice>}
        {sp.err && errors[sp.err] && <Notice tone="red">{errors[sp.err]}</Notice>}
        {sp.ok === "enabled" && <Notice tone="green">{L("التحقق الثنائي اتفعّل. من المرة الجاية هيتطلب رمز التطبيق بعد رمز الدخول.", "Two-factor is on. Next time you'll be asked for the app code after the sign-in code.")}</Notice>}
        {sp.ok === "disabled" && <Notice tone="amber">{L("التحقق الثنائي اتقفل.", "Two-factor authentication was turned off.")}</Notice>}

        <Card
          title={L("التحقق الثنائي (تطبيق Authenticator)", "Two-factor authentication (authenticator app)")}
          actions={me.totpEnabledAt ? <Badge tone="green">{L("مفعّل", "On")}</Badge> : <Badge tone={staff ? "amber" : "gray"}>{L("مش مفعّل", "Off")}</Badge>}
        >
          <p className="leading-7 text-muted">
            {L(
              "بعد رمز واتساب أو الإيميل، بيتطلب رمز من تطبيق على موبايلك. حتى لو حد وصل لرقمك ما يقدرش يدخل.",
              "After the WhatsApp or email code, you'll enter a code from an app on your phone. Even if someone gets your number, they can't sign in.",
            )}
            {staff && L(" إجباري لحسابات الفريق.", " Required for team accounts.")}
          </p>

          {me.totpEnabledAt ? (
            <>
              <p>{L(`مفعّل من ${date(me.totpEnabledAt, locale)}.`, `On since ${date(me.totpEnabledAt, locale)}.`)}</p>
              {!(REQUIRE_STAFF_2FA && staff) && (
                <form action={disableTotp.bind(null, locale)} className="flex flex-wrap items-end gap-2">
                  <label className={labelCls}>
                    {L("رمز التطبيق للتأكيد", "App code to confirm")}
                    <input name="code" required inputMode="numeric" maxLength={6} dir="ltr" className={`${field} w-40 text-center tracking-widest`} />
                  </label>
                  <button className={btn.danger}>{L("اقفل التحقق الثنائي", "Turn off")}</button>
                </form>
              )}
            </>
          ) : qr ? (
            <div className="grid gap-5 sm:grid-cols-[auto_minmax(0,1fr)]">
              <div className="w-[200px] border border-line bg-white p-2" dangerouslySetInnerHTML={{ __html: qr }} />
              <form action={confirmTotp.bind(null, locale)} className="flex flex-col gap-3">
                <ol className="list-decimal ps-5 leading-7">
                  <li>{L("نزّل Google Authenticator أو Microsoft Authenticator.", "Install Google Authenticator or Microsoft Authenticator.")}</li>
                  <li>{L("امسح الكود بالكاميرا، أو اكتب المفتاح ده يدوي:", "Scan the code, or enter this key manually:")}</li>
                </ol>
                <code dir="ltr" className="bg-paper px-2 py-1 text-sm break-all">
                  {manual!.match(/.{1,4}/g)!.join(" ")}
                </code>
                <label className={labelCls}>
                  {L("3. اكتب الرمز اللي ظهر في التطبيق", "3. Enter the code shown in the app")}
                  <input name="code" required inputMode="numeric" maxLength={6} dir="ltr" className={`${field} w-40 text-center tracking-widest`} />
                </label>
                <button className={btn.primary}>{L("أكّد وفعّل", "Confirm and turn on")}</button>
              </form>
            </div>
          ) : (
            <form action={startTotp.bind(null, locale)}>
              <button className={btn.primary}>{L("فعّل التحقق الثنائي", "Turn on two-factor")}</button>
            </form>
          )}
        </Card>

        {sp.ok === "channel" && <Notice tone="green">{L("قناة كود التحقق اتغيرت.", "Your verification channel was changed.")}</Notice>}
        <Card title={L("قناة كود التأكيد للموافقات", "Confirmation-code channel for approvals")} actions={<Badge tone="blue">{CHANNEL_LABEL[channel][ar ? 0 : 1]}</Badge>}>
          <p className="leading-7 text-muted">
            {L("كل موافقة جوه الصفقة (سعر، توقيع، عربون، إلغاء) بتتأكد بكود من 6 أرقام صالح 5 دقايق ومربوط بالإجراء ده بس. تغيير القناة بيتأكد بكود على القناة الحالية.", "Every approval in a deal (price, signature, deposit, cancellation) is confirmed with a 6-digit code valid for 5 minutes and bound to that action only. Changing the channel is confirmed by a code on the current channel.")}
          </p>
          <OtpConfirm locale={locale} action="otp.channel_change" subjectId={null} fields={["channel"]} preview={L("تغيير قناة كود التحقق للقناة اللي هتختارها", "Change your verification channel to the one you pick")} submitLabel={L("غيّر القناة", "Change channel")} formAction={setOtpChannel.bind(null, locale)}>
            <label className={labelCls}>
              {L("القناة الجديدة", "New channel")}
              <select name="channel" defaultValue={channel} className={field}>
                {CHANNELS.filter((c) => (c !== "totp" || me.totpEnabledAt) && (c !== "email" || me.email)).map((c) => (
                  <option key={c} value={c}>
                    {CHANNEL_LABEL[c][ar ? 0 : 1]}
                  </option>
                ))}
              </select>
            </label>
          </OtpConfirm>
        </Card>

        <Card title={L("بياناتك وخصوصيتك", "Your data and privacy")}>
          <p className="leading-7 text-muted">
            {L("وافقت على الشروط وسياسة الخصوصية: ", "You accepted the terms and privacy policy: ")}
            {me.termsAcceptedAt ? date(me.termsAcceptedAt, locale) : L("قبل تحديث السياسة", "before the policy update")}.{" "}
            <Link href={`/${locale}/privacy`} className="font-semibold text-brand">
              {L("اقرا سياسة الخصوصية", "Read the privacy policy")}
            </Link>
          </p>
        </Card>

        {!staff && (
          <Card title={<span id="delete">{L("حذف الحساب", "Delete account")}</span>}>
            <p className="leading-7 text-muted">
              {L(
                "بنمسح اسمك ورقمك وإيميلك، وعروضك المفتوحة بتتسحب. العقود الموقّعة وسجل التدقيق بيفضلوا من غير اسمك لأن القانون بيلزمنا نحتفظ بيهم. الحذف نهائي.",
                "We erase your name, number and email, and withdraw your open listings. Signed contracts and the audit log are kept without your name, as the law requires. This is permanent.",
              )}
            </p>
            <form action={deleteMyAccount.bind(null, locale)} className="flex flex-wrap items-end gap-2">
              <label className={labelCls}>
                {L("اكتب «احذف» للتأكيد", "Type DELETE to confirm")}
                <input name="confirm" required className={`${field} w-48`} />
              </label>
              <button className={btn.danger}>{L("احذف حسابي نهائياً", "Permanently delete my account")}</button>
            </form>
          </Card>
        )}
      </Container>
    </>
  );
}
