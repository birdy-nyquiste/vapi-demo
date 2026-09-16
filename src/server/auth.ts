import { timingSafeEqual, createHmac } from "node:crypto";
import type { Config } from "./config.js";
export function equalSecret(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
export function localOpen(c: Config) {
  return !c.deployed && c.mode === "mock" && !c.accessToken;
}
export function session(c: Config) {
  const expiry = String(Date.now() + 8 * 60 * 60 * 1000);
  return `${expiry}.${createHmac("sha256", c.accessToken!).update(expiry).digest("hex")}`;
}
export function authorized(c: Config, cookie: string | undefined) {
  if (localOpen(c)) return true;
  if (!c.accessToken) return false;
  const token = cookie
    ?.split(";")
    .map((v) => v.trim())
    .find((v) => v.startsWith("demo_session="))
    ?.slice(13);
  if (!token) return false;
  const [expiry, signature] = token.split(".");
  return (
    !!signature &&
    Number(expiry) > Date.now() &&
    equalSecret(
      signature,
      createHmac("sha256", c.accessToken).update(expiry).digest("hex"),
    )
  );
}
