import { createHash } from "node:crypto";
import type { ContractType, PrismaClient } from "@prisma/client";
import { SEED_TEMPLATES } from "../src/lib/template-seed";

/**
 * CON-01/02: النماذج العشرة + نسخها. لكل نموذج: النسخ اللي الصفقات القديمة استخدمتها فعلاً
 * (آخر واحدة منشورة والباقي متقاعدة)، وكل عقد قديم بيترتبط بنسخته بالظبط (templateVersionId).
 * آمن يتكرر مع كل deploy — ما بيعدّلش نسخ موجودة.
 */
export async function seedTemplates(prisma: PrismaClient) {
  const hash = (s: string) => createHash("sha256").update(s).digest("hex");
  const vars = (s: string) => [...new Set([...s.matchAll(/\{\{\s*([a-z][a-z0-9_]*)\s*\}\}/g)].map((m) => m[1]))].sort();
  for (const t of SEED_TEMPLATES) {
    const tpl = await prisma.contractTemplate.upsert({
      where: { key: t.key },
      create: { key: t.key, formNo: t.formNo, titleAr: t.titleAr, titleEn: t.titleEn, contractType: t.contractType, signing: t.signing },
      update: {},
    });
    if (await prisma.templateVersion.count({ where: { templateId: tpl.id } })) continue;
    const used = t.contractType
      ? await prisma.contract.findMany({ where: { type: t.contractType as ContractType }, select: { templateVersion: true }, distinct: ["templateVersion"] })
      : [];
    const nums = [...new Set(used.map((u) => Number(u.templateVersion.replace(/\D/g, "")) || 1))].sort((a, b) => a - b);
    if (!nums.length) nums.push(1);
    const latest = nums[nums.length - 1];
    for (const n of nums) {
      await prisma.templateVersion.create({
        data: {
          templateId: tpl.id,
          version: n,
          bodyMarkdown: t.body,
          variables: vars(t.body),
          sha256: hash(t.body),
          status: n === latest ? "PUBLISHED" : "RETIRED",
          changeNote: n === latest ? "نص تشغيلي مبدئي — مستني نص المحامي" : "نسخة قديمة مستخدمة في صفقات سابقة",
          publishedAt: new Date(),
        },
      });
    }
  }
  // ربط العقود القديمة بنسختها
  const loose = await prisma.contract.findMany({ where: { templateVersionId: null }, select: { id: true, type: true, templateVersion: true } });
  for (const c of loose) {
    const n = Number(c.templateVersion.replace(/\D/g, "")) || 1;
    let v = await prisma.templateVersion.findFirst({ where: { template: { contractType: c.type }, version: n } });
    // قاعدة جديدة: النماذج اتعملت قبل عقود التجربة → النسخة اللي العقد اتعمل بيها بتتضاف (أحدث نسخة تبقى المنشورة)
    if (!v) {
      const tpl = await prisma.contractTemplate.findFirst({ where: { contractType: c.type }, include: { versions: { orderBy: { version: "desc" }, take: 1 } } });
      if (!tpl) continue;
      const base = tpl.versions[0];
      const newer = !base || n > base.version;
      if (newer && base?.status === "PUBLISHED") await prisma.templateVersion.update({ where: { id: base.id }, data: { status: "RETIRED" } });
      const body = base?.bodyMarkdown ?? SEED_TEMPLATES.find((t) => t.contractType === c.type)?.body ?? "";
      v = await prisma.templateVersion.create({
        data: { templateId: tpl.id, version: n, bodyMarkdown: body, variables: vars(body), sha256: hash(body), status: newer ? "PUBLISHED" : "RETIRED", changeNote: "نسخة مستخدمة في صفقات سابقة", publishedAt: new Date() },
      });
    }
    await prisma.contract.update({ where: { id: c.id }, data: { templateVersionId: v.id } });
  }
}
