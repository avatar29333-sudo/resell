-- CON-01/02: النماذج بالنسخ (المنشورة ما بتتعدّلش) + كل عقد مربوط بنسخته بالظبط — إضافة بس
CREATE TABLE "ContractTemplate" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "formNo" INTEGER NOT NULL,
    "titleAr" TEXT NOT NULL,
    "titleEn" TEXT NOT NULL,
    "contractType" TEXT,
    "signing" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ContractTemplate_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ContractTemplate_key_key" ON "ContractTemplate"("key");

CREATE TABLE "TemplateVersion" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "bodyMarkdown" TEXT NOT NULL,
    "variables" TEXT[],
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "changeNote" TEXT,
    "sha256" TEXT NOT NULL,
    "createdById" TEXT,
    "approvedByLawyerId" TEXT,
    "approvedAt" TIMESTAMP(3),
    "publishedById" TEXT,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TemplateVersion_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TemplateVersion_templateId_version_key" ON "TemplateVersion"("templateId", "version");
ALTER TABLE "TemplateVersion" ADD CONSTRAINT "TemplateVersion_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ContractTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TemplateVersion" ADD CONSTRAINT "TemplateVersion_approvedByLawyerId_fkey" FOREIGN KEY ("approvedByLawyerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- النص بعد ما يتعتمد/يتنشر ما بيتعدّلش، والنسخ ما بتتمسحش
CREATE OR REPLACE FUNCTION resell_template_guard() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'ممنوع حذف نسخة نموذج'; END IF;
  IF OLD."status" <> 'DRAFT' AND (NEW."bodyMarkdown" <> OLD."bodyMarkdown" OR NEW."sha256" <> OLD."sha256") THEN
    RAISE EXCEPTION 'نسخة معتمدة/منشورة ما بتتعدّلش — اعمل نسخة جديدة';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "TemplateVersion_guard" BEFORE UPDATE OR DELETE ON "TemplateVersion" FOR EACH ROW EXECUTE FUNCTION resell_template_guard();

-- CON-02/04/05: العقد مربوط بالنسخة + خانات المسودة والنسخة الموقّعة + بيانات التوكيل
ALTER TABLE "Contract" ADD COLUMN "templateVersionId" TEXT;
ALTER TABLE "Contract" ADD COLUMN "draftCode" TEXT;
ALTER TABLE "Contract" ADD COLUMN "draftSha256" TEXT;
ALTER TABLE "Contract" ADD COLUMN "draftPages" INTEGER;
ALTER TABLE "Contract" ADD COLUMN "signedUploadDocumentId" TEXT;
ALTER TABLE "Contract" ADD COLUMN "signedVia" TEXT;
ALTER TABLE "Contract" ADD COLUMN "rejectReason" TEXT;
ALTER TABLE "Contract" ADD COLUMN "poaNumber" TEXT;
ALTER TABLE "Contract" ADD COLUMN "poaNotary" TEXT;
CREATE INDEX "Contract_templateVersionId_idx" ON "Contract"("templateVersionId");
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_templateVersionId_fkey" FOREIGN KEY ("templateVersionId") REFERENCES "TemplateVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_signedUploadDocumentId_fkey" FOREIGN KEY ("signedUploadDocumentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- IssuedDocument: النسخ القديمة بتتعلّم «ملغاة» (العمود ده بس بيتغير من الـ trigger المسموح)
ALTER TABLE "IssuedDocument" ADD COLUMN "supersededAt" TIMESTAMP(3);
DROP TRIGGER "IssuedDocument_append_only" ON "IssuedDocument";
CREATE OR REPLACE FUNCTION resell_issued_guard() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'السجل ده ما بيتمسحش'; END IF;
  IF NEW."code" <> OLD."code" OR NEW."sha256" <> OLD."sha256" OR NEW."pages" <> OLD."pages" OR NEW."kind" <> OLD."kind" THEN
    RAISE EXCEPTION 'السجل ده ما بيتعدّلش — بس بيتعلّم ملغي';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "IssuedDocument_guard" BEFORE UPDATE OR DELETE ON "IssuedDocument" FOR EACH ROW EXECUTE FUNCTION resell_issued_guard();
