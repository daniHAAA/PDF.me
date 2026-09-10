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

/**
 * Läuft diese Anfrage über HTTPS?
 *
 * Hinter einem Reverse Proxy (nginx, Traefik, Cloudflare) sieht die App selbst
 * nur HTTP; die ursprüngliche Verbindung steht dann in X-Forwarded-Proto.
 */
function isSecureRequest(request: Request): boolean {
  const forwarded = request.headers.get("x-forwarded-proto");
  if (forwarded) return forwarded.split(",")[0].trim() === "https";
  try {
    return new URL(request.url).protocol === "https:";
  } catch {
    return false;
  }
}

export function sessionCookieOptions(request: Request) {
  return {
    name: SESSION_COOKIE,
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    maxAge: config.sessionHours * 3600,
    /*
     * secure richtet sich nach der tatsächlichen Verbindung, NICHT nach
     * NODE_ENV.
     *
     * Der Unterschied ist entscheidend, sobald die App im Netzwerk genutzt
     * wird: Ein Secure-Cookie verwirft der Browser über http://192.168.x.x
     * kommentarlos. Die Anmeldung meldet dann Erfolg, das Cookie wird nie
     * gespeichert, und man landet ohne jede Fehlermeldung wieder auf dem
     * Login — ein Fehler, der sich kaum finden lässt. Über localhost fällt
     * er nicht auf, weil Browser localhost als sicheren Kontext behandeln.
     *
     * Sobald ein HTTPS-Zugang davorsteht, schaltet sich das Flag von selbst
     * scharf.
     */
    secure: isSecureRequest(request),
  };
}

export { SESSION_COOKIE };
