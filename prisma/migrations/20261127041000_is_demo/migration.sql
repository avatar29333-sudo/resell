-- DATA-04 + MKT-14: علامة «بيانات تجريبية» (إضافة عمود + تحديث بيانات بس)
ALTER TABLE "Deal" ADD COLUMN "isDemo" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX "Deal_status_isDemo_idx" ON "Deal"("status", "isDemo");

-- كل الصفقات الموجودة لحد دلوقتي جت من بيانات التجربة (seed) أو من تجارب على النسخة التجريبية
UPDATE "Deal" SET "isDemo" = true;
