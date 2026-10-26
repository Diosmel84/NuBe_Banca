import { authenticator } from "otplib";
import { openString, sealString } from "@/lib/crypto";
import { redis } from "@/lib/redis";

authenticator.options = { window: 1, step: 30 };

const ctx = (userId: string) => `2fa:${userId}`;

export const generateTotpSecret = () => authenticator.generateSecret();
export const totpKeyUri = (email: string, secret: string) => authenticator.keyuri(email, "Juan Mecanico P2P", secret);
export const sealTotpSecret = (userId: string, secret: string) => sealString(secret, ctx(userId));

/**
 * Verifica el código contra el secreto cifrado del usuario y bloquea replay:
 * un mismo código no se acepta dos veces dentro de su ventana.
 */
export async function verifyUserTotp(userId: string, sealedSecret: string, code: string): Promise<boolean> {
  if (!/^\d{6}$/.test(code)) return false;
  const secret = openString(sealedSecret, ctx(userId));
  if (!authenticator.check(code, secret)) return false;
  const fresh = await redis.set(`totp:used:${userId}:${code}`, "1", "EX", 90, "NX");
  return fresh === "OK";
}

export const verifyRawTotp = (secret: string, code: string) => /^\d{6}$/.test(code) && authenticator.check(code, secret);
