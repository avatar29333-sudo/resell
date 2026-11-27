-- REL-03: الموظف ممكن يبقى عميل (يبيع/يشتري لنفسه) — صلاحية منفصلة عن الدور الوظيفي
ALTER TABLE "User" ADD COLUMN "clientEnabled" BOOLEAN NOT NULL DEFAULT false;
