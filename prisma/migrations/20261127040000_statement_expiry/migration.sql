-- DATA-03: صلاحية إفادة الجهاز (إضافات + تحديث بيانات بس)
ALTER TABLE "Listing" ADD COLUMN "statementExpiredAt" TIMESTAMP(3);

-- إفادات الجهاز المعتمدة اللي مالهاش تاريخ انتهاء: 3 شهور من تاريخ رفعها
UPDATE "Document" SET "expiresAt" = ("createdAt" + INTERVAL '3 months')::date
WHERE type = 'AUTHORITY_STATEMENT' AND "expiresAt" IS NULL AND status IN ('APPROVED', 'IN_REVIEW', 'UPLOADED');
