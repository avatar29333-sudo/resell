import Link from "next/link";
import { notFound } from "next/navigation";
import { isLocale } from "@/i18n/config";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { loadDealFor } from "@/lib/access";
import { dealVars } from "@/lib/contract-vars";
import { lineDiff, renderTemplate } from "@/lib/templates";
import { date, num, tr } from "@/lib/format";
import { Badge, Card, Container, Notice, PageHeader, btn, field, labelCls } from "@/components/ui";
import { pageMeta } from "@/lib/meta";
import { approveVersion, createDraft, publishVersion } from "./actions";

type Props = { params: Promise<{ locale: string }>; searchParams: Promise<{ t?: string; v?: string; a?: string; b?: string; deal?: string; err?: string; ok?: string }> };

export const generateMetadata = ({ params }: { params: Promise<{ locale: string }> }) => pageMeta(params, "نماذج العقود", "Contract templates", { noindex: true });

const STATUS: Record<string, [string, string, "gray" | "amber" | "green" | "navy"]> = {
  DRAFT: ["مسودة", "Draft", "gray"],
  LAWYER_APPROVED: ["معتمد من المحامي", "Lawyer approved", "amber"],
  PUBLISHED: ["منشور", "Published", "green"],
  RETIRED: ["متقاعد", "Retired", "navy"],
};

/** النص مع المتغيرات {{…}} ملوّنة */
function Highlighted({ text }: { text: string }) {
  const parts = text.split(/(\{\{\s*[a-z][a-z0-9_]*\s*\}\})/g);
  return (
    <pre dir="rtl" className="max-h-[480px] overflow-auto border border-line bg-paper p-3 text-sm leading-7 whitespace-pre-wrap">
      {parts.map((p, i) =>
        /^\{\{/.test(p) ? (
          <mark key={i} dir="ltr" className="bg-[#EEF3FC] px-1 font-semibold text-brand">
            {p}
          </mark>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </pre>
  );
}

/** CON-01 — محرر وعارض النماذج بالنسخ (الأدمن والمحامي) */
export default async function TemplatesPage({ params, searchParams }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const sp = await searchParams;
  const L = tr(locale);
  const ar = locale === "ar";
  const me = await requireUser(locale, `/${locale}/templates`, ["ADMIN", "LAWYER"]);
  const templates = await db.contractTemplate.findMany({ orderBy: { formNo: "asc" }, include: { versions: { orderBy: { version: "desc" }, include: { _count: { select: { contracts: true } }, approvedByLawyer: { select: { name: true } } } } } });
  const tpl = templates.find((t) => t.key === sp.t) ?? templates[0];
  if (!tpl) return null;
  const current = tpl.versions.find((v) => String(v.version) === sp.v) ?? tpl.versions.find((v) => v.status === "PUBLISHED") ?? tpl.versions[0];
  const a = tpl.versions.find((v) => String(v.version) === sp.a);
  const b = tpl.versions.find((v) => String(v.version) === sp.b);
  const diff = a && b ? lineDiff(a.bodyMarkdown, b.bodyMarkdown) : null;
  // المعاينة ببيانات صفقة حقيقية
  const previewDeal = sp.deal ? await loadDealFor(me, sp.deal.trim()) : null;
  const preview = previewDeal && current ? renderTemplate(current.bodyMarkdown, await dealVars(previewDeal, current.version)) : null;
  const base = `/${locale}/templates?t=${tpl.key}`;

  return (
    <>
      <PageHeader title={L("نماذج العقود", "Contract templates")} subtitle={L("النسخة المنشورة ما بتتعدّلش — أي تعديل بيعمل نسخة جديدة، المحامي يعتمدها، والأدمن ينشرها.", "Published versions are immutable — any edit creates a new version that the lawyer approves and the admin publishes.")} />
      <Container className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,3fr)]">
        <nav aria-label={L("النماذج", "Templates")} className="flex flex-col gap-1">
          {templates.map((t) => {
            const pub = t.versions.find((v) => v.status === "PUBLISHED");
            return (
              <Link key={t.id} href={`/${locale}/templates?t=${t.key}`} aria-current={t.id === tpl.id ? "page" : undefined} className={`flex min-h-11 items-center justify-between gap-2 border px-3 py-2 text-sm ${t.id === tpl.id ? "border-navy bg-navy text-white" : "border-line"}`}>
                <span>
                  {num(t.formNo, locale)}. {ar ? t.titleAr : t.titleEn}
                </span>
                <span className="tabular-nums">{pub ? `v${pub.version}` : "—"}</span>
              </Link>
            );
          })}
        </nav>
        <div className="flex flex-col gap-6">
          {sp.ok === "published" && <Notice tone="green">{L("النسخة اتنشرت. العقود القديمة بتفضل على نسختها، والمطلوب منهم موافقة جديدة هيشوفوا تنبيه.", "Published. Older contracts keep their version; anyone who must re-consent will see a notice.")}</Notice>}
          {sp.err && <Notice tone="red">{sp.err === "self_approve" ? L("ما ينفعش تعتمد نسخة إنت اللي كتبتها — محامي تاني أو الأدمن يكتبها وإنت تعتمد.", "You can't approve a version you wrote yourself.") : sp.err === "draft" ? L("النص قصير أو مفيش ملاحظة على التغيير.", "The text is too short or there's no change note.") : L("النشر بعد اعتماد المحامي بس.", "Publishing is only allowed after lawyer approval.")}</Notice>}
          <Card title={`${num(tpl.formNo, locale)}. ${ar ? tpl.titleAr : tpl.titleEn}`} actions={<Badge tone="blue">{{ CLICKWRAP: L("موافقة إلكترونية + كود", "Clickwrap + code"), SIGNED: L("توقيع (إلكتروني أو ورقي)", "Signature (e-sign or paper)"), NOTARIAL: L("شهر عقاري", "Notary") }[tpl.signing]}</Badge>}>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-start text-muted">
                  <th className="py-1 text-start">{L("النسخة", "Version")}</th>
                  <th className="text-start">{L("الحالة", "Status")}</th>
                  <th className="text-start">{L("مستخدم في", "Used in")}</th>
                  <th className="text-start">{L("المحامي", "Lawyer")}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {tpl.versions.map((v) => (
                  <tr key={v.id} className="border-t border-line">
                    <td className="py-2">
                      <Link href={`${base}&v=${v.version}`} className="font-semibold text-brand tabular-nums">
                        v{v.version}
                      </Link>
                      <span className="block text-[13px] text-muted">{v.changeNote}</span>
                    </td>
                    <td>
                      <Badge tone={STATUS[v.status][2]}>{STATUS[v.status][ar ? 0 : 1]}</Badge>
                    </td>
                    <td className="tabular-nums">{L(`${num(v._count.contracts, locale)} صفقة`, `${v._count.contracts} deals`)}</td>
                    <td className="text-[13px]">{v.approvedByLawyer ? `${v.approvedByLawyer.name} · ${date(v.approvedAt, locale)}` : "—"}</td>
                    <td className="flex flex-wrap gap-1 py-2">
                      {me.role === "LAWYER" && v.status === "DRAFT" && (
                        <form action={approveVersion.bind(null, locale, v.id)}>
                          <button className={`${btn.small} bg-ok text-white`}>{L("اعتمد", "Approve")}</button>
                        </form>
                      )}
                      {me.role === "ADMIN" && v.status === "LAWYER_APPROVED" && (
                        <form action={publishVersion.bind(null, locale, v.id)}>
                          <button className={`${btn.small} bg-brand text-white`}>{L("انشر", "Publish")}</button>
                        </form>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          {current && (
            <Card title={L(`النص — v${current.version}`, `Text — v${current.version}`)}>
              <p className="text-sm text-muted">
                {L("المتغيرات:", "Variables:")}{" "}
                {current.variables.map((x) => (
                  <code key={x} dir="ltr" className="me-1 bg-paper px-1">
                    {x}
                  </code>
                ))}
              </p>
              <Highlighted text={current.bodyMarkdown} />
              <p className="text-[13px] text-muted" dir="ltr">
                SHA-256 {current.sha256.slice(0, 16)}…
              </p>
            </Card>
          )}

          <Card title={L("معاينة ببيانات صفقة حقيقية", "Preview with real deal data")}>
            <form className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="t" value={tpl.key} />
              {current && <input type="hidden" name="v" value={current.version} />}
              <label className={labelCls}>
                {L("رقم الصفقة", "Deal id")}
                <input name="deal" defaultValue={sp.deal} dir="ltr" className={`${field} w-72`} />
              </label>
              <button className={btn.secondary}>{L("اعرض", "Preview")}</button>
            </form>
            {sp.deal && !previewDeal && <Notice tone="red">{L("الصفقة مش موجودة أو مش متاحة ليك.", "Deal not found or not available to you.")}</Notice>}
            {preview && (
              <>
                {preview.ok ? (
                  <Notice tone="green">{L("كل المتغيرات اتعبّت — ينفع يتولد منه عقد.", "All variables filled — a contract can be generated.")}</Notice>
                ) : (
                  <Notice tone="red">
                    {L("فيه بيانات ناقصة — مش هيتولد عقد لحد ما تتكمّل:", "Missing data — no contract will be generated until filled:")}{" "}
                    <span dir="ltr">{preview.missing.join(", ")}</span>
                  </Notice>
                )}
                <Highlighted text={preview.text} />
              </>
            )}
          </Card>

          <Card title={L("مقارنة نسختين", "Compare two versions")}>
            <form className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="t" value={tpl.key} />
              {(["a", "b"] as const).map((k) => (
                <label key={k} className={labelCls}>
                  {k === "a" ? L("من", "From") : L("إلى", "To")}
                  <select name={k} defaultValue={k === "a" ? (sp.a ?? String(tpl.versions[1]?.version ?? "")) : (sp.b ?? String(tpl.versions[0]?.version ?? ""))} className={field}>
                    {tpl.versions.map((v) => (
                      <option key={v.id} value={v.version}>
                        v{v.version}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
              <button className={btn.secondary}>{L("قارن", "Compare")}</button>
            </form>
            {diff && (
              <pre dir="rtl" className="max-h-[420px] overflow-auto border border-line text-sm leading-7 whitespace-pre-wrap">
                {diff.map((d, i) => (
                  <div key={i} className={d.kind === "add" ? "bg-[#E9F6EE] text-ok" : d.kind === "del" ? "bg-[#FBECEC] text-[#A32020] line-through" : ""}>
                    {d.kind === "add" ? "+ " : d.kind === "del" ? "− " : "  "}
                    {d.text}
                  </div>
                ))}
              </pre>
            )}
          </Card>

          <Card title={L("تعديل = نسخة جديدة", "Edit = new version")}>
            <form action={createDraft.bind(null, locale, tpl.id)} className="flex flex-col gap-2">
              <label className={labelCls}>
                {L("النص (Markdown — المتغيرات بين {{ }})", "Text (Markdown — variables in {{ }})")}
                <textarea name="body" required rows={16} defaultValue={current?.bodyMarkdown} dir="rtl" className={`${field} font-mono text-sm`} />
              </label>
              <label className={labelCls}>
                {L("إيه اللي اتغير؟", "What changed?")}
                <input name="changeNote" required minLength={5} className={field} />
              </label>
              <button className={`${btn.primary} self-start`}>{L("احفظ كنسخة جديدة (مسودة)", "Save as a new version (draft)")}</button>
            </form>
          </Card>
        </div>
      </Container>
    </>
  );
}
