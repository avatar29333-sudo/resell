import { notFound } from "next/navigation";
import { isLocale } from "@/i18n/config";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getSetting } from "@/lib/settings";
import { date, dateTime, num, tr } from "@/lib/format";
import { ACCOUNT_LEVEL, CONTRACT_TYPE, RATE_SOURCE, ROLE, label } from "@/lib/labels";
import { Badge, Card, Container, Notice, PageHeader, Table, Tabs, btn, field, labelCls } from "@/components/ui";
import { addManualRate, bumpTemplate, saveCommission, saveFees, setUserRole } from "./actions";

type Props = { params: Promise<{ locale: string }>; searchParams: Promise<{ tab?: string; q?: string; entity?: string }> };

export default async function SettingsPage({ params, searchParams }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const sp = await searchParams;
  const L = tr(locale);
  const me = await requireUser(locale, `/${locale}/settings`, ["ADMIN", "FINANCE"]);
  const isAdmin = me.role === "ADMIN";
  const tabs = isAdmin ? ["users", "fx", "commission", "templates", "audit"] : ["fx"];
  const tab = tabs.includes(sp.tab ?? "") ? sp.tab! : tabs[0];
  const base = `/${locale}/settings`;

  return (
    <>
      <PageHeader
        title={L("الإعدادات", "Settings")}
        subtitle={L("الأدوار، سعر الصرف، نسب العمولة، نماذج العقود، وسجل التدقيق. كل تغيير هنا بيتسجل.", "Roles, exchange rates, commission rates, contract templates and the audit log. Every change here is logged.")}
      />
      <Container className="flex flex-col gap-6">
        <Tabs
          current={tab}
          tabs={[
            { key: "users", label: L("المستخدمين والأدوار", "Users and roles"), href: `${base}?tab=users` },
            { key: "fx", label: L("سعر الصرف", "Exchange rate"), href: `${base}?tab=fx` },
            { key: "commission", label: L("العمولة والرسوم", "Commission and fees"), href: `${base}?tab=commission` },
            { key: "templates", label: L("نماذج العقود", "Contract templates"), href: `${base}?tab=templates` },
            { key: "audit", label: L("سجل التدقيق", "Audit log"), href: `${base}?tab=audit` },
          ].filter((t) => tabs.includes(t.key))}
        />
        {tab === "users" && <Users locale={locale} q={sp.q} meId={me.id} />}
        {tab === "fx" && <Fx locale={locale} />}
        {tab === "commission" && <Commission locale={locale} />}
        {tab === "templates" && <Templates locale={locale} />}
        {tab === "audit" && <Audit locale={locale} entity={sp.entity} />}
      </Container>
    </>
  );

  async function Users({ locale, q, meId }: { locale: "ar" | "en"; q?: string; meId: string }) {
    const users = await db.user.findMany({
      where: q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { phone: { contains: q } }, { email: { contains: q, mode: "insensitive" } }] } : {},
      orderBy: [{ role: "desc" }, { name: "asc" }],
      take: 60,
    });
    return (
      <Card title={L("المستخدمين", "Users")}>
        <form className="flex gap-2">
          <input type="hidden" name="tab" value="users" />
          <input name="q" defaultValue={q} placeholder={L("ابحث بالاسم أو الرقم أو الإيميل", "Search by name, number or email")} className={field} />
          <button className={btn.secondary}>{L("بحث", "Search")}</button>
        </form>
        <Table head={[L("الاسم", "Name"), L("الموبايل", "Mobile"), L("المستوى", "Level"), L("الدور", "Role")]}>
          {users.map((u) => (
            <tr key={u.id}>
              <td className="font-semibold">{u.name}</td>
              <td dir="ltr" className="text-start">
                {u.phone}
              </td>
              <td>
                <Badge tone={u.accountLevel === "VERIFIED" ? "green" : "gray"}>{label(ACCOUNT_LEVEL, u.accountLevel, locale)}</Badge>
              </td>
              <td>
                {u.id === meId ? (
                  label(ROLE, u.role, locale)
                ) : (
                  <form action={setUserRole.bind(null, locale, u.id)} className="flex gap-1.5">
                    <select name="role" defaultValue={u.role} className={`${field} min-h-9 w-32`} aria-label={L("الدور", "Role")}>
                      {Object.keys(ROLE).map((r) => (
                        <option key={r} value={r}>
                          {label(ROLE, r, locale)}
                        </option>
                      ))}
                    </select>
                    <button className={`${btn.small} border border-brand text-brand`}>{L("حفظ", "Save")}</button>
                  </form>
                )}
              </td>
            </tr>
          ))}
        </Table>
      </Card>
    );
  }

  async function Fx({ locale }: { locale: "ar" | "en" }) {
    const rates = await db.exchangeRate.findMany({ include: { enteredBy: true }, orderBy: [{ date: "desc" }, { createdAt: "desc" }], take: 20 });
    return (
      <Card title={L("سعر صرف الدولار", "USD exchange rate")}>
        <Notice>{L("بيتسحب يومياً من البنك المركزي. الإدخال اليدوي للطوارئ بس وبيتسجل باسمك.", "Pulled daily from the Central Bank. Manual entry is for emergencies only and is logged under your name.")}</Notice>
        <form action={addManualRate.bind(null, locale)} className="flex flex-wrap items-end gap-2">
          <label className={labelCls}>
            {L("شراء", "Buy")}
            <input name="buy" type="number" step="0.0001" min={1} required className={`${field} w-36`} />
          </label>
          <label className={labelCls}>
            {L("بيع", "Sell")}
            <input name="sell" type="number" step="0.0001" min={1} required className={`${field} w-36`} />
          </label>
          <button className={btn.primary}>{L("سجّل سعر يدوي", "Add manual rate")}</button>
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
    const [rates, fees] = await Promise.all([getSetting("commission.rates"), getSetting("service.fees")]);
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
                  <input name="note" required placeholder={L("إيه اللي اتغير؟", "What changed?")} className={`${field} min-h-9`} />
                  <button className={`${btn.small} border border-brand text-brand`}>{L("انشر", "Publish")}</button>
                </form>
              </td>
            </tr>
          ))}
        </Table>
      </Card>
    );
  }

  async function Audit({ locale, entity }: { locale: "ar" | "en"; entity?: string }) {
    const logs = await db.auditLog.findMany({
      where: entity ? { entityType: entity } : {},
      include: { actor: true },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    const types = ["User", "Listing", "Deal", "Document", "ServiceRequest", "AppSetting", "ExchangeRate"];
    return (
      <Card title={L("سجل التدقيق — آخر 100 عملية", "Audit log — last 100 actions")}>
        <p className="text-sm text-muted">{L("السجل ده ما يتعدلش وما يتمسحش (محمي في قاعدة البيانات).", "This log cannot be edited or deleted (enforced in the database).")}</p>
        <nav className="flex flex-wrap gap-1.5">
          {[undefined, ...types].map((t) => (
            <a
              key={t ?? "all"}
              href={`/${locale}/settings?tab=audit${t ? `&entity=${t}` : ""}`}
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
              <td>{a.actor?.name ?? L("زائر", "Visitor")}</td>
              <td dir="ltr" className="text-start font-mono text-xs">
                {a.action}
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
