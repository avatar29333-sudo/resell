import Link from "next/link";
import { notFound } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { isLocale } from "@/i18n/config";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { can, subject } from "@/lib/authz";
import { scopeUsersFor } from "@/lib/authz/scope";
import { auditWhere } from "@/lib/audit-query";
import { AUDIT_GROUPS, auditLabel } from "@/lib/audit-labels";
import { errorText } from "@/lib/errors";
import { getSetting } from "@/lib/settings";
import { date, dateTime, money, num, tr } from "@/lib/format";
import { ACCOUNT_LEVEL, ACCOUNT_STATUS, CITY, CITY_KEYS, CONTRACT_TYPE, RATE_SOURCE, ROLE, label } from "@/lib/labels";
import { Badge, Card, Container, DL, Notice, PageHeader, Table, Tabs, btn, field, labelCls } from "@/components/ui";
import { saveMarketing } from "./actions";
import { addDistrict, addManualRate, bumpTemplate, fetchRateNow, moveFilesToS3, saveCommission, saveFees, saveOps, setUserRole, suspendUser, toggleDistrict, unsuspendUser } from "./actions";
import { RoleForm } from "./RoleForm";
import { pageMeta } from "@/lib/meta";
import { storageMode } from "@/lib/storage";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ tab?: string; q?: string; page?: string; role?: string; city?: string; from?: string; to?: string; actor?: string; group?: string; entity?: string; fx?: string; moved?: string; failed?: string; err?: string; ok?: string; buy?: string; sell?: string }>;
};

const PAGE = 50;
const SETTINGS_ERRORS: Record<string, [string, string]> = {
  reg_no: ["السمسار الشريك لازم يكون ليه رقم قيد في سجل الوسطاء.", "A partner broker needs a broker registry number."],
  confirm: ["لازم تأكد تغيير الدور من رسالة التأكيد.", "Please confirm the role change in the dialog."],
  district: ["اكتب اسم الحي بالعربي والإنجليزي.", "Enter the district name in Arabic and English."],
  rate_invalid: ["سعر البيع لازم يكون أكبر من أو يساوي سعر الشراء.", "The sell rate must be greater than or equal to the buy rate."],
  rate_deviation: ["السعر بعيد عن آخر سعر آلي أكتر من الحد المسموح — علّم على «متأكد» لو ده مقصود.", "The rate is further from the last automatic rate than allowed — tick “I'm sure” if intended."],
};

export const generateMetadata = ({ params }: { params: Promise<{ locale: string }> }) => pageMeta(params, "الإعدادات", "Settings", { noindex: true });

export default async function SettingsPage({ params, searchParams }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const sp = await searchParams;
  const L = tr(locale);
  const ar = locale === "ar";
  const me = await requireUser(locale, `/${locale}/settings`, ["ADMIN", "FINANCE"]);
  const s = subject(me);
  const allowed = {
    users: can(s, "user.list").allowed,
    fx: can(s, "fx.manual").allowed,
    commission: can(s, "commission.rates").allowed,
    templates: can(s, "template.edit").allowed,
    districts: can(s, "settings.fees").allowed,
    storage: can(s, "storage.manage").allowed,
    audit: can(s, "audit.view").allowed || can(s, "audit.view_money").allowed,
  };
  const tabs = (Object.keys(allowed) as (keyof typeof allowed)[]).filter((k) => allowed[k]);
  const tab = tabs.includes(sp.tab as never) ? sp.tab! : tabs[0];
  const base = `/${locale}/settings`;
  const fxStatus = sp.fx;
  const OK: Record<string, [string, string]> = {
    role: ["الدور اتغيّر، وجلسات المستخدم القديمة اتقفلت.", "Role changed; the user's old sessions were signed out."],
    suspended: ["الحساب اتوقف، وصفقاته الشغالة اتعلّقت.", "Account suspended; its active deals were put on hold."],
    unsuspended: ["الحساب اتفعّل تاني.", "Account reactivated."],
  };

  return (
    <>
      <PageHeader
        title={L("الإعدادات", "Settings")}
        subtitle={L("الأدوار، سعر الصرف، نسب العمولة، نماذج العقود، وسجل التدقيق. كل تغيير هنا بيتسجل.", "Roles, exchange rates, commission rates, contract templates and the audit log. Every change here is logged.")}
      />
      <Container className="flex flex-col gap-6">
        {sp.err && sp.err !== "s3_not_configured" && <Notice tone="red">{errorText(sp.err, ar, SETTINGS_ERRORS)}</Notice>}
        {sp.ok && OK[sp.ok] && <Notice tone="green">{OK[sp.ok][ar ? 0 : 1]}</Notice>}
        <Tabs
          current={tab}
          tabs={[
            { key: "users", label: L("المستخدمين والأدوار", "Users and roles"), href: `${base}?tab=users` },
            { key: "fx", label: L("سعر الصرف", "Exchange rate"), href: `${base}?tab=fx` },
            { key: "commission", label: L("العمولة والرسوم", "Commission and fees"), href: `${base}?tab=commission` },
            { key: "templates", label: L("نماذج العقود", "Contract templates"), href: `${base}?tab=templates` },
            { key: "districts", label: L("الأحياء والمراحل", "Districts"), href: `${base}?tab=districts` },
            { key: "storage", label: L("خزنة الملفات", "File vault"), href: `${base}?tab=storage` },
            { key: "audit", label: L("سجل التدقيق", "Audit log"), href: `${base}?tab=audit` },
          ].filter((t) => tabs.includes(t.key as never))}
        />
        {tab === "users" && <Users locale={locale} q={sp.q} meId={me.id} />}
        {tab === "fx" && <Fx locale={locale} />}
        {tab === "commission" && <Commission locale={locale} />}
        {tab === "templates" && <Templates locale={locale} />}
        {tab === "districts" && <Districts locale={locale} />}
        {tab === "storage" && <Storage locale={locale} />}
        {tab === "audit" && <Audit locale={locale} entity={sp.entity} />}
      </Container>
    </>
  );

  async function Users({ locale, q, meId }: { locale: "ar" | "en"; q?: string; meId: string }) {
    // SEC-07: بحث + تقسيم صفحات (50)
    const page = Math.max(1, Number(sp.page) || 1);
    const roleFilter = Object.keys(ROLE).includes(sp.role ?? "") ? sp.role : undefined;
    const where: Prisma.UserWhereInput = {
      AND: [
        scopeUsersFor(me),
        { anonymizedAt: null },
        roleFilter ? { role: roleFilter as never } : {},
        q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { phone: { contains: q } }, { email: { contains: q, mode: "insensitive" } }] } : {},
      ],
    };
    const [users, total] = await Promise.all([
      db.user.findMany({ where, orderBy: [{ role: "desc" }, { name: "asc" }], skip: (page - 1) * PAGE, take: PAGE }),
      db.user.count({ where }),
    ]);
    const pages = Math.max(1, Math.ceil(total / PAGE));
    const roleOptions = Object.keys(ROLE).map((k) => ({ key: k, label: label(ROLE, k, locale) }));
    const qs = (p: number) => `${base}?tab=users${q ? `&q=${encodeURIComponent(q)}` : ""}${roleFilter ? `&role=${roleFilter}` : ""}&page=${p}`;
    return (
      <Card title={L(`المستخدمين (${num(total, locale)})`, `Users (${total})`)}>
        <form className="flex flex-wrap gap-2">
          <input type="hidden" name="tab" value="users" />
          <input aria-label={L("ابحث بالاسم أو الرقم أو الإيميل", "Search by name, number or email")} name="q" defaultValue={q} placeholder={L("ابحث بالاسم أو الرقم أو الإيميل", "Search by name, number or email")} className={`${field} max-w-sm`} />
          <select name="role" defaultValue={roleFilter ?? ""} className={`${field} w-44`} aria-label={L("الدور", "Role")}>
            <option value="">{L("كل الأدوار", "All roles")}</option>
            {roleOptions.map((r) => (
              <option key={r.key} value={r.key}>
                {r.label}
              </option>
            ))}
          </select>
          <button className={btn.secondary}>{L("بحث", "Search")}</button>
        </form>
        <Table head={[L("الاسم", "Name"), L("الموبايل", "Mobile"), L("المستوى", "Level"), L("الحالة", "Status"), L("الدور", "Role")]}>
          {users.map((u) => (
            <tr key={u.id}>
              <td className="font-semibold">
                {u.name}
                {u.brokerRegNo && (
                  <div className="text-xs font-normal text-muted" dir="ltr">
                    #{u.brokerRegNo}
                  </div>
                )}
              </td>
              <td dir="ltr" className="text-start">
                {u.phone}
              </td>
              <td>
                <Badge tone={u.accountLevel === "VERIFIED" ? "green" : "gray"}>{label(ACCOUNT_LEVEL, u.accountLevel, locale)}</Badge>
              </td>
              <td>
                <Badge tone={u.status === "SUSPENDED" ? "red" : "green"}>{label(ACCOUNT_STATUS, u.status, locale)}</Badge>
                {u.id !== meId &&
                  (u.status === "SUSPENDED" ? (
                    <form action={unsuspendUser.bind(null, locale, u.id)} className="mt-1">
                      {u.suspendReason && <div className="text-xs text-muted">{u.suspendReason}</div>}
                      <button className={`${btn.small} border border-line`}>{L("فعّل الحساب", "Reactivate")}</button>
                    </form>
                  ) : (
                    <details className="mt-1">
                      <summary className="cursor-pointer text-xs text-[#A32020]">{L("إيقاف…", "Suspend…")}</summary>
                      <form action={suspendUser.bind(null, locale, u.id)} className="mt-1 flex flex-col gap-1">
                        <input aria-label={L("السبب (10 حروف على الأقل)", "Reason (10+ characters)")} name="reason" required minLength={10} placeholder={L("السبب (10 حروف على الأقل)", "Reason (10+ characters)")} className={`${field} min-h-9 w-56`} />
                        <button className={`${btn.small} self-start border border-[#A32020] text-[#A32020]`}>{L("أوقف الحساب", "Suspend account")}</button>
                      </form>
                    </details>
                  ))}
              </td>
              <td>{u.id === meId ? label(ROLE, u.role, locale) : <RoleForm action={setUserRole.bind(null, locale, u.id)} current={u.role} roles={roleOptions} ar={ar} brokerRegNo={u.brokerRegNo} />}</td>
            </tr>
          ))}
        </Table>
        {pages > 1 && (
          <nav className="flex flex-wrap items-center gap-2 text-sm" aria-label={L("الصفحات", "Pages")}>
            {page > 1 && (
              <Link href={qs(page - 1)} className={`${btn.small} border border-line`}>
                {L("السابق", "Previous")}
              </Link>
            )}
            <span className="text-muted">{L(`صفحة ${num(page, locale)} من ${num(pages, locale)}`, `Page ${page} of ${pages}`)}</span>
            {page < pages && (
              <Link href={qs(page + 1)} className={`${btn.small} border border-line`}>
                {L("التالي", "Next")}
              </Link>
            )}
          </nav>
        )}
      </Card>
    );
  }

  async function Fx({ locale }: { locale: "ar" | "en" }) {
    const rates = await db.exchangeRate.findMany({ include: { enteredBy: true }, orderBy: [{ date: "desc" }, { createdAt: "desc" }], take: 20 });
    return (
      <Card title={L("سعر صرف الدولار", "USD exchange rate")}>
        <Notice>
          {L(
            "بيتسحب لوحده كل يوم الساعة 8 الصبح بتوقيت القاهرة: من البنك المركزي، ولو موقعه مش متاح من مصدر سوق مفتوح (ومكتوب المصدر جنب كل سعر). الإدخال اليدوي للطوارئ بس وبيتسجل باسمك.",
            "Fetched automatically every day at 8am Cairo time: from the Central Bank, or from an open market source if the CBE site is down (the source is shown next to each rate). Manual entry is for emergencies only and is logged under your name.",
          )}
        </Notice>
        {fxStatus === "created" && <Notice tone="green">{L("اتسحب سعر النهارده.", "Today's rate was fetched.")}</Notice>}
        {fxStatus === "exists" && <Notice tone="blue">{L("سعر النهارده متسجل بالفعل.", "Today's rate is already recorded.")}</Notice>}
        {fxStatus === "unavailable" && <Notice tone="red">{L("المصادر مش متاحة دلوقتي — سجّل السعر يدوي.", "Sources are unavailable right now — enter the rate manually.")}</Notice>}
        <form action={fetchRateNow.bind(null, locale)}>
          <button className={btn.secondary}>{L("اسحب سعر النهارده دلوقتي", "Fetch today's rate now")}</button>
        </form>
        <form action={addManualRate.bind(null, locale)} className="flex flex-wrap items-end gap-2">
          <label className={labelCls}>
            {L("شراء", "Buy")}
            <input name="buy" type="number" step="0.0001" min={1} required defaultValue={sp.buy} className={`${field} w-36`} />
          </label>
          <label className={labelCls}>
            {L("بيع", "Sell")}
            <input name="sell" type="number" step="0.0001" min={1} required defaultValue={sp.sell} className={`${field} w-36`} />
          </label>
          {sp.err === "rate_deviation" && (
            <label className="flex min-h-11 items-center gap-2 text-sm">
              <input type="checkbox" name="confirmDeviation" className="size-4" />
              {L("متأكد — السعر ده صح رغم الفرق", "I'm sure — this rate is correct despite the gap")}
            </label>
          )}
          <button className={btn.primary}>{L("سجّل سعر يدوي", "Add manual rate")}</button>
          <p className="w-full text-xs text-muted">{L("هيطلب منك تأكيد هويتك قبل الحفظ.", "You'll be asked to confirm your identity before saving.")}</p>
        </form>
        <Table head={[L("التاريخ", "Date"), L("شراء", "Buy"), L("بيع", "Sell"), L("المصدر", "Source"), L("بواسطة", "By")]}>
          {rates.map((r) => (
            <tr key={r.id}>
              <td>{date(r.date, locale)}</td>
              <td>{num(r.buy, locale, 4)}</td>
              <td>{num(r.sell, locale, 4)}</td>
              <td>
                <Badge tone={r.source === "MANUAL" ? "amber" : "gray"}>{label(RATE_SOURCE, r.source, locale)}</Badge>
              </td>
              <td>{r.enteredBy?.name ?? "—"}</td>
            </tr>
          ))}
        </Table>
      </Card>
    );
  }

  async function Commission({ locale }: { locale: "ar" | "en" }) {
    const [rescue, regNo] = await Promise.all([getSetting("rescue"), getSetting("brokerRegistrationNumber")]);
    const [rates, fees, fourEyes, fxCfg, brokersCfg, validity] = await Promise.all([
      getSetting("commission.rates"),
      getSetting("service.fees"),
      getSetting("payments.fourEyes"),
      getSetting("fx.manual"),
      getSetting("deals.unassignedBrokers"),
      getSetting("documents.validity"),
    ]);
    return (
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title={L("نسب العمولة", "Commission rates")}>
          <Notice tone="amber">{L("التغيير بيسري على الصفقات الجديدة بس — الصفقات المفتوحة محتفظة بنسبها.", "Changes apply to new deals only — open deals keep their rates.")}</Notice>
          <form action={saveCommission.bind(null, locale)} className="flex flex-wrap items-end gap-2">
            <label className={labelCls}>
              {L("من البائع (%)", "Seller (%)")}
              <input name="sellerPct" type="number" step="0.05" min={0} max={10} defaultValue={rates.sellerPct} className={`${field} w-32`} />
            </label>
            <label className={labelCls}>
              {L("من المشتري (%)", "Buyer (%)")}
              <input name="buyerPct" type="number" step="0.05" min={0} max={10} defaultValue={rates.buyerPct} className={`${field} w-32`} />
            </label>
            <button className={btn.primary}>{L("حفظ", "Save")}</button>
          </form>
        </Card>
        <Card title={L("رسوم الخدمات", "Service fees")}>
          <form action={saveFees.bind(null, locale)} className="flex flex-wrap items-end gap-2">
            <label className={labelCls}>
              {L("إنقاذ المهلة (ج.م)", "Deadline rescue (EGP)")}
              <input name="deadlineRescueEgp" type="number" min={0} defaultValue={fees.deadlineRescueEgp} className={`${field} w-40`} />
            </label>
            <label className={labelCls}>
              {L("معاينة (ج.م)", "Inspection (EGP)")}
              <input name="siteInspectionEgp" type="number" min={0} defaultValue={fees.siteInspectionEgp} className={`${field} w-40`} />
            </label>
            <label className={labelCls}>
              {L("رسوم التنازل في الجهاز (%) — فاضي لو مش معروفة", "Authority transfer fee (%) — blank if unknown")}
              <input name="authorityTransferPct" type="number" step="0.01" min={0} max={20} defaultValue={fees.authorityTransferPct ?? ""} className={`${field} w-40`} />
            </label>
            <label className={labelCls}>
              {L("أتعاب المحامي على المشتري (ج.م)", "Lawyer fee charged to buyer (EGP)")}
              <input name="buyerLawyerFeeEgp" type="number" min={0} defaultValue={fees.buyerLawyerFeeEgp ?? 0} className={`${field} w-40`} />
            </label>
            <p className="w-full text-sm text-muted">{L("الأرقام دي بتظهر في حاسبة التكلفة في صفحة كل قطعة.", "These figures feed the cost calculator on each plot page.")}</p>
            <button className={btn.primary}>{L("حفظ", "Save")}</button>
          </form>
        </Card>
        <Card title={L("القيد والتسويق", "Registration and marketing")}>
          {!regNo.value && (
            <Notice tone="red">{L("رقم القيد في سجل الوسطاء فاضي — لازم يتكتب قبل الإطلاق (بيظهر في الفوتر والعقود وصور المشاركة).", "The broker registry number is empty — it must be set before launch (shown in the footer, contracts and share images).")}</Notice>
          )}
          <form action={saveMarketing.bind(null, locale)} className="flex flex-wrap items-end gap-2">
            <label className={labelCls}>
              {L("رقم القيد في سجل الوسطاء", "Broker registry number")}
              <input name="brokerRegistrationNumber" defaultValue={regNo.value} dir="ltr" className={`${field} w-52`} />
            </label>
            <label className={labelCls}>
              {L("تاريخ قرار التسهيلات", "Relief decision date")}
              <input name="decisionDate" type="date" defaultValue={rescue.decisionDate} className={`${field} w-44`} />
            </label>
            <label className={labelCls}>
              {L("آخر موعد لتقديم إنقاذ المهلة", "Deadline-rescue application deadline")}
              <input name="deadline" type="date" defaultValue={rescue.deadline} className={`${field} w-44`} />
            </label>
            <label className={labelCls}>
              {L("نسبة مقابل السنة (%)", "One-year fee (%)")}
              <input name="feePct" type="number" min={0} max={50} step={0.5} defaultValue={rescue.feePct} className={`${field} w-28`} />
            </label>
            <button className={btn.primary}>{L("حفظ", "Save")}</button>
          </form>
        </Card>
        <Card title={L("قواعد التشغيل", "Operating rules")}>
          <form action={saveOps.bind(null, locale)} className="flex flex-wrap items-end gap-2">
            <label className={labelCls}>
              {L("حد الأربع عيون للصرف (ج.م)", "Four-eyes payout limit (EGP)")}
              <input name="fourEyesLimit" type="number" min={0} step={1000} defaultValue={fourEyes.limitEgp} className={`${field} w-44`} />
              <span className="text-xs text-muted">{money(fourEyes.limitEgp, "EGP", locale)}</span>
            </label>
            <label className={labelCls}>
              {L("أقصى فرق للسعر اليدوي عن الآلي (%)", "Max manual rate gap from automatic (%)")}
              <input name="maxDeviationPct" type="number" min={0.5} max={50} step={0.5} defaultValue={fxCfg.maxDeviationPct} className={`${field} w-32`} />
            </label>
            <label className={labelCls}>
              {L("الوسطاء غير المسندين للصفقة", "Brokers not assigned to a deal")}
              <select name="unassignedBrokers" defaultValue={brokersCfg.access} className={`${field} w-56`}>
                <option value="none">{L("ما يشوفوهاش", "Can't see it")}</option>
                <option value="read">{L("قراءة بس", "Read only")}</option>
              </select>
            </label>
            <label className={labelCls}>
              {L("صلاحية إفادة الجهاز (شهور)", "Authority statement validity (months)")}
              <input name="statementMonths" type="number" min={1} max={24} defaultValue={validity.authorityStatementMonths} className={`${field} w-28`} />
            </label>
            <label className={labelCls}>
              {L("التنبيه قبل الانتهاء (يوم)", "Warn before expiry (days)")}
              <input name="warnDays" type="number" min={1} max={120} defaultValue={validity.warnDays} className={`${field} w-28`} />
            </label>
            <label className={labelCls}>
              {L("العرض اللي إفادته انتهت", "Listing with an expired statement")}
              <select name="expiredListing" defaultValue={validity.expiredListing} className={`${field} w-56`}>
                <option value="badge">{L("يفضل ظاهر بشارة «محتاج تحديث»", "Stays visible with a “needs update” badge")}</option>
                <option value="hide">{L("يختفي من السجل العام", "Hidden from the public register")}</option>
              </select>
            </label>
            <button className={btn.primary}>{L("حفظ", "Save")}</button>
          </form>
        </Card>
      </div>
    );
  }

  async function Templates({ locale }: { locale: "ar" | "en" }) {
    const list = await getSetting("contract.templates");
    return (
      <Card title={L("نماذج العقود", "Contract templates")}>
        <p className="text-muted">{L("نص النماذج بيراجعه المحامي. كل عقد بيتعمل بيحتفظ برقم النسخة اللي اتعمل بيها.", "Template text is reviewed by the lawyer. Each contract keeps the version it was created with.")}</p>
        <Table head={[L("النموذج", "Template"), L("النسخة", "Version"), L("آخر تحديث", "Updated"), L("نسخة جديدة", "New version")]}>
          {list.map((t) => (
            <tr key={t.type}>
              <td className="font-semibold">{label(CONTRACT_TYPE, t.type, locale)}</td>
              <td>
                <Badge tone="blue">{t.version}</Badge>
              </td>
              <td>
                {date(t.updatedAt, locale)}
                {t.note && <div className="text-xs text-muted">{t.note}</div>}
              </td>
              <td>
                <form action={bumpTemplate.bind(null, locale, t.type)} className="flex gap-1.5">
                  <input aria-label={L("إيه اللي اتغير؟", "What changed?")} name="note" required placeholder={L("إيه اللي اتغير؟", "What changed?")} className={`${field} min-h-9`} />
                  <button className={`${btn.small} border border-brand text-brand`}>{L("انشر", "Publish")}</button>
                </form>
              </td>
            </tr>
          ))}
        </Table>
      </Card>
    );
  }

  async function Districts({ locale }: { locale: "ar" | "en" }) {
    const city = (CITY_KEYS as string[]).includes(sp.city ?? "") ? sp.city! : CITY_KEYS[0];
    const rows = await db.district.findMany({ where: { city: city as never }, orderBy: [{ sort: "asc" }, { nameAr: "asc" }] });
    const counts = await db.plot.groupBy({ by: ["district"], where: { city: city as never }, _count: true });
    return (
      <Card title={L("الأحياء والمراحل (اختيارات wizard إضافة القطعة)", "Districts (choices in the add-plot wizard)")}>
        <nav className="flex flex-wrap gap-1.5">
          {CITY_KEYS.map((c) => (
            <Link key={c} href={`${base}?tab=districts&city=${c}`} className={`inline-flex min-h-9 items-center border px-2.5 text-sm ${c === city ? "border-navy bg-navy text-white" : "border-line"}`}>
              {label(CITY, c, locale)}
            </Link>
          ))}
        </nav>
        <Table head={[L("بالعربي", "Arabic"), L("بالإنجليزي", "English"), L("قطع", "Plots"), L("الحالة", "Status")]}>
          {rows.map((d) => (
            <tr key={d.id}>
              <td className="font-semibold">{d.nameAr}</td>
              <td>{d.nameEn}</td>
              <td>{num(counts.find((c) => c.district === d.nameAr)?._count ?? 0, locale)}</td>
              <td>
                <form action={toggleDistrict.bind(null, locale, d.id)} className="flex items-center gap-2">
                  <Badge tone={d.active ? "green" : "gray"}>{d.active ? L("ظاهر", "Shown") : L("موقوف", "Hidden")}</Badge>
                  <button className={`${btn.small} border border-line`}>{d.active ? L("أوقفه", "Hide") : L("رجّعه", "Show")}</button>
                </form>
              </td>
            </tr>
          ))}
        </Table>
        <form action={addDistrict.bind(null, locale)} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="city" value={city} />
          <label className={labelCls}>
            {L("الاسم بالعربي", "Arabic name")}
            <input name="nameAr" required minLength={2} className={`${field} w-48`} />
          </label>
          <label className={labelCls}>
            {L("الاسم بالإنجليزي", "English name")}
            <input name="nameEn" required minLength={2} dir="ltr" className={`${field} w-48`} />
          </label>
          <button className={btn.primary}>{L("أضف / حدّث", "Add / update")}</button>
        </form>
        <p className="text-xs text-muted">{L("الحي ما بيتمسحش عشان القطع القديمة — بيتوقف بس فيختفي من الاختيارات.", "Districts are never deleted (older plots use them) — hiding removes them from the choices.")}</p>
      </Card>
    );
  }

  async function Storage({ locale }: { locale: "ar" | "en" }) {
    const mode = storageMode();
    const [inDb, docs] = await Promise.all([db.fileBlob.count(), db.document.count()]);
    return (
      <Card
        title={L("خزنة الملفات", "File vault")}
        actions={<Badge tone={mode === "s3" ? "green" : "amber"}>{mode === "s3" ? "S3 (Cloudflare R2)" : L("قاعدة البيانات (تجريبي)", "Database (demo)")}</Badge>}
      >
        {sp.err === "s3_not_configured" && <Notice tone="red">{L("إعدادات S3 مش موجودة على السيرفر.", "S3 settings are not configured on the server.")}</Notice>}
        {sp.moved !== undefined && !sp.err && (
          <Notice tone={Number(sp.failed) > 0 ? "amber" : "green"}>
            {L(`اتنقل ${num(Number(sp.moved), locale)} ملف`, `${sp.moved} files moved`)}
            {Number(sp.failed) > 0 && L(`، و${num(Number(sp.failed), locale)} فشلوا (هيتجربوا تاني)`, `, ${sp.failed} failed (will retry)`)}.
          </Notice>
        )}
        <DL
          items={[
            [L("المستندات المسجلة", "Documents recorded"), num(docs, locale)],
            [L("ملفات لسه في قاعدة البيانات", "Files still in the database"), num(inDb, locale)],
            [L("الملفات الجديدة بتروح", "New files go to"), mode === "s3" ? "S3" : L("قاعدة البيانات", "Database")],
          ]}
        />
        {mode === "s3" ? (
          inDb > 0 ? (
            <form action={moveFilesToS3.bind(null, locale)} className="flex flex-col gap-2">
              <p className="text-sm text-muted">
                {L(
                  "بينقل 60 ملف كل ضغطة، وبيتأكد إن كل ملف وصل S3 سليم قبل ما يتمسح من قاعدة البيانات. الملفات بتفضل تتفتح عادي طول النقل.",
                  "Moves 60 files per click and verifies each one arrived in S3 before removing it from the database. Files stay viewable throughout.",
                )}
              </p>
              <button className={`${btn.primary} self-start`}>{L("انقل دفعة لـ S3", "Move a batch to S3")}</button>
            </form>
          ) : (
            <Notice tone="green">{L("كل الملفات في S3.", "All files are in S3.")}</Notice>
          )
        ) : (
          <Notice tone="amber">
            {L(
              "S3 مش متظبط. حط S3_ENDPOINT و S3_BUCKET و S3_ACCESS_KEY_ID و S3_SECRET_ACCESS_KEY في إعدادات Vercel وانشر تاني.",
              "S3 is not configured. Add S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY in Vercel settings and redeploy.",
            )}
          </Notice>
        )}
      </Card>
    );
  }

  async function Audit({ locale, entity }: { locale: "ar" | "en"; entity?: string }) {
    // UX-09: وصف بالعربي/الإنجليزي + فلتر بالتاريخ والمستخدم والمجموعة + تصدير CSV
    const f = { from: sp.from, to: sp.to, actor: sp.actor, group: sp.group, entity };
    const logs = await db.auditLog.findMany({ where: auditWhere(me, f), include: { actor: true }, orderBy: { createdAt: "desc" }, take: 200 });
    const types = ["User", "Listing", "Deal", "Document", "ServiceRequest", "AppSetting", "ExchangeRate"];
    const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v) as [string, string][]).toString();
    return (
      <Card
        title={L("سجل التدقيق — آخر 200 عملية بالفلاتر", "Audit log — latest 200 matching actions")}
        actions={
          <a href={`/api/audit${qs ? `?${qs}&` : "?"}locale=${locale}`} className={`${btn.small} border border-brand text-brand`}>
            {L("تصدير CSV", "Export CSV")}
          </a>
        }
      >
        <p className="text-sm text-muted">{L("السجل ده ما يتعدلش وما يتمسحش (محمي في قاعدة البيانات).", "This log cannot be edited or deleted (enforced in the database).")}</p>
        <form className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="tab" value="audit" />
          {entity && <input type="hidden" name="entity" value={entity} />}
          <label className={labelCls}>
            {L("من", "From")}
            <input name="from" type="date" defaultValue={sp.from} className={`${field} w-40`} />
          </label>
          <label className={labelCls}>
            {L("لحد", "To")}
            <input name="to" type="date" defaultValue={sp.to} className={`${field} w-40`} />
          </label>
          <label className={labelCls}>
            {L("المستخدم (اسم أو رقم، أو system)", "User (name or number, or system)")}
            <input name="actor" defaultValue={sp.actor} className={`${field} w-52`} />
          </label>
          <label className={labelCls}>
            {L("المجموعة", "Group")}
            <select name="group" defaultValue={sp.group ?? ""} className={`${field} w-44`}>
              <option value="">{L("الكل", "All")}</option>
              {AUDIT_GROUPS.map((g) => (
                <option key={g} value={g}>
                  {auditLabel(`${g}.__`, locale).split(":")[0]}
                </option>
              ))}
            </select>
          </label>
          <button className={btn.secondary}>{L("فلتر", "Filter")}</button>
        </form>
        <nav className="flex flex-wrap gap-1.5">
          {[undefined, ...types].map((t) => (
            <a
              key={t ?? "all"}
              href={`/${locale}/settings?tab=audit${t ? `&entity=${t}` : ""}${sp.from ? `&from=${sp.from}` : ""}${sp.to ? `&to=${sp.to}` : ""}${sp.actor ? `&actor=${encodeURIComponent(sp.actor)}` : ""}${sp.group ? `&group=${sp.group}` : ""}`}
              className={`inline-flex min-h-9 items-center border px-2.5 text-sm ${t === entity ? "border-navy bg-navy text-white" : "border-line"}`}
            >
              {t ?? L("الكل", "All")}
            </a>
          ))}
        </nav>
        <Table head={[L("الوقت", "Time"), L("مين", "Who"), L("عمل إيه", "Action"), L("على إيه", "On"), L("منين", "From")]}>
          {logs.map((a) => (
            <tr key={a.id.toString()}>
              <td className="whitespace-nowrap">{dateTime(a.createdAt, locale)}</td>
              <td>{a.actor?.name ?? (a.action.startsWith("cron.") || a.action.startsWith("listing.statement") ? L("النظام", "System") : L("زائر", "Visitor"))}</td>
              <td>
                {auditLabel(a.action, locale)}
                <div dir="ltr" className="text-start font-mono text-[11px] text-muted">
                  {a.action}
                </div>
              </td>
              <td className="text-xs">
                {a.entityType} <span className="text-muted">…{a.entityId.slice(-6)}</span>
              </td>
              <td dir="ltr" className="text-start text-xs text-muted">
                {a.ip ?? "—"}
              </td>
            </tr>
          ))}
        </Table>
      </Card>
    );
  }
}
