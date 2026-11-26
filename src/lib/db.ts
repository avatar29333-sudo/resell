import { PrismaClient } from "@prisma/client";

// قواعد ثابتة: سجل التدقيق ما يتعدلش وما يتمسحش، والمستندات ما تتمسحش (إصدار جديد بدل التعديل).
// نفس القواعد متطبقة كمان جوه قاعدة البيانات (prisma/sql/extras.sql) عشان محدش يعدّيها بـ SQL.
function blocked(what: string): never {
  throw new Error(`ممنوع: ${what}`);
}

function createClient() {
  return new PrismaClient().$extends({
    query: {
      auditLog: {
        update: () => blocked("تعديل سجل التدقيق"),
        updateMany: () => blocked("تعديل سجل التدقيق"),
        upsert: () => blocked("تعديل سجل التدقيق"),
        delete: () => blocked("حذف من سجل التدقيق"),
        deleteMany: () => blocked("حذف من سجل التدقيق"),
      },
      document: {
        delete: () => blocked("حذف مستند — اعمل إصدار جديد بدل كده"),
        deleteMany: () => blocked("حذف مستند — اعمل إصدار جديد بدل كده"),
      },
    },
  });
}

type DbClient = ReturnType<typeof createClient>;

// نسخة واحدة بس من الاتصال أثناء التطوير (Next.js بيعيد تحميل الكود كتير)
const globalForDb = globalThis as unknown as { db?: DbClient };

export const db: DbClient = globalForDb.db ?? createClient();

if (process.env.NODE_ENV !== "production") globalForDb.db = db;
