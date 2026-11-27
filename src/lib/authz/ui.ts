import "server-only";
import type { User } from "@prisma/client";
import { can, type Action, type Ctx } from "./policy";
import { subject } from "./index";

/** للواجهة: الصلاحيات المتاحة للمستخدم على مورد معيّن — نفس السياسة اللي السيرفر بيفحص بيها (11.5) */
export function permissionsFor(user: User | null, actions: Action[], ctx: Ctx) {
  const s = subject(user);
  return Object.fromEntries(actions.map((a) => [a, can(s, a, ctx)])) as Record<Action, ReturnType<typeof can>>;
}
