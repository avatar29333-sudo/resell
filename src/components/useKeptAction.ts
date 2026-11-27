"use client";

import { startTransition, useActionState, type FormEvent } from "react";

/**
 * UX-01: فورم بيتبعت لـ server action من غير ما React يمسح الحقول بعد الإرسال.
 * (لما بنستخدم <form action={…}> React 19 بيعمل reset للفورم، فلو السيرفر رجّع خطأ
 * المستخدم بيلاقي كل حاجة اتمسحت — بما فيها الملفات.) هنا بنبعت بإيدينا جوه transition.
 */
export function useKeptAction<S>(fn: (state: Awaited<S>, form: FormData) => Promise<S>, initial: Awaited<S>, before?: (form: FormData, e: FormEvent<HTMLFormElement>) => boolean | void) {
  const [state, run, pending] = useActionState<S, FormData>(fn, initial);
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    if (before && before(form, e) === false) return;
    startTransition(() => run(form));
  };
  return [state, onSubmit, pending] as const;
}
