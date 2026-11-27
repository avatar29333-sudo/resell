-- PUB-03 (مراجعة أمنية): عدّاد محاولات ذرّي لكود تأكيد المالك — إضافة بس
ALTER TABLE "Listing" ADD COLUMN "ownerConfirmAttempts" INTEGER NOT NULL DEFAULT 0;
