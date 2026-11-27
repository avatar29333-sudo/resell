-- موافقة الطرفين على السعر + لحظة تثبيت سعر الصرف (إضافة بس)
ALTER TABLE "Deal"
  ADD COLUMN "proposedPrice" DECIMAL(14,2),
  ADD COLUMN "buyerPriceOkAt" TIMESTAMP(3),
  ADD COLUMN "sellerPriceOkAt" TIMESTAMP(3),
  ADD COLUMN "rateLockedAt" TIMESTAMP(3);
