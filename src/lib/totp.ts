// رموز TOTP (RFC 6238) — نفس اللي بيطلّعه Google Authenticator و Microsoft Authenticator.
// من غير مكتبات: HMAC-SHA1 من node:crypto. السر بيتخزن متشفّر (AES-256-GCM).
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(buf: Buffer) {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(s: string) {
  const clean = s.replace(/[\s=-]/g, "").toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const i = B32.indexOf(ch);
    if (i < 0) throw new Error("bad base32");
    value = (value << 5) | i;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export const newSecret = () => base32Encode(randomBytes(20));

/** الرمز (6 أرقام) لخانة زمنية معيّنة — كل خانة 30 ثانية */
export function totpAt(secretB32: string, counter: number) {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = createHmac("sha1", base32Decode(secretB32)).update(msg).digest();
  const off = h[h.length - 1] & 15;
  const code = ((h[off] & 127) << 24) | (h[off + 1] << 16) | (h[off + 2] << 8) | h[off + 3];
  return String(code % 1_000_000).padStart(6, "0");
}

/** بيقبل الخانة الحالية وخانة قبلها وبعدها (فرق ساعة الموبايل) */
export function verifyTotp(secretB32: string, code: string, now = Date.now()) {
  const c = code.replace(/\D/g, "");
  if (c.length !== 6) return false;
  const step = Math.floor(now / 30_000);
  return [-1, 0, 1].some((d) => {
    const expected = Buffer.from(totpAt(secretB32, step + d));
    return timingSafeEqual(expected, Buffer.from(c));
  });
}

export function otpauthUri(secretB32: string, account: string, issuer = "Resell") {
  return `otpauth://totp/${encodeURIComponent(`${issuer}:${account}`)}?secret=${secretB32}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}

// ─── تشفير السر في قاعدة البيانات ───
function key() {
  const s = process.env.SESSION_SECRET || "dev-only-secret-change-me-please";
  return createHash("sha256").update(`totp:${s}`).digest();
}

export function encryptSecret(plain: string) {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), enc].map((b) => b.toString("base64")).join(".");
}

export function decryptSecret(stored: string) {
  const [iv, tag, enc] = stored.split(".").map((p) => Buffer.from(p, "base64"));
  const d = createDecipheriv("aes-256-gcm", key(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(enc), d.final()]).toString("utf8");
}
