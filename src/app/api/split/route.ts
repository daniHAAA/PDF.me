import JSZip from "jszip";
import { splitIntoSinglePages, splitPdf, type SplitRange } from "@/lib/pdf/operations";
import { BadRequestError, errorResponse, fileResponse, readJson, readUpload } from "@/lib/http";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = await readUpload(form, "file");
    if (!file) throw new BadRequestError("Keine Datei übergeben.");

    const mode = form.get("mode");
    const ranges = readJson<SplitRange[]>(form, "ranges", []);

    const parts =
      mode === "single"
        ? await splitIntoSinglePages(file)
        : await splitPdf(file, ranges);

    // Ein Teil → direkt als PDF. Mehrere → als ZIP, damit der Browser nicht
    // mehrere Downloads gleichzeitig auslösen muss.
    if (parts.length === 1) {
      return fileResponse(parts[0].bytes, `${parts[0].label}.pdf`, "application/pdf");
    }

    const zip = new JSZip();
    parts.forEach((part, index) => {
      // Index voranstellen, damit die Reihenfolge im Dateimanager stimmt.
      const prefix = String(index + 1).padStart(String(parts.length).length, "0");
      zip.file(`${prefix}_${part.label}.pdf`, part.bytes);
    });
    const archive = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });

    return fileResponse(archive, "geteilt.zip", "application/zip");
  } catch (error) {
    return errorResponse(error);
  }
}
