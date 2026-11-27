-- DATA-07: جدول الأحياء/المراحل + الاسم الإنجليزي على القطعة + توحيد بادئة كود القطعة
-- (إضافات + تحديث بيانات بس — مفيش مسح)

CREATE TABLE "District" (
    "id" TEXT NOT NULL,
    "city" "City" NOT NULL,
    "nameAr" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "District_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "District_city_nameAr_key" ON "District"("city", "nameAr");

-- القايمة الأساسية لكل مدينة (نفس الأسماء الموجودة في البيانات)
INSERT INTO "District" ("id", "city", "nameAr", "nameEn", "sort")
SELECT 'dst_' || lower(c.city::text) || '_' || n.sort, c.city, n.ar, n.en, n.sort
FROM (SELECT unnest(enum_range(NULL::"City")) AS city) c
CROSS JOIN (VALUES
  ('المرحلة الأولى', 'Phase 1', 1),
  ('المرحلة الثانية', 'Phase 2', 2),
  ('المرحلة الثالثة', 'Phase 3', 3),
  ('المرحلة الرابعة', 'Phase 4', 4),
  ('الحي الأول', 'District 1', 5),
  ('الحي الثاني', 'District 2', 6),
  ('الحي الثالث', 'District 3', 7),
  ('منطقة الجامعات', 'Universities Zone', 8)
) AS n(ar, en, sort)
ON CONFLICT ("city", "nameAr") DO NOTHING;

-- أي حي موجود في القطع ومش في القايمة يتضاف (الإنجليزي = نفس الاسم لحد ما الأدمن يعدّله)
INSERT INTO "District" ("id", "city", "nameAr", "nameEn", "sort")
SELECT DISTINCT ON (p.city, p.district) 'dst_' || md5(p.city::text || p.district), p.city, p.district, p.district, 100
FROM "Plot" p
ON CONFLICT ("city", "nameAr") DO NOTHING;

ALTER TABLE "Plot" ADD COLUMN "districtEn" TEXT;
UPDATE "Plot" p SET "districtEn" = d."nameEn" FROM "District" d WHERE d.city = p.city AND d."nameAr" = p.district AND p."districtEn" IS NULL;

-- بادئة الكود لازم تطابق المدينة (القاهرة الجديدة وأكتوبر الجديدة ودمياط الجديدة كانوا كلهم NE)
UPDATE "Plot" SET code = (CASE city
    WHEN 'NEW_CAIRO' THEN 'NC'
    WHEN 'SHEIKH_ZAYED' THEN 'SZ'
    WHEN 'OCTOBER' THEN 'OC'
    WHEN 'NEW_OCTOBER' THEN 'NO'
    WHEN 'NEW_DAMIETTA' THEN 'ND'
  END) || substring(code from position('-' in code))
WHERE position('-' in code) > 0
  AND split_part(code, '-', 1) <> (CASE city
    WHEN 'NEW_CAIRO' THEN 'NC'
    WHEN 'SHEIKH_ZAYED' THEN 'SZ'
    WHEN 'OCTOBER' THEN 'OC'
    WHEN 'NEW_OCTOBER' THEN 'NO'
    WHEN 'NEW_DAMIETTA' THEN 'ND'
  END);
