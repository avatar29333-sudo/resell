"use client";

import { useState } from "react";

/**
 * SEC-07: تغيير الدور بتأكيد صريح فيه الدور القديم والجديد.
 * التأكيد بيتبعت للسيرفر كـ «قديم>جديد» والسيرفر بيرفض من غيره.
 */
export function RoleForm({
  action,
  current,
  roles,
  ar,
  brokerRegNo,
}: {
  action: (f: FormData) => void;
  current: string;
  roles: { key: string; label: string }[];
  ar: boolean;
  brokerRegNo?: string | null;
}) {
  const [role, setRole] = useState(current);
  const name = (k: string) => roles.find((r) => r.key === k)?.label ?? k;
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (role === current) return e.preventDefault();
        const extra = role === "ADMIN" ? (ar ? "\n\nالترقية لأدمن هتطلب منك تأكيد هويتك، وهيتبعت إشعار لباقي الأدمنز." : "\n\nPromoting to admin will ask you to confirm your identity, and other admins will be notified.") : "";
        const msg = ar ? `تغيير الدور من «${name(current)}» إلى «${name(role)}»؟${extra}` : `Change role from "${name(current)}" to "${name(role)}"?${extra}`;
        if (!window.confirm(msg)) e.preventDefault();
      }}
      className="flex flex-wrap items-center gap-1.5"
    >
      <input type="hidden" name="confirmed" value={`${current}>${role}`} />
      <select name="role" value={role} onChange={(e) => setRole(e.target.value)} className="min-h-9 w-36 border border-line px-2 text-sm" aria-label={ar ? "الدور" : "Role"}>
        {roles.map((r) => (
          <option key={r.key} value={r.key}>
            {r.label}
          </option>
        ))}
      </select>
      {role === "PARTNER_BROKER" && (
        <input
          name="brokerRegNo"
          defaultValue={brokerRegNo ?? ""}
          required={!brokerRegNo}
          placeholder={ar ? "رقم القيد في سجل الوسطاء" : "Broker registry number"}
          className="min-h-9 w-44 border border-line px-2 text-sm"
          dir="ltr"
        />
      )}
      <button disabled={role === current} className="inline-flex min-h-9 items-center border border-brand px-3 text-sm font-semibold text-brand disabled:opacity-40">
        {ar ? "حفظ" : "Save"}
      </button>
    </form>
  );
}
