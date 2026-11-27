-- OPS-02: شغل المندوب في الموقع وفي الجهاز (إضافات بس)
ALTER TABLE "Document"
  ADD COLUMN "geoLat" DOUBLE PRECISION,
  ADD COLUMN "geoLng" DOUBLE PRECISION,
  ADD COLUMN "geoAccuracyM" DOUBLE PRECISION,
  ADD COLUMN "takenAt" TIMESTAMP(3);

ALTER TABLE "ServiceRequest" ADD COLUMN "constructionEstimate" INTEGER;

-- حالة ملف التنازل في الجهاز: SUBMITTED / NEEDS_INFO / APPROVED / REJECTED
ALTER TABLE "Deal"
  ADD COLUMN "authorityStatus" TEXT,
  ADD COLUMN "authorityUpdatedAt" TIMESTAMP(3);
