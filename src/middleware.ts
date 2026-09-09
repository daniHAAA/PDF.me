import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

/**
 * Zugangsschutz für die gesamte App.
 *
 * Die Middleware läuft in der Edge-Runtime, deshalb wird hier bewusst NICHT
 * aus lib/auth.ts importiert (das nutzt node:crypto). jose läuft überall.
 */

const PUBLIC_PATHS = ["/login", "/api/auth/login"];
const SESSION_COOKIE = "pdfme_session";

async function hasValidSession(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) return false;
  try {
    await jwtVerify(token, new TextEncoder().encode(secret), { algorithms: ["HS256"] });
    return true;
  } catch {
    return false;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.next();
  }

  if (await hasValidSession(request.cookies.get(SESSION_COOKIE)?.value)) {
    return NextResponse.next();
  }

  // API-Aufrufe bekommen 401 statt eines Redirects, damit fetch() im Client
  // den Fehler sauber unterscheiden kann.
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }

  const loginUrl = new URL("/login", request.url);
  if (pathname !== "/") loginUrl.searchParams.set("next", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  // Statische Assets und Next-Interna bleiben aussen vor.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|svg|ico|webmanifest)$).*)"],
};
