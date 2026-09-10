import { mergePdfs } from "@/lib/pdf/operations";
import { errorResponse, fileResponse, readUploads } from "@/lib/http";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const files = await readUploads(form, "files");
    const merged = await mergePdfs(files);
    return fileResponse(merged, "zusammengefuehrt.pdf", "application/pdf");
  } catch (error) {
    return errorResponse(error);
  }
}
