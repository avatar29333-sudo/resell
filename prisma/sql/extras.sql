-- Resell — حاجات Prisma ما بيعرفش يكتبها في schema.prisma
-- بتتشغل بعد الـ migrations:  npm run db:extras
-- الملف ده آمن يتشغل أكتر من مرة.

-- 1) فهرس مكاني لحدود القطع (للخرايط والبحث بالموقع)
CREATE INDEX IF NOT EXISTS "Plot_boundary_gist" ON "Plot" USING GIST ("boundary");

-- 2) سجل التدقيق: إضافة بس، مفيش تعديل ولا حذف
CREATE OR REPLACE FUNCTION resell_block_change() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'ممنوع % على جدول %', TG_OP, TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "AuditLog_append_only" ON "AuditLog";
CREATE TRIGGER "AuditLog_append_only"
  BEFORE UPDATE OR DELETE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION resell_block_change();

-- 3) المستندات: مفيش حذف (التعديل مسموح للحالة بس من الكود، والملف نفسه بيتغير بإصدار جديد)
DROP TRIGGER IF EXISTS "Document_no_delete" ON "Document";
CREATE TRIGGER "Document_no_delete"
  BEFORE DELETE ON "Document"
  FOR EACH ROW EXECUTE FUNCTION resell_block_change();

-- 4) نسبة التنفيذ بين 0 و 100
ALTER TABLE "Plot" DROP CONSTRAINT IF EXISTS "Plot_constructionPercent_range";
ALTER TABLE "Plot" ADD CONSTRAINT "Plot_constructionPercent_range"
  CHECK ("constructionPercent" BETWEEN 0 AND 100);
