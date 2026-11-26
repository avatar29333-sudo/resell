#!/usr/bin/env bash
# Resell — تثبيت المكتبات (الخطوات 1 و 2)
# شغّله من فولدر المشروع:  bash install.sh
# الإصدارات مثبّتة على الإصدار الرئيسي عشان الكود المكتوب يفضل متوافق.
set -euo pipefail

# أساس الموقع
npm install next@15 react@19 react-dom@19

# التحقق من البيانات والفورمات وتواريخ
npm install zod@3 react-hook-form@7 @hookform/resolvers@3 date-fns@4

# أدوات التطوير: TypeScript و Tailwind والاختبار والتنسيق
npm install -D typescript@5 @types/node@22 @types/react@19 @types/react-dom@19 \
  tailwindcss@4 @tailwindcss/postcss@4 \
  prettier@3 prettier-plugin-tailwindcss \
  vitest@3

# الخطوة 2: قاعدة البيانات (Prisma + PostgreSQL/PostGIS)، الجلسات، وخزنة المستندات
npm install @prisma/client@6 jose@6 @aws-sdk/client-s3@3 @aws-sdk/s3-request-presigner@3
npm install -D prisma@6 tsx@4

# تجهيز عميل قاعدة البيانات من schema.prisma
npx prisma generate

echo "تم التثبيت."
echo "قاعدة البيانات:  npm run db:up  ثم  npm run db:setup"
echo "الموقع:          npm run dev  وافتح http://localhost:3000"
