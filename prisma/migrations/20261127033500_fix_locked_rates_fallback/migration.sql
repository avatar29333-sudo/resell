-- DATA-01 (تكملة): لو مفيش سعر في السجل قبل يوم التوقيع (صفقات التجربة أقدم من أول سعر متسجل)،
-- بناخد أقدم سعر متاح بعده. تحديث بيانات بس — مفيش مسح.
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
    COALESCE(
      (SELECT r.id FROM "ExchangeRate" r WHERE r.base = 'USD' AND r.quote = 'EGP' AND r.date <= s.at ORDER BY r.date DESC, r."createdAt" DESC LIMIT 1),
      (SELECT r.id FROM "ExchangeRate" r WHERE r.base = 'USD' AND r.quote = 'EGP' ORDER BY r.date ASC, r."createdAt" ASC LIMIT 1)
    ) AS rate_id
  FROM signed s
)
UPDATE "Deal" d SET
  "exchangeRateId" = p.rate_id,
  "lockedUsdEgpRate" = r.sell,
  "rateLockedAt" = COALESCE(d."rateLockedAt", p.at)
FROM pick p JOIN "ExchangeRate" r ON r.id = p.rate_id
WHERE d.id = p.id;
