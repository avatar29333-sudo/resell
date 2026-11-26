// تنضيف قاعدة البيانات بالكامل (كل الجداول، مع الحفاظ على الـ migrations).
// للبيئة التجريبية بس. لازم تكتب --yes عشان يشتغل:
//   npm run db:clean -- --yes
// ملحوظة: TRUNCATE بيعدّي حماية «سجل التدقيق ما يتمسحش» — عشان كده ممنوع على الإنتاج.
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  if (!process.argv.includes("--yes")) {
    console.log("ده هيمسح كل البيانات. لو متأكد: npm run db:clean -- --yes");
    process.exit(1);
  }
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_DB_CLEAN !== "1") {
    console.log("ممنوع على الإنتاج.");
    process.exit(1);
  }
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename NOT IN ('_prisma_migrations', 'spatial_ref_sys')`;
  const list = tables.map((t) => `"${t.tablename}"`).join(", ");
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
  console.log(`اتمسحت ${tables.length} جدول.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
