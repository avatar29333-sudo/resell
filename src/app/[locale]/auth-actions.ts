"use server";

import { redirect } from "next/navigation";
import { destroySession, getCurrentUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { isLocale } from "@/i18n/config";

export async function signOut(locale: string) {
  const user = await getCurrentUser();
  if (user) await audit(user.id, "auth.sign_out", "User", user.id);
  await destroySession();
  redirect(`/${isLocale(locale) ? locale : "ar"}`);
}
