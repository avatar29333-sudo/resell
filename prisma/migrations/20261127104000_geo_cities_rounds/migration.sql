-- GEO-01: المدن جدول بدل enum. الأعمدة بتتحول نص (من غير ما بيانات تضيع) ومربوطة بالجدول.
CREATE TABLE "Cities" (
    "id" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "codePrefix" TEXT NOT NULL,
    "plotCodePattern" TEXT NOT NULL DEFAULT '{prefix}-{block}-{number}',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Cities_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Cities_slug_key" ON "Cities"("slug");
CREATE UNIQUE INDEX "Cities_codePrefix_key" ON "Cities"("codePrefix");
INSERT INTO "Cities" ("id", "nameAr", "nameEn", "slug", "codePrefix", "sortOrder") VALUES
  ('NEW_CAIRO', 'القاهرة الجديدة', 'New Cairo', 'new-cairo', 'NC', 1),
  ('SHEIKH_ZAYED', 'الشيخ زايد', 'Sheikh Zayed', 'sheikh-zayed', 'SZ', 2),
  ('OCTOBER', '6 أكتوبر', '6th of October', '6th-of-october', 'OC', 3),
  ('NEW_OCTOBER', 'أكتوبر الجديدة', 'New October', 'new-october', 'NO', 4),
  ('NEW_DAMIETTA', 'دمياط الجديدة', 'New Damietta', 'new-damietta', 'ND', 5);

ALTER TABLE "Plot" ALTER COLUMN "city" TYPE TEXT USING "city"::text;
ALTER TABLE "PriceIndex" ALTER COLUMN "city" TYPE TEXT USING "city"::text;
ALTER TABLE "ServiceRequest" ALTER COLUMN "city" TYPE TEXT USING "city"::text;
ALTER TABLE "District" ALTER COLUMN "city" TYPE TEXT USING "city"::text;
ALTER TABLE "DeadlineReminder" ALTER COLUMN "city" TYPE TEXT USING "city"::text;
ALTER TABLE "BuyRequest" ALTER COLUMN "cities" TYPE TEXT[] USING "cities"::text[];
-- النوع القديم ما بقاش مستخدم في أي عمود
DROP TYPE "City";

ALTER TABLE "Plot" ADD CONSTRAINT "Plot_city_fkey" FOREIGN KEY ("city") REFERENCES "Cities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PriceIndex" ADD CONSTRAINT "PriceIndex_city_fkey" FOREIGN KEY ("city") REFERENCES "Cities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ServiceRequest" ADD CONSTRAINT "ServiceRequest_city_fkey" FOREIGN KEY ("city") REFERENCES "Cities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "District" ADD CONSTRAINT "District_city_fkey" FOREIGN KEY ("city") REFERENCES "Cities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DeadlineReminder" ADD CONSTRAINT "DeadlineReminder_city_fkey" FOREIGN KEY ("city") REFERENCES "Cities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- GEO-02: الطرح (مرحلة بيت الوطن) منفصل عن الحي (المكان)
CREATE TABLE "OfferingRound" (
    "id" TEXT NOT NULL,
    "cityId" TEXT,
    "nameAr" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "year" INTEGER,
    "terms" TEXT,
    "defaultBuildDeadlineMonths" INTEGER,
    "installmentCurrency" TEXT NOT NULL DEFAULT 'USD',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OfferingRound_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "OfferingRound_cityId_idx" ON "OfferingRound"("cityId");
ALTER TABLE "OfferingRound" ADD CONSTRAINT "OfferingRound_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "Cities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Plot" ADD COLUMN "districtId" TEXT;
ALTER TABLE "Plot" ADD COLUMN "offeringRoundId" TEXT;
CREATE INDEX "Plot_districtId_idx" ON "Plot"("districtId");
CREATE INDEX "Plot_offeringRoundId_idx" ON "Plot"("offeringRoundId");
ALTER TABLE "Plot" ADD CONSTRAINT "Plot_districtId_fkey" FOREIGN KEY ("districtId") REFERENCES "District"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Plot" ADD CONSTRAINT "Plot_offeringRoundId_fkey" FOREIGN KEY ("offeringRoundId") REFERENCES "OfferingRound"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- «المرحلة الأولى..» كانت متسجلة كأحياء → تبقى طرح، وصف الحي ده يتوقف (ما بيتمسحش)
INSERT INTO "OfferingRound" ("id", "cityId", "nameAr", "nameEn", "number", "isActive")
SELECT 'rnd_' || d."id", d."city", d."nameAr", regexp_replace(d."nameEn", '^Phase', 'Round'),
  CASE d."nameAr" WHEN 'المرحلة الأولى' THEN 1 WHEN 'المرحلة الثانية' THEN 2 WHEN 'المرحلة الثالثة' THEN 3 WHEN 'المرحلة الرابعة' THEN 4
    WHEN 'المرحلة الخامسة' THEN 5 WHEN 'المرحلة السادسة' THEN 6 WHEN 'المرحلة السابعة' THEN 7 WHEN 'المرحلة الثامنة' THEN 8 ELSE 0 END,
  d."active"
FROM "District" d WHERE d."nameAr" LIKE 'المرحلة%';
UPDATE "Plot" p SET "offeringRoundId" = r."id" FROM "OfferingRound" r WHERE r."cityId" = p."city" AND r."nameAr" = p."district";
UPDATE "Plot" p SET "districtId" = d."id" FROM "District" d WHERE d."city" = p."city" AND d."nameAr" = p."district" AND d."nameAr" NOT LIKE 'المرحلة%';
UPDATE "District" SET "active" = false WHERE "nameAr" LIKE 'المرحلة%';

-- GEO-03: الاسم الإنجليزي لازم يبقى لاتيني (مثلاً «الحي التاسع» كان مكتوب عربي في خانة الإنجليزي)
UPDATE "District" SET "nameEn" = CASE "nameAr"
    WHEN 'الحي الأول' THEN 'District 1' WHEN 'الحي الثاني' THEN 'District 2' WHEN 'الحي الثالث' THEN 'District 3'
    WHEN 'الحي الرابع' THEN 'District 4' WHEN 'الحي الخامس' THEN 'District 5' WHEN 'الحي السادس' THEN 'District 6'
    WHEN 'الحي السابع' THEN 'District 7' WHEN 'الحي الثامن' THEN 'District 8' WHEN 'الحي التاسع' THEN 'District 9'
    WHEN 'الحي العاشر' THEN 'District 10' ELSE 'District ' || substr(md5("id"), 1, 4) END
WHERE "nameEn" ~ '[^\x20-\x7E]';
UPDATE "Plot" SET "districtEn" = d."nameEn" FROM "District" d WHERE "Plot"."districtId" = d."id" AND ("Plot"."districtEn" IS NULL OR "Plot"."districtEn" ~ '[^\x20-\x7E]');
