-- CON-06: آخر مسودة للتوقيع اتولدت (مستند محفوظ) — عشان المحامي يقارن جنب النسخة الموقّعة
ALTER TABLE "Contract" ADD COLUMN "draftDocumentId" TEXT;
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_draftDocumentId_fkey" FOREIGN KEY ("draftDocumentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;
