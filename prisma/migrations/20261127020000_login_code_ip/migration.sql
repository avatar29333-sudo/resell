-- SEC-01: حد محاولات طلب الرمز لكل IP كمان (إضافة عمود بس)
ALTER TABLE "LoginCode" ADD COLUMN "ip" TEXT;
CREATE INDEX "LoginCode_ip_createdAt_idx" ON "LoginCode"("ip", "createdAt");
