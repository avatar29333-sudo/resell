"use client";

import { useState, useTransition } from "react";
import type { Locale } from "@/i18n/config";
import { tr } from "@/lib/format";
import { COUNTRY, label } from "@/lib/labels";
import { btn, field, labelCls, Notice } from "@/components/ui";
import { identify, register, resend, verify, verifyTotpStep, type SignInState } from "./actions";

export function SignInFlow({ locale, next, demo }: { locale: Locale; next: string | null; demo: boolean }) {
  const L = tr(locale);
  const [state, setState] = useState<SignInState>({ step: "identify" });
  const [busy, start] = useTransition();

  const run = (fn: (f: FormData) => Promise<SignInState>) => (f: FormData) =>
    start(async () => {
      setState(await fn(f));
    });

  const err = state.error && (
    <p role="alert" className="border border-[#EFC4C4] bg-[#FBEAEA] px-3 py-2 text-[#A32020]">
      {state.error}
    </p>
  );

  if (state.step === "register") {
    const pf = state.prefill ?? {};
    return (
      <form action={run((f) => register(locale, state, f))} className="flex flex-col gap-4">
        <Notice tone="amber">
          {L(
            "مش لاقيين حساب بالبيانات دي. سجّل بياناتك وهنبعت لك رمز تأكيد على واتساب.",
            "We couldn't find an account. Enter your details and we'll send a confirmation code on WhatsApp.",
          )}
        </Notice>
        {err}
        <label className={labelCls}>
          {L("الاسم بالكامل", "Full name")}
          <input name="name" required autoComplete="name" defaultValue={pf.name} className={field} />
        </label>
        <label className={labelCls}>
          {L("رقم الواتساب بكود الدولة", "WhatsApp number with country code")}
          <input
            name="phone"
            type="tel"
            required
            dir="ltr"
            autoComplete="tel"
            placeholder="+966 5x xxx xxxx"
            defaultValue={pf.phone}
            className={`${field} text-start`}
          />
        </label>
        <label className={labelCls}>
          {L("الإيميل (اختياري)", "Email (optional)")}
          <input name="email" type="email" dir="ltr" autoComplete="email" defaultValue={pf.email} className={`${field} text-start`} />
        </label>
        <label className={labelCls}>
          {L("بلد الإقامة", "Country of residence")}
          <select name="country" defaultValue="SA" className={field}>
            {Object.keys(COUNTRY).map((c) => (
              <option key={c} value={c}>
                {label(COUNTRY, c, locale)}
              </option>
            ))}
          </select>
        </label>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1.5 text-sm font-medium text-muted">{L("ابعت لي الرمز على", "Send my code by")}</legend>
          <div className="flex flex-wrap gap-4">
            <label className="flex min-h-11 items-center gap-2">
              <input type="radio" name="channel" value="whatsapp" defaultChecked className="size-5" />
              {L("واتساب", "WhatsApp")}
            </label>
            <label className="flex min-h-11 items-center gap-2">
              <input type="radio" name="channel" value="email" className="size-5" />
              {L("الإيميل", "Email")}
            </label>
          </div>
        </fieldset>
        <label className="flex items-start gap-2 text-sm leading-6">
          <input type="checkbox" name="terms" required className="mt-1 size-5 shrink-0" />
          <span>
            {L("أوافق على ", "I accept the ")}
            <a href={`/${locale}/terms`} target="_blank" className="font-semibold text-brand underline">
              {L("الشروط", "terms")}
            </a>
            {L(" و", " and ")}
            <a href={`/${locale}/privacy`} target="_blank" className="font-semibold text-brand underline">
              {L("سياسة الخصوصية", "privacy policy")}
            </a>
            {L(
              ". رقمك ما بيظهرش لأي مشتري أو بائع قبل اتفاق العمولة.",
              ". Your number is never shown to a buyer or seller before the commission agreement.",
            )}
          </span>
        </label>
        <div className="flex flex-wrap gap-3">
          <button type="submit" disabled={busy} className={btn.primary}>
            {busy ? L("لحظة…", "One moment…") : L("سجّل وابعت الرمز", "Sign up and send code")}
          </button>
          <button type="button" onClick={() => setState({ step: "identify" })} className={btn.ghost}>
            {L("رجوع", "Back")}
          </button>
        </div>
      </form>
    );
  }

  if (state.step === "totp") {
    return (
      <form action={run((f) => verifyTotpStep(locale, next, state, f))} className="flex flex-col gap-4">
        <Notice tone="blue">
          {L(
            "حسابك عليه تحقق ثنائي. افتح تطبيق التحقق (Google أو Microsoft Authenticator) واكتب الرمز اللي ظاهر لـ Resell.",
            "Your account has two-factor authentication. Open your authenticator app and enter the code shown for Resell.",
          )}
        </Notice>
        {err}
        <label className={labelCls}>
          {L("رمز تطبيق التحقق", "Authenticator code")}
          <input
            name="totp"
            required
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            dir="ltr"
            className={`${field} text-center text-2xl tracking-[0.4em]`}
          />
        </label>
        <button type="submit" disabled={busy} className={btn.primary}>
          {busy ? L("بنتأكد…", "Checking…") : L("دخول", "Sign in")}
        </button>
      </form>
    );
  }

  if (state.step === "code") {
    return (
      <form action={run((f) => verify(locale, next, state, f))} className="flex flex-col gap-4">
        <p className="leading-7">
          {state.channel === "email"
            ? L("بعتنا رمز من 6 أرقام على الإيميل", "We sent a 6-digit code to the email")
            : L("بعتنا رمز من 6 أرقام على واتساب للرقم", "We sent a 6-digit code on WhatsApp to")}{" "}
          <strong dir="ltr">{state.channel === "email" ? state.maskedEmail : state.maskedPhone}</strong>
        </p>
        {demo && state.demoCode && (
          <Notice tone="amber">
            {L("وضع تجريبي (واتساب والإيميل لسه مش متربطين) — الرمز هو:", "Demo mode (WhatsApp and email not connected yet) — your code is:")}{" "}
            <strong dir="ltr" className="text-lg tracking-[0.3em]" data-testid="demo-code">
              {state.demoCode}
            </strong>
          </Notice>
        )}
        {err}
        <label className={labelCls}>
          {L("رمز التأكيد", "Confirmation code")}
          <input
            name="code"
            required
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            dir="ltr"
            className={`${field} text-center text-2xl tracking-[0.4em]`}
          />
        </label>
        <div className="flex flex-wrap gap-3">
          <button type="submit" disabled={busy} className={btn.primary}>
            {busy
              ? L("بنتأكد…", "Checking…")
              : state.purpose === "sign_up"
                ? L("أكّد وافتح الحساب", "Confirm and create account")
                : L("دخول", "Sign in")}
          </button>
          <button
            type="button"
            disabled={busy}
            className={btn.ghost}
            onClick={() => start(async () => setState(await resend(locale, state, state.channel ?? "whatsapp")))}
          >
            {L("ابعت رمز جديد", "Send a new code")}
          </button>
          {state.channel === "email" ? (
            <button type="button" disabled={busy} className={btn.ghost} onClick={() => start(async () => setState(await resend(locale, state, "whatsapp")))}>
              {L("ابعته على واتساب بدل الإيميل", "Send it on WhatsApp instead")}
            </button>
          ) : (
            state.maskedEmail && (
              <button type="button" disabled={busy} className={btn.ghost} onClick={() => start(async () => setState(await resend(locale, state, "email")))}>
                {L("ابعته على الإيميل بدل واتساب", "Send it by email instead")}
              </button>
            )
          )}
          <button type="button" onClick={() => setState({ step: "identify" })} className={btn.ghost}>
            {L("غيّر البيانات", "Use different details")}
          </button>
        </div>
      </form>
    );
  }

  return (
    <form action={run((f) => identify(locale, state, f))} className="flex flex-col gap-4">
      {err}
      <label className={labelCls}>
        {L("رقم الموبايل أو الإيميل أو الاسم", "Mobile number, email or name")}
        <input name="identifier" required autoComplete="username" className={field} placeholder={L("مثلاً +966501234567", "e.g. +966501234567")} />
      </label>
      <button type="submit" disabled={busy} className={btn.primary}>
        {busy ? L("لحظة…", "One moment…") : L("كمّل", "Continue")}
      </button>
      <p className="text-sm leading-6 text-muted">
        {L("أول مرة؟ اكتب رقمك وهنسجّل لك حساب جديد.", "First time? Enter your number and we'll create a new account.")}
      </p>
    </form>
  );
}
