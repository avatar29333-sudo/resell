import { notFound, redirect } from "next/navigation";
import { safeNext } from "@/lib/safe-next";
import { isLocale } from "@/i18n/config";
import { db } from "@/lib/db";
import { DEMO_MODE, getCurrentUser, homeFor } from "@/lib/auth";
import { tr } from "@/lib/format";
import { ROLE, label } from "@/lib/labels";
import { Card, Container, PageHeader } from "@/components/ui";
import { SignInFlow } from "./SignInFlow";
import { pageMeta } from "@/lib/meta";
import { demoSignIn } from "./actions";

type Props = { params: Promise<{ locale: string }>; searchParams: Promise<{ next?: string }> };

export const generateMetadata = ({ params }: { params: Promise<{ locale: string }> }) => pageMeta(params, "دخول أو حساب جديد", "Sign in", { noindex: true });

export default async function SignInPage({ params, searchParams }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const { next } = await searchParams;
  const L = tr(locale);
  const user = await getCurrentUser();
  // UX-03: لو داخل بالفعل → يروح للصفحة المطلوبة (مسار داخلي بس)
  if (user) redirect(safeNext(locale, next) ?? `/${locale}/${homeFor(user.role)}`);

  // حسابات التجربة: الفريق + أول عميلين
  const demoUsers = DEMO_MODE
    ? [
        ...(await db.user.findMany({ where: { role: { not: "CLIENT" }, status: "ACTIVE" }, orderBy: [{ role: "asc" }, { name: "asc" }], take: 12 })),
        ...(await db.user.findMany({ where: { role: "CLIENT", listings: { some: {} } }, orderBy: { phone: "asc" }, take: 1 })),
        ...(await db.user.findMany({ where: { role: "CLIENT", dealsAsBuyer: { some: {} } }, orderBy: { phone: "asc" }, take: 1 })),
      ]
    : [];

  return (
    <>
      <PageHeader
        title={L("دخول أو حساب جديد", "Sign in or create an account")}
        subtitle={L("بنستخدم رمز على واتساب بدل الباسورد — مناسب لو أنت برّه مصر.", "We use a WhatsApp code instead of a password — works wherever you live.")}
      />
      <Container className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card title={L("بياناتك", "Your details")}>
          <SignInFlow locale={locale} next={safeNext(locale, next)} demo={DEMO_MODE} />
        </Card>

        {DEMO_MODE && demoUsers.length > 0 && (
          <Card title={L("دخول سريع بحسابات التجربة", "Quick sign-in with demo accounts")}>
            <p className="text-sm leading-6 text-muted">
              {L(
                "عشان تجرّب كل دور من غير رمز. الزرار ده موجود في النسخة التجريبية بس.",
                "To try each role without a code. This only exists in the demo version.",
              )}
            </p>
            <ul className="grid gap-2 sm:grid-cols-2">
              {demoUsers.map((u, i) => (
                <li key={u.id}>
                  <form action={demoSignIn.bind(null, locale, u.id, safeNext(locale, next))}>
                    <button
                      type="submit"
                      className="flex min-h-14 w-full flex-col items-start justify-center border border-line px-3 py-2 text-start hover:border-brand hover:bg-paper"
                    >
                      <span className="font-semibold">{u.name}</span>
                      <span className="text-xs text-muted">
                        {label(ROLE, u.role, locale)}
                        {u.role === "CLIENT" && (i === demoUsers.length - 1 ? L(" · مشتري", " · buyer") : L(" · بائع", " · seller"))}
                      </span>
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </Container>
    </>
  );
}
