import { LibreOfficeMissingError, docxToPdf } from "@/lib/convert/libreoffice";
import { BadRequestError, errorResponse, fileResponse, readUpload } from "@/lib/http";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = await readUpload(form, "file");
    if (!file) throw new BadRequestError("Keine Datei übergeben.");

    const name = (form.get("filename") as string | null) ?? "dokument.docx";
    const pdf = await docxToPdf(file);
    return fileResponse(pdf, name.replace(/\.docx?$/i, "") + ".pdf", "application/pdf");
  } catch (error) {
    if (error instanceof LibreOfficeMissingError) {
      // 501: die Anfrage war korrekt, dem Server fehlt schlicht die Fähigkeit.
      return NextResponse.json({ error: error.message }, { status: 501 });
    }
    return errorResponse(error);
  }
}
