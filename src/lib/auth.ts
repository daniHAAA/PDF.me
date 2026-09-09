import { SignJWT, jwtVerify } from "jose";
import { timingSafeEqual } from "node:crypto";
import { config, SESSION_COOKIE } from "./config";

/**
 * Sehr schlanke Session-Verwaltung:
 * ein signiertes JWT im HttpOnly-Cookie. Kein Speicher, keine Datenbank —
 * passend dazu, dass die App bewusst zustandslos ist.
 */

/** Passwortvergleich in konstanter Zeit, damit Laufzeit nichts verrät. */
export function passwordMatches(candidate: string): boolean {
  const expected = Buffer.from(config.password, "utf8");
  const actual = Buffer.from(candidate ?? "", "utf8");
  // timingSafeEqual verlangt gleiche Länge — deshalb erst auf gleiche Länge
  // bringen und die Längengleichheit separat in das Ergebnis einrechnen.
  const length = Math.max(expected.length, actual.length);
  const a = Buffer.alloc(length);
  const b = Buffer.alloc(length);
  expected.copy(a);
  actual.copy(b);
  return timingSafeEqual(a, b) && expected.length === actual.length;
}

export async function createSessionToken(): Promise<string> {
  return new SignJWT({ role: "user" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${config.sessionHours}h`)
    .sign(config.authSecret);
}

export async function verifySessionToken(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  try {
    await jwtVerify(token, config.authSecret, { algorithms: ["HS256"] });
    return true;
  } catch {
    return false;
  }
}

export function sessionCookieOptions() {
  return {
    name: SESSION_COOKIE,
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    maxAge: config.sessionHours * 3600,
    // Lokal läuft die App über http://localhost — secure würde das Cookie dort
    // verwerfen. In Produktion (HTTPS) schaltet es sich automatisch scharf.
    secure: process.env.NODE_ENV === "production",
  };
}

export { SESSION_COOKIE };
