-- DATA-01: صفقات التجربة كانت متثبّتة على 48.39 (رقم مش موجود في سجل الأسعار).
-- التصحيح: كل صفقة بتاخد آخر سعر بيع في ExchangeRate لحد يوم توقيع العقد المبدئي
-- (يوم خروج الصفقة من مرحلة العقد المبدئي، أو دخولها، أو تاريخ إنشائها)، وبيتخزن القيمة + id السجل + وقت التثبيت.
-- تحديث بيانات بس — مفيش مسح. وبيلمس بس الصفقات اللي القيمة فيها مش مطابقة للسجل المربوط.
WITH signed AS (
  SELECT d.id,
    COALESCE(
      (SELECT min(e."createdAt") FROM "DealEvent" e WHERE e."dealId" = d.id AND e."fromStage" = 'PRELIMINARY_CONTRACT'),
      (SELECT min(e."createdAt") FROM "DealEvent" e WHERE e."dealId" = d.id AND e."toStage" = 'PRELIMINARY_CONTRACT'),
      d."createdAt"
    ) AS at
  FROM "Deal" d
  LEFT JOIN "ExchangeRate" r ON r.id = d."exchangeRateId"
  WHERE d."lockedUsdEgpRate" IS NOT NULL AND (r.id IS NULL OR r.sell <> d."lockedUsdEgpRate")
),
pick AS (
  SELECT s.id, s.at,
    (SELECT r.id FROM "ExchangeRate" r WHERE r.base = 'USD' AND r.quote = 'EGP' AND r.date <= s.at ORDER BY r.date DESC, r."createdAt" DESC LIMIT 1) AS rate_id
  FROM signed s
)
UPDATE "Deal" d SET
  "exchangeRateId" = p.rate_id,
  "lockedUsdEgpRate" = r.sell,
  "rateLockedAt" = COALESCE(d."rateLockedAt", p.at)
FROM pick p JOIN "ExchangeRate" r ON r.id = p.rate_id
WHERE d.id = p.id;
