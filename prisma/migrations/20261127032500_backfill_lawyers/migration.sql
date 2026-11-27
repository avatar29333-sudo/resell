-- PERM-04: العروض اللي عليها مستندات «عند المحامي» ومن غير محامي مسند → توزيع بالدور على المحامين
-- (تحديث بيانات بس، عشان ما يختفيش أي مستند من طابور المحامين)
WITH lw AS (
  SELECT id, row_number() OVER (ORDER BY id) - 1 AS n, count(*) OVER () AS total
  FROM "User" WHERE role = 'LAWYER' AND "anonymizedAt" IS NULL
),
l AS (
  SELECT li.id, li."sellerId", row_number() OVER (ORDER BY li."createdAt", li.id) - 1 AS n
  FROM "Listing" li
  WHERE li."assignedLawyerId" IS NULL
    AND EXISTS (SELECT 1 FROM "Document" d WHERE d."listingId" = li.id AND d.status IN ('IN_REVIEW', 'APPROVED', 'REJECTED'))
)
UPDATE "Listing" t SET "assignedLawyerId" = lw.id
FROM l JOIN lw ON lw.n = l.n % lw.total
WHERE t.id = l.id AND lw.id <> l."sellerId";
