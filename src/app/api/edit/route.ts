import { applyTextEdits } from "@/lib/pdf/operations";
import type { TextEdit } from "@/lib/pdf/types";
import { BadRequestError, errorResponse, fileResponse, readJson, readUpload } from "@/lib/http";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = await readUpload(form, "file");
    if (!file) throw new BadRequestError("Keine Datei übergeben.");

    const edits = readJson<TextEdit[]>(form, "edits", []);
    if (edits.length === 0) throw new BadRequestError("Es wurden keine Änderungen übergeben.");

    const { bytes, removedOriginals, coveredOnly } = await applyTextEdits(file, edits);

    // Die Oberfläche liest diese Werte aus und sagt dem Nutzer, ob der alte
    // Text wirklich entfernt oder nur überdeckt werden konnte.
    return fileResponse(bytes, "bearbeitet.pdf", "application/pdf", {
      "X-Edit-Removed": String(removedOriginals),
      "X-Edit-Covered": String(coveredOnly),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
