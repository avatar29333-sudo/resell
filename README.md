# Resell

منصة وساطة لإعادة بيع أراضي «بيت الوطن». الخطة الكاملة في دوك «Resell — خطة البرمجة وطريقة العمل».

## التشغيل لأول مرة

```bash
bash install.sh      # تثبيت المكتبات
npm run dev          # http://localhost:3000  (بيحوّل على /ar)
```

## اللي اتعمل (الخطوة 1)

- Next.js 15 (App Router) + TypeScript + Tailwind 4
- عربي (RTL) وإنجليزي على `/ar` و `/en`، والنصوص في `src/i18n/messages`
- ألوان الهوية في `src/app/globals.css`، والخط IBM Plex Sans Arabic
- الهيدر والفوتر والصفحة الرئيسية (العنوان، البحث، خطوات الصفقة)
- فحص السيرفر: `GET /api/health`

## الخطوة الجاية (2)

جداول قاعدة البيانات بـ Prisma + PostgreSQL: User, Plot, Listing, Document, Review, Deal, DealEvent, Contract, Commission, Deposit, ExchangeRate, PriceIndex, BuyRequest, ServiceRequest, AuditLog.

## الهيكل

```
src/
  app/
    [locale]/layout.tsx   الإطار: html + dir + الخط + الهيدر والفوتر
    [locale]/page.tsx     الصفحة الرئيسية
    api/health/route.ts
    globals.css
  components/             Logo, SiteHeader, SiteFooter
  i18n/                   اللغات والقواميس
```
