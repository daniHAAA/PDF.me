import { NextResponse } from "next/server";
import { probeLibreOffice } from "@/lib/convert/libreoffice";
import { hasPdf2docx } from "@/lib/convert/pdfToDocx";

export const runtime = "nodejs";

/**
 * Meldet der Oberfläche, welche optionalen Werkzeuge vorhanden sind.
 * So kann die UI Funktionen ausgrauen und die Installationshinweise direkt
 * anzeigen, statt den Nutzer in einen Fehler laufen zu lassen.
 */
export async function GET() {
  const [libreOffice, pdf2docx] = await Promise.all([probeLibreOffice(), hasPdf2docx()]);
  return NextResponse.json(
    { libreOffice: libreOffice.available, libreOfficeReason: libreOffice.reason, pdf2docx },
    { headers: { "Cache-Control": "no-store" } },
  );
}
