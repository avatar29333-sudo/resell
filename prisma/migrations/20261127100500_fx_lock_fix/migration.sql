-- نسخة احتياطية قبل أي تعديل (المراجعة الأمنية): القيم القديمة محفوظة وتقدر ترجع
CREATE TABLE IF NOT EXISTS "_backup_20261127_contract_status" AS SELECT id, status, now() AS "backedUpAt" FROM "Contract" WHERE status = 'SIGNED';
CREATE TABLE IF NOT EXISTS "_backup_20261127_deal_fx" AS SELECT id, "lockedUsdEgpRate", "exchangeRateId", "rateLockedAt", now() AS "backedUpAt" FROM "Deal" WHERE "lockedUsdEgpRate" IS NOT NULL;

-- CON-04: العقود اللي اتوقّعت قبل كده بنظام التوقيع الداخلي في بيانات التجربة بتتعلّم «متحقق منها»
UPDATE "Contract" SET status = 'VERIFIED' WHERE status = 'SIGNED';

-- DEAL-01: سعر الصرف بيتثبت لحظة اكتمال توقيع العقد الابتدائي بس.
-- أي صفقة متثبّت فيها سعر من غير عقد ابتدائي موقّع (غلط في بيانات التجربة) → يرجع «استرشادي».
UPDATE "Deal" d SET "lockedUsdEgpRate" = NULL, "exchangeRateId" = NULL, "rateLockedAt" = NULL
WHERE d."lockedUsdEgpRate" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "Contract" c WHERE c."dealId" = d.id AND c.type = 'PRELIMINARY_CONTRACT' AND c.status IN ('SIGNED', 'VERIFIED'));

-- مصدر السعر للصفقات المثبّتة
UPDATE "Deal" d SET "fxSource" = r.source::text FROM "ExchangeRate" r WHERE r.id = d."exchangeRateId" AND d."fxSource" IS NULL;
