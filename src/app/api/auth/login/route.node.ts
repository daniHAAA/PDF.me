import { NextResponse } from "next/server";
import { createSessionToken, passwordMatches, sessionCookieOptions } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let password = "";
  try {
    const body = (await request.json()) as { password?: string };
    password = body.password ?? "";
  } catch {
    return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
  }

  if (!passwordMatches(password)) {
    // Bewusst kurze Verzögerung: bremst automatisiertes Durchprobieren spürbar,
    // ohne dass ein Mensch beim Tippen etwas merkt.
    await new Promise((resolve) => setTimeout(resolve, 400));
    return NextResponse.json({ error: "Falsches Passwort." }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set({ ...sessionCookieOptions(request), value: await createSessionToken() });
  return response;
}
