#!/usr/bin/env bash
# Resell — تثبيت المكتبات (الخطوة 1)
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

# الخطوة 2 (هنثبتهم لما نوصل لقاعدة البيانات):
#   npm install @prisma/client@6 jose@6 @aws-sdk/client-s3@3 @aws-sdk/s3-request-presigner@3
#   npm install -D prisma@6

echo "تم التثبيت. شغّل: npm run dev  وافتح http://localhost:3000"
