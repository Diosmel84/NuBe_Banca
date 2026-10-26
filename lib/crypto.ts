import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

const IV_BYTES = 12;
const TAG_BYTES = 16;

let cachedMaster: Buffer | null = null;
function masterKey(): Buffer {
  if (cachedMaster) return cachedMaster;
  const raw = process.env.ENCRYPTION_MASTER_KEY;
  if (!raw) throw new Error("ENCRYPTION_MASTER_KEY no configurada");
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("ENCRYPTION_MASTER_KEY debe ser 32 bytes en base64");
  cachedMaster = key;
  return key;
}

/** Clave por contexto (ej. un trade) derivada con HKDF: comprometer un mensaje no expone otros contextos. */
function deriveKey(context: string): Buffer {
  return Buffer.from(hkdfSync("sha256", masterKey(), Buffer.alloc(0), `jm-p2p:${context}`, 32));
}

export interface EncryptedPayload {
  /** base64(ciphertext || authTag) */
  ciphertext: string;
  /** base64(iv) */
  iv: string;
}

export function encrypt(plaintext: string, context: string): EncryptedPayload {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", deriveKey(context), iv);
  cipher.setAAD(Buffer.from(context));
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final(), cipher.getAuthTag()]);
  return { ciphertext: ct.toString("base64"), iv: iv.toString("base64") };
}

export function decrypt(payload: EncryptedPayload, context: string): string {
  const data = Buffer.from(payload.ciphertext, "base64");
  const tag = data.subarray(data.length - TAG_BYTES);
  const ct = data.subarray(0, data.length - TAG_BYTES);
  const decipher = createDecipheriv("aes-256-gcm", deriveKey(context), Buffer.from(payload.iv, "base64"));
  decipher.setAAD(Buffer.from(context));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}

/** Formato compacto "iv.ciphertext" para guardar en una sola columna (ej. twoFASecret). */
export const sealString = (plaintext: string, context: string): string => {
  const { iv, ciphertext } = encrypt(plaintext, context);
  return `${iv}.${ciphertext}`;
};

export const openString = (sealed: string, context: string): string => {
  const [iv, ciphertext] = sealed.split(".");
  if (!iv || !ciphertext) throw new Error("Formato de secreto inválido");
  return decrypt({ iv, ciphertext }, context);
};

/** Simulación de hash TRC20 (64 hex). NO hay integración on-chain en el MVP. */
export const fakeTronTxHash = (): string => randomBytes(32).toString("hex");
