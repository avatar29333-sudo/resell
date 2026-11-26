# Resell

منصة وساطة لإعادة بيع أراضي «بيت الوطن». الخطة الكاملة في دوك «Resell — خطة البرمجة وطريقة العمل».

## التشغيل لأول مرة

محتاج: Node.js 20 أو أحدث، و Docker (لقاعدة البيانات على جهازك).

```bash
bash install.sh      # تثبيت المكتبات
cp .env.example .env # وبعدين املا القيم
npm run db:up        # تشغيل PostgreSQL + PostGIS في Docker
npm run db:setup     # إنشاء الجداول + الحماية + البيانات التجريبية
npm run dev          # http://localhost:3000  (بيحوّل على /ar)
```

من غير Docker (ويندوز): ثبّت PostgreSQL 16 و PostGIS، واعمل مستخدم `resell` بباسورد `resell` وقاعدة `resell`، واتخطى `npm run db:up`. مستخدم التطوير محتاج صلاحية SUPERUSER على جهازك بس، عشان Prisma يقدر يفعّل PostGIS في القاعدة المؤقتة (shadow database).

على ويندوز: خلّي فولدر المشروع في مسار قصير (زي `C:\dev\resell`)، لأن المسارات الأطول من 260 حرف بتبوّظ تثبيت محرك Prisma.

أوامر قاعدة البيانات:

| الأمر | بيعمل إيه |
| --- | --- |
| `npm run db:migrate` | بعد أي تعديل في `prisma/schema.prisma` — بيعمل migration جديدة |
| `npm run db:extras` | بيطبّق `prisma/sql/extras.sql` (فهرس الخرايط، منع تعديل سجل التدقيق وحذف المستندات) |
| `npm run db:seed` | حساب تجريبي لكل دور (أرقام `+2010000000xx`) + قطعة وعرض وسعر صرف |
| `npm run db:studio` | تشوف الجداول وتعدّل فيها من المتصفح |
| `npm run db:deploy` | على السيرفر: migrations + extras من غير بيانات تجريبية |

## اللي اتعمل

### الخطوة 1

- Next.js 15 (App Router) + TypeScript + Tailwind 4
- عربي (RTL) وإنجليزي على `/ar` و `/en`، والنصوص في `src/i18n/messages`
- ألوان الهوية في `src/app/globals.css`، والخط IBM Plex Sans Arabic
- الهيدر والفوتر والصفحة الرئيسية (العنوان، البحث، خطوات الصفقة)
- فحص السيرفر: `GET /api/health`

### الخطوة 2

- `prisma/schema.prisma`: الـ16 جدول اللي في الخطة — User, KycProfile, Plot, Listing, Document, Review, Deal, DealEvent, Contract, Commission, Deposit, ExchangeRate, PriceIndex, BuyRequest, ServiceRequest, AuditLog
- القطعة فريدة بـ (المدينة، الحي، الكود) — أساس كشف العروض المكررة
- حدود القطعة `geometry(MultiPolygon, 4326)` في PostGIS
- الصفقة بمراحلها السبعة؛ سعر الصرف ونسب العمولة بتتنسخ في الصفقة وقت إنشائها
- المستندات بالإصدارات ومن غير حذف، وسجل التدقيق إضافة بس — متطبقين في الكود (`src/lib/db.ts`) وفي قاعدة البيانات (`prisma/sql/extras.sql`)
- `docker-compose.yml` لقاعدة بيانات التطوير

## الخطوة الجاية (3)

الدخول برمز واتساب والجلسات والأدوار (سبرنت S1). هيحتاج جدول لرموز الدخول (OTP) والجلسات.

## الهيكل

```
prisma/
  schema.prisma           الجداول
  seed.ts                 البيانات التجريبية
  sql/extras.sql          PostGIS index + triggers
src/
  app/
    [locale]/layout.tsx   الإطار: html + dir + الخط + الهيدر والفوتر
    [locale]/page.tsx     الصفحة الرئيسية
    api/health/route.ts
    globals.css
  components/             Logo, SiteHeader, SiteFooter
  i18n/                   اللغات والقواميس
  lib/db.ts               الاتصال بقاعدة البيانات
```
