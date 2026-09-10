import { organizePages, type PageSpec } from "@/lib/pdf/operations";
import { BadRequestError, errorResponse, fileResponse, readJson, readUploads } from "@/lib/http";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const sources = await readUploads(form, "files");
    const pages = readJson<PageSpec[]>(form, "pages", []);
    if (pages.length === 0) throw new BadRequestError("Es wurde keine Seitenreihenfolge übergeben.");

    const result = await organizePages(sources, pages);
    return fileResponse(result, "seiten-neu-geordnet.pdf", "application/pdf");
  } catch (error) {
    return errorResponse(error);
  }
}
