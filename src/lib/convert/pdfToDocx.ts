import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { buildDocxFromPages, FALLBACK_WARNING } from "./docxBuilder";
import { extractPages } from "./extract";

const run = promisify(execFile);

/**
 * PDF → Word auf dem Server.
 *
 * Zwei Wege:
 *  1. pdf2docx (Python) rekonstruiert auch Tabellen und Textrahmen. Beste
 *     Layouttreue, muss aber separat installiert werden.
 *  2. Der eingebaute Konverter (docxBuilder), der auch im Browser läuft.
 */

let pdf2docxAvailable: boolean | null = null;

export async function hasPdf2docx(): Promise<boolean> {
  if (pdf2docxAvailable !== null) return pdf2docxAvailable;
  try {
    await run(process.env.PYTHON_PATH ?? "python3", ["-c", "import pdf2docx"], {
      timeout: 20_000,
    });
    pdf2docxAvailable = true;
  } catch {
    pdf2docxAvailable = false;
  }
  return pdf2docxAvailable;
}

async function convertViaPdf2docx(bytes: Uint8Array): Promise<Uint8Array> {
  const workdir = await mkdtemp(join(tmpdir(), "pdfme-"));
  try {
    const inputPath = join(workdir, "eingabe.pdf");
    const outputPath = join(workdir, "ausgabe.docx");
    await writeFile(inputPath, bytes);

    await run(
      process.env.PYTHON_PATH ?? "python3",
      [
        "-c",
        "import sys;from pdf2docx import Converter;c=Converter(sys.argv[1]);c.convert(sys.argv[2]);c.close()",
        inputPath,
        outputPath,
      ],
      { timeout: 300_000, maxBuffer: 32 * 1024 * 1024 },
    );

    return new Uint8Array(await readFile(outputPath));
  } finally {
    await rm(workdir, { recursive: true, force: true });
  }
}

export interface PdfToDocxResult {
  bytes: Uint8Array;
  /** Welcher Weg genommen wurde — die UI weist auf die Qualitätsgrenze hin. */
  engine: "pdf2docx" | "eingebaut";
  warning?: string;
}

export async function pdfToDocx(bytes: Uint8Array): Promise<PdfToDocxResult> {
  if (await hasPdf2docx()) {
    try {
      return { bytes: await convertViaPdf2docx(bytes), engine: "pdf2docx" };
    } catch {
      // Fällt durch auf den eingebauten Weg, statt die Anfrage scheitern zu lassen.
    }
  }

  return {
    bytes: await buildDocxFromPages(await extractPages(bytes)),
    engine: "eingebaut",
    warning: `${FALLBACK_WARNING} Für höhere Layouttreue: pip install pdf2docx`,
  };
}
