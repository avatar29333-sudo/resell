-- حماية قاعدة البيانات (كانت في prisma/sql/extras.sql — بقت migration عشان تتطبق تلقائي في كل بيئة)

-- 1) سجل التدقيق: إضافة بس، مفيش تعديل ولا حذف
CREATE OR REPLACE FUNCTION resell_block_change() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'ممنوع % على جدول %', TG_OP, TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "AuditLog_append_only"
  BEFORE UPDATE OR DELETE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION resell_block_change();

-- 2) المستندات: مفيش حذف (الملف بيتغير بإصدار جديد)
CREATE TRIGGER "Document_no_delete"
  BEFORE DELETE ON "Document"
  FOR EACH ROW EXECUTE FUNCTION resell_block_change();

-- 3) نسبة التنفيذ بين 0 و 100
ALTER TABLE "Plot" ADD CONSTRAINT "Plot_constructionPercent_range"
  CHECK ("constructionPercent" BETWEEN 0 AND 100);

-- 4) فهرس مكاني لحدود القطع
CREATE INDEX "Plot_boundary_gist" ON "Plot" USING GIST ("boundary");
