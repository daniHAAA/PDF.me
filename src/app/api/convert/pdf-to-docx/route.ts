import { pdfToDocx } from "@/lib/convert/pdfToDocx";
import { BadRequestError, errorResponse, fileResponse, readUpload } from "@/lib/http";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = await readUpload(form, "file");
    if (!file) throw new BadRequestError("Keine Datei übergeben.");

    const name = (form.get("filename") as string | null) ?? "dokument.pdf";
    const { bytes, engine, warning } = await pdfToDocx(file);

    return fileResponse(
      bytes,
      name.replace(/\.pdf$/i, "") + ".docx",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      // Die UI liest diese Header aus, um auf die Qualitätsgrenze hinzuweisen.
      {
        "X-Convert-Engine": engine,
        ...(warning ? { "X-Convert-Warning": encodeURIComponent(warning) } : {}),
      },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
