import {
  AlignmentType,
  Document,
  Packer,
  Paragraph,
  TextRun,
  convertInchesToTwip,
} from "docx";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { extractPages, type ExtractedItem, type ExtractedPage } from "./extract";

const run = promisify(execFile);

/**
 * PDF → Word.
 *
 * Das ist die schwierigste Richtung: ein PDF beschreibt nur, wo Glyphen stehen.
 * Absätze, Überschriften und Tabellen existieren dort gar nicht als Struktur —
 * sie müssen aus den Positionen zurückgerechnet werden.
 *
 * Deshalb zwei Wege:
 *  1. pdf2docx (Python) rekonstruiert auch Tabellen und Textrahmen. Beste
 *     Layouttreue, muss aber separat installiert werden.
 *  2. Eingebauter Fallback: gruppiert Fragmente zu Zeilen und Absätzen und
 *     überträgt Schriftgrösse, Fett/Kursiv und Ausrichtung. Läuft ohne
 *     Zusatzinstallation, gibt Tabellen aber als reinen Text zurück.
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

/* ---------- Eingebauter Fallback ---------- */

interface Line {
  items: ExtractedItem[];
  /** Basislinie der Zeile. */
  y: number;
  left: number;
  right: number;
  fontSize: number;
}

/**
 * Fasst Fragmente zu Zeilen zusammen.
 * Kriterium: nahezu gleiche Basislinie (Toleranz relativ zur Schriftgrösse,
 * damit hochgestellte Zeichen nicht jedes Mal eine neue Zeile auslösen).
 */
function groupIntoLines(items: ExtractedItem[]): Line[] {
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: Line[] = [];

  for (const item of sorted) {
    const tolerance = Math.max(1.5, item.fontSize * 0.45);
    const current = lines[lines.length - 1];

    if (current && Math.abs(current.y - item.y) <= tolerance) {
      current.items.push(item);
      current.left = Math.min(current.left, item.x);
      current.right = Math.max(current.right, item.x + item.width);
      current.fontSize = Math.max(current.fontSize, item.fontSize);
    } else {
      lines.push({
        items: [item],
        y: item.y,
        left: item.x,
        right: item.x + item.width,
        fontSize: item.fontSize,
      });
    }
  }

  for (const line of lines) line.items.sort((a, b) => a.x - b.x);
  return lines;
}

/**
 * Setzt eine Zeile aus ihren Fragmenten zusammen und ergänzt Leerzeichen dort,
 * wo im PDF eine sichtbare Lücke ist. PDF-Erzeuger zerlegen Wörter oft in viele
 * Fragmente ohne jedes Leerzeichen — ohne diese Korrektur klebtallesaneinander.
 */
function buildRuns(line: Line): TextRun[] {
  const runs: TextRun[] = [];
  let previous: ExtractedItem | null = null;

  for (const item of line.items) {
    let text = item.text;
    if (previous) {
      const gap = item.x - (previous.x + previous.width);
      const spaceWidth = previous.fontSize * 0.25;
      if (gap > spaceWidth && !/\s$/.test(previous.text) && !/^\s/.test(text)) {
        text = ` ${text}`;
      }
    }

    runs.push(
      new TextRun({
        text,
        bold: item.bold,
        italics: item.italic,
        // docx misst in halben Punkten.
        size: Math.round(item.fontSize * 2),
        font:
          item.fontFamily === "serif"
            ? "Times New Roman"
            : item.fontFamily === "mono"
              ? "Courier New"
              : "Calibri",
      }),
    );
    previous = item;
  }

  return runs;
}

function guessAlignment(line: Line, pageWidth: number): (typeof AlignmentType)[keyof typeof AlignmentType] {
  const leftMargin = line.left;
  const rightMargin = pageWidth - line.right;
  const width = line.right - line.left;

  // Zentriert: beide Ränder ähnlich gross und die Zeile füllt nicht die Breite.
  if (Math.abs(leftMargin - rightMargin) < pageWidth * 0.04 && width < pageWidth * 0.75) {
    return AlignmentType.CENTER;
  }
  // Rechtsbündig: deutlich mehr Platz links als rechts.
  if (leftMargin > pageWidth * 0.45 && rightMargin < pageWidth * 0.12) {
    return AlignmentType.RIGHT;
  }
  return AlignmentType.LEFT;
}

function pageToParagraphs(page: ExtractedPage): Paragraph[] {
  const lines = groupIntoLines(page.items);
  const paragraphs: Paragraph[] = [];

  lines.forEach((line, index) => {
    const previous = lines[index - 1];
    // Abstand zur Vorzeile: deutlich mehr als eine Zeilenhöhe deutet auf einen
    // Absatzwechsel hin und wird als Abstand vor dem Absatz übernommen.
    const gap = previous ? previous.y - line.y - line.fontSize : 0;
    const spacingBefore = gap > line.fontSize * 0.6 ? Math.round(gap * 20) : 0;

    paragraphs.push(
      new Paragraph({
        children: buildRuns(line),
        alignment: guessAlignment(line, page.width),
        spacing: { before: spacingBefore, after: 0, line: Math.round(line.fontSize * 1.15 * 20) },
        indent:
          line.left > page.width * 0.1
            ? { left: Math.round((line.left - page.width * 0.08) * 20) }
            : undefined,
      }),
    );
  });

  if (paragraphs.length === 0) {
    paragraphs.push(new Paragraph({ children: [new TextRun({ text: "" })] }));
  }
  return paragraphs;
}

async function convertWithFallback(bytes: Uint8Array): Promise<Uint8Array> {
  const pages = await extractPages(bytes);
  if (pages.length === 0) throw new Error("Das PDF enthält keine Seiten.");

  const document = new Document({
    sections: pages.map((page) => ({
      properties: {
        page: {
          size: {
            // PDF rechnet in Punkt, docx in Twips (1 pt = 20 Twips).
            width: Math.round(page.width * 20),
            height: Math.round(page.height * 20),
          },
          margin: {
            top: convertInchesToTwip(0.6),
            bottom: convertInchesToTwip(0.6),
            left: convertInchesToTwip(0.6),
            right: convertInchesToTwip(0.6),
          },
        },
      },
      children: pageToParagraphs(page),
    })),
  });

  const buffer = await Packer.toBuffer(document);
  return new Uint8Array(buffer);
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

  const result = await convertWithFallback(bytes);
  return {
    bytes: result,
    engine: "eingebaut",
    warning:
      "Konvertiert mit dem eingebauten Konverter: Text, Schriftgrössen und Ausrichtung " +
      "bleiben erhalten, Tabellen und Bilder werden nicht als solche übernommen. " +
      "Für höhere Layouttreue: pip install pdf2docx",
  };
}
