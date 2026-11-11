import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  createHash,
  timingSafeEqual,
} from "node:crypto";
export function encryptionKey(): Buffer {
  const raw = process.env.MT5_ENCRYPTION_KEY || "";
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32 || key.toString("base64") !== raw)
    throw new Error("MT5 encryption is not configured.");
  return key;
}
export function encrypt(password: string, context: string): string {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  cipher.setAAD(Buffer.from(context));
  const encrypted = Buffer.concat([
    cipher.update(password, "utf8"),
    cipher.final(),
  ]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64");
}
export function decrypt(value: string, context: string): string {
  const b = Buffer.from(value, "base64"),
    decipher = createDecipheriv(
      "aes-256-gcm",
      encryptionKey(),
      b.subarray(0, 12),
    );
  decipher.setAAD(Buffer.from(context));
  decipher.setAuthTag(b.subarray(12, 28));
  return Buffer.concat([
    decipher.update(b.subarray(28)),
    decipher.final(),
  ]).toString("utf8");
}
export const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export function matches(a: string, b: string): boolean {
  return timingSafeEqual(Buffer.from(hash(a)), Buffer.from(hash(b)));
}
