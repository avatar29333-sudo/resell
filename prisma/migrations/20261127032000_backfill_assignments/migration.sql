-- PERM-04: إسناد العروض الموجودة (تحديث بيانات بس — مفيش مسح ولا تعديل أعمدة، وبيتعاد بأمان)

-- اللي عرض القطعة = صاحبها للعروض القديمة
UPDATE "Listing" SET "submittedById" = "sellerId" WHERE "submittedById" IS NULL;

-- المحامي: من الصفقات، وإلا من آخر محامي راجع مستندات العرض
UPDATE "Listing" l SET "assignedLawyerId" = d."lawyerId"
FROM (SELECT DISTINCT ON ("listingId") "listingId", "lawyerId" FROM "Deal" WHERE "lawyerId" IS NOT NULL ORDER BY "listingId", "createdAt") d
WHERE d."listingId" = l.id AND l."assignedLawyerId" IS NULL;

UPDATE "Listing" l SET "assignedLawyerId" = r."lawyerId"
FROM (
  SELECT DISTINCT ON (doc."listingId") doc."listingId", rv."lawyerId"
  FROM "Review" rv JOIN "Document" doc ON doc.id = rv."documentId"
  WHERE doc."listingId" IS NOT NULL
  ORDER BY doc."listingId", rv."createdAt" DESC
) r
WHERE r."listingId" = l.id AND l."assignedLawyerId" IS NULL AND r."lawyerId" <> l."sellerId";

-- الوسيط: العروض اللي لسه من غير وسيط بتتوزع بالدور على الوسطاء (مش صاحب العرض)
WITH b AS (
  SELECT id, row_number() OVER (ORDER BY id) - 1 AS n, count(*) OVER () AS total
  FROM "User" WHERE role = 'BROKER' AND "anonymizedAt" IS NULL
),
l AS (
  SELECT id, "sellerId", row_number() OVER (ORDER BY "createdAt", id) - 1 AS n
  FROM "Listing" WHERE "assignedBrokerId" IS NULL
)
UPDATE "Listing" t SET "assignedBrokerId" = b.id
FROM l JOIN b ON b.n = l.n % b.total
WHERE t.id = l.id AND b.id <> l."sellerId";
