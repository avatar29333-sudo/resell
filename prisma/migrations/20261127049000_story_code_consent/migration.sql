-- MKT-14: موافقة كل طرف على إظهار كود القطعة في القصة (أعمدة جديدة بس)
ALTER TABLE "DealStory" ADD COLUMN "buyerShowCode" BOOLEAN NOT NULL DEFAULT false, ADD COLUMN "sellerShowCode" BOOLEAN NOT NULL DEFAULT false;
