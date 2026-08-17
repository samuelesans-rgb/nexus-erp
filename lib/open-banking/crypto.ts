import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const algorithm = "aes-256-gcm";
function key() {
  const value = process.env.OPEN_BANKING_ENCRYPTION_KEY;
  if (!value) throw new Error("Open Banking non configurato: chiave di cifratura assente.");
  const decoded = Buffer.from(value, "base64");
  if (decoded.length !== 32) throw new Error("Open Banking non configurato: chiave di cifratura non valida.");
  return decoded;
}
export function encryptSecret(value?: string) {
  if (!value) return null;
  const iv = randomBytes(12); const cipher = createCipheriv(algorithm, key(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return `v1.${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${encrypted.toString("base64url")}`;
}
export function decryptSecret(value?: string | null) {
  if (!value) return undefined;
  const [version, iv, tag, encrypted] = value.split(".");
  if (version !== "v1" || !iv || !tag || !encrypted) throw new Error("Token Open Banking cifrato non valido.");
  const decipher = createDecipheriv(algorithm, key(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encrypted, "base64url")), decipher.final()]).toString("utf8");
}
export const stateDigest = (state: string) => createHash("sha256").update(state).digest("hex");
