-- MKT-02: الأقساط الباقية بالدولار على القطعة (عمود جديد بس)
ALTER TABLE "Listing" ADD COLUMN "remainingUsd" DECIMAL(14,2);
