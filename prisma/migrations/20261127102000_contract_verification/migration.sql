-- CON-04 (جزء أول): التحقق من النسخة الموقّعة + مكان الأصل الورقي (إضافة أعمدة بس)
ALTER TABLE "Contract" ADD COLUMN "verifiedAt" TIMESTAMP(3);
ALTER TABLE "Contract" ADD COLUMN "verifiedById" TEXT;
ALTER TABLE "Contract" ADD COLUMN "verificationMethod" TEXT;
ALTER TABLE "Contract" ADD COLUMN "verificationChecklist" JSONB;
ALTER TABLE "Contract" ADD COLUMN "paperOriginalLocation" TEXT;
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- عقود موقّعة من طرف واحد → «متوقّع من طرف»
UPDATE "Contract" SET "status" = 'PARTIALLY_SIGNED' WHERE "status" = 'SENT_FOR_SIGNATURE' AND jsonb_array_length("signatures") > 0;
