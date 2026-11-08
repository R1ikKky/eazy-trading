import {
  createHash,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
import type { Request, Response } from "express";
import { fail } from "../../common/exceptions/api-error";
const scrypt = promisify(scryptCallback);
export const opaque = () => randomBytes(32).toString("base64url");
export const digest = (s: string) =>
  createHash("sha256").update(s).digest("hex");
export const origin = () =>
  process.env.PUBLIC_ORIGIN || "http://127.0.0.1:3000";
export function cookie(req: Request, name: string): string {
  const part = (req.headers.cookie || "")
    .split(";")
    .find((s) => s.trim().startsWith(name + "="));
  return part ? part.trim().slice(name.length + 1) : "";
}
export function setCookie(
  res: Response,
  name: string,
  value: string,
  maxAge: number,
  path = "/api",
) {
  res.cookie(name, value, {
    httpOnly: true,
    secure: origin().startsWith("https:"),
    sameSite: "lax",
    path,
    maxAge,
  });
}
export function clearCookies(res: Response) {
  setCookie(res, "replay_access", "", 0);
  setCookie(res, "replay_refresh", "", 0, "/api/auth");
}
export async function hashPassword(password: string) {
  const salt = opaque();
  const hash = (await scrypt(password, salt, 64)) as Buffer;
  return `scrypt:${salt}:${hash.toString("hex")}`;
}
export async function checkPassword(password: string, encoded: string) {
  const [, salt, hex] = encoded.split(":");
  const calculated = (await scrypt(password, salt, 64)) as Buffer;
  const saved = Buffer.from(hex, "hex");
  return (
    saved.length === calculated.length && timingSafeEqual(saved, calculated)
  );
}
export function passwordInput(value: unknown): string {
  if (
    typeof value !== "string" ||
    Buffer.byteLength(value) > 256 ||
    value.length < 12
  )
    fail(400, "INVALID_PASSWORD", "Use a password between 12 and 256 bytes.");
  return value;
}
export function emailInput(v: unknown): string {
  if (typeof v !== "string" || v.length > 254 || !/^\S+@\S+\.\S+$/.test(v))
    fail(400, "INVALID_EMAIL", "Enter a valid email.");
  return v.trim().toLowerCase();
}
export function usernameInput(v: unknown): string {
  if (typeof v !== "string" || !/^[a-zA-Z0-9_][a-zA-Z0-9_.-]{2,31}$/.test(v))
    fail(
      400,
      "INVALID_USERNAME",
      "Username must contain 3–32 letters, digits, dots, dashes or underscores.",
    );
  return v.toLowerCase();
}
export function oneMonthFrom(date = new Date()): Date {
  const out = new Date(date);
  const day = out.getUTCDate();
  out.setUTCDate(1);
  out.setUTCMonth(out.getUTCMonth() + 1);
  const last = new Date(
    Date.UTC(out.getUTCFullYear(), out.getUTCMonth() + 1, 0),
  ).getUTCDate();
  out.setUTCDate(Math.min(day, last));
  return out;
}
export function userId(req: Request): string {
  const id = (req as Request & { authUserId?: string }).authUserId;
  if (!id) fail(401, "UNAUTHENTICATED", "Sign in required.");
  return id;
}
