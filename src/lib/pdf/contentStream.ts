import {
  PDFArray,
  PDFDocument,
  PDFName,
  PDFPage,
  PDFRawStream,
  PDFStream,
  decodePDFRawStream,
} from "pdf-lib";

/**
 * Entfernt Originaltext aus dem Inhaltsstrom einer Seite.
 *
 * WARUM DAS NÖTIG IST
 * Ein weisses Rechteck über den Text zu malen verdeckt ihn nur optisch. Die
 * Zeichenbefehle bleiben im Dokument: Markieren, Kopieren, Suchen und jedes
 * Extraktionswerkzeug fördern den alten Text weiterhin zutage. Wer einen Preis
 * von 500 auf 400 ändert, verschickt sonst ein Dokument, in dem die 500 noch
 * steht. Für "Text löschen" wäre das schlicht falsch.
 *
 * WIE ES FUNKTIONIERT
 * Der Inhaltsstrom einer PDF-Seite ist eine Folge von Zeichenbefehlen in
 * Postfix-Notation ("100 700 Td (Hallo) Tj"). Dieser Code liest den Strom
 * durch, führt dabei die Textmatrix mit und findet so heraus, an welcher
 * Stelle im Dokument jeder Textbefehl zeichnet. Passt die Position zu einer
 * gesuchten, wird nur der Zeichenketten-Operand auf leer gesetzt — alle
 * übrigen Bytes bleiben unangetastet. Das hält den Eingriff minimal.
 *
 * WO DIE GRENZE LIEGT
 * Nach einem Textbefehl rückt die Schreibmarke um die Breite des Geschriebenen
 * weiter. Diese Breite hängt von den Metriken der eingebetteten Schrift ab, die
 * hier nicht vorliegen. Deshalb gilt die Position nach jedem Textbefehl als
 * unsicher, bis der Strom sie wieder explizit setzt; unsichere Befehle werden
 * nie angefasst. Lieber bleibt etwas stehen (und wird nur übermalt), als dass
 * an der falschen Stelle gelöscht wird.
 */

type Matrix = [number, number, number, number, number, number];

const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

/** Matrixprodukt in PDF-Konvention (Zeilenvektoren, m1 wird zuerst angewandt). */
function multiply(m1: Matrix, m2: Matrix): Matrix {
  return [
    m1[0] * m2[0] + m1[1] * m2[2],
    m1[0] * m2[1] + m1[1] * m2[3],
    m1[2] * m2[0] + m1[3] * m2[2],
    m1[2] * m2[1] + m1[3] * m2[3],
    m1[4] * m2[0] + m1[5] * m2[2] + m2[4],
    m1[4] * m2[1] + m1[5] * m2[3] + m2[5],
  ];
}

function translation(tx: number, ty: number): Matrix {
  return [1, 0, 0, 1, tx, ty];
}

/* ---------- Zerlegung in Token ---------- */

const enum TokenType {
  Number,
  String,
  Name,
  ArrayStart,
  ArrayEnd,
  Other,
  Operator,
}

interface Token {
  type: TokenType;
  start: number;
  end: number;
  value: string;
}

const WHITESPACE = new Set([0x00, 0x09, 0x0a, 0x0c, 0x0d, 0x20]);
const DELIMITERS = new Set([0x28, 0x29, 0x3c, 0x3e, 0x5b, 0x5d, 0x7b, 0x7d, 0x2f, 0x25]);

function isRegular(byte: number): boolean {
  return !WHITESPACE.has(byte) && !DELIMITERS.has(byte);
}

/**
 * Zerlegt einen Inhaltsstrom in Token. Bewusst nur so genau, wie es für das
 * Mitführen der Textmatrix nötig ist — es ist kein vollständiger PDF-Parser.
 */
function tokenize(bytes: Uint8Array): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < bytes.length) {
    const byte = bytes[i];

    if (WHITESPACE.has(byte)) {
      i++;
      continue;
    }

    // Kommentar bis Zeilenende
    if (byte === 0x25) {
      while (i < bytes.length && bytes[i] !== 0x0a && bytes[i] !== 0x0d) i++;
      continue;
    }

    // Zeichenkette in runden Klammern, mit Verschachtelung und Escapes
    if (byte === 0x28) {
      const start = i;
      let depth = 0;
      while (i < bytes.length) {
        const current = bytes[i];
        if (current === 0x5c) {
          i += 2; // Escape-Sequenz überspringen
          continue;
        }
        if (current === 0x28) depth++;
        if (current === 0x29) {
          depth--;
          if (depth === 0) {
            i++;
            break;
          }
        }
        i++;
      }
      tokens.push({ type: TokenType.String, start, end: i, value: "" });
      continue;
    }

    // Hex-Zeichenkette oder Wörterbuch-Klammer
    if (byte === 0x3c) {
      if (bytes[i + 1] === 0x3c) {
        tokens.push({ type: TokenType.Other, start: i, end: i + 2, value: "<<" });
        i += 2;
        continue;
      }
      const start = i;
      while (i < bytes.length && bytes[i] !== 0x3e) i++;
      i++;
      tokens.push({ type: TokenType.String, start, end: i, value: "" });
      continue;
    }

    if (byte === 0x3e && bytes[i + 1] === 0x3e) {
      tokens.push({ type: TokenType.Other, start: i, end: i + 2, value: ">>" });
      i += 2;
      continue;
    }

    if (byte === 0x5b) {
      tokens.push({ type: TokenType.ArrayStart, start: i, end: i + 1, value: "[" });
      i++;
      continue;
    }

    if (byte === 0x5d) {
      tokens.push({ type: TokenType.ArrayEnd, start: i, end: i + 1, value: "]" });
      i++;
      continue;
    }

    // Name
    if (byte === 0x2f) {
      const start = i;
      i++;
      while (i < bytes.length && isRegular(bytes[i])) i++;
      tokens.push({ type: TokenType.Name, start, end: i, value: "" });
      continue;
    }

    // Zahl oder Operator
    const start = i;
    while (i < bytes.length && isRegular(bytes[i])) i++;
    if (i === start) {
      // Unbekanntes Trennzeichen — einzeln überspringen, nicht steckenbleiben.
      i++;
      continue;
    }
    const text = String.fromCharCode(...bytes.subarray(start, i));
    const isNumber = /^[+-]?(\d+\.?\d*|\.\d+)$/.test(text);
    tokens.push({
      type: isNumber ? TokenType.Number : TokenType.Operator,
      start,
      end: i,
      value: text,
    });
  }

  return tokens;
}

/* ---------- Textbefehle finden ---------- */

export interface TextTarget {
  /** Basislinien-Startpunkt in PDF-Koordinaten, wie ihn pdf.js meldet. */
  x: number;
  y: number;
}

interface ShowOperation {
  /** Bytebereich des Operanden (Zeichenkette oder Array), der geleert wird. */
  operandStart: number;
  operandEnd: number;
  /** true bei TJ — dort muss ein leeres Array statt einer leeren Zeichenkette stehen. */
  isArray: boolean;
  x: number;
  y: number;
}

/**
 * Läuft den Strom durch und sammelt alle Textbefehle, deren Position sicher
 * bestimmbar ist.
 */
function collectShowOperations(bytes: Uint8Array): ShowOperation[] {
  const tokens = tokenize(bytes);
  const operations: ShowOperation[] = [];

  const ctmStack: Matrix[] = [];
  let ctm: Matrix = [...IDENTITY];
  let textMatrix: Matrix = [...IDENTITY];
  let lineMatrix: Matrix = [...IDENTITY];
  let leading = 0;
  // Nach einem Textbefehl rückt die Schreibmarke um die unbekannte Textbreite
  // weiter. Ab da ist die Position unsicher, bis sie neu gesetzt wird.
  let positionKnown = false;

  // Operanden seit dem letzten Operator, für den Zugriff auf ihre Werte.
  let operands: Token[] = [];
  let arrayDepth = 0;
  let arrayStart = -1;

  const numeric = (index: number): number => {
    const token = operands[operands.length + index];
    return token && token.type === TokenType.Number ? Number(token.value) : 0;
  };

  for (const token of tokens) {
    if (token.type === TokenType.ArrayStart) {
      if (arrayDepth === 0) arrayStart = token.start;
      arrayDepth++;
      operands.push(token);
      continue;
    }
    if (token.type === TokenType.ArrayEnd) {
      arrayDepth = Math.max(0, arrayDepth - 1);
      operands.push(token);
      continue;
    }
    if (token.type !== TokenType.Operator) {
      operands.push(token);
      continue;
    }

    switch (token.value) {
      case "q":
        ctmStack.push([...ctm] as Matrix);
        break;
      case "Q": {
        const restored = ctmStack.pop();
        if (restored) ctm = restored;
        break;
      }
      case "cm":
        ctm = multiply(
          [numeric(-6), numeric(-5), numeric(-4), numeric(-3), numeric(-2), numeric(-1)],
          ctm,
        );
        break;

      case "BT":
        textMatrix = [...IDENTITY];
        lineMatrix = [...IDENTITY];
        positionKnown = true;
        break;
      case "ET":
        positionKnown = false;
        break;

      case "Tm":
        lineMatrix = [numeric(-6), numeric(-5), numeric(-4), numeric(-3), numeric(-2), numeric(-1)];
        textMatrix = [...lineMatrix] as Matrix;
        positionKnown = true;
        break;
      case "Td":
        lineMatrix = multiply(translation(numeric(-2), numeric(-1)), lineMatrix);
        textMatrix = [...lineMatrix] as Matrix;
        positionKnown = true;
        break;
      case "TD":
        leading = -numeric(-1);
        lineMatrix = multiply(translation(numeric(-2), numeric(-1)), lineMatrix);
        textMatrix = [...lineMatrix] as Matrix;
        positionKnown = true;
        break;
      case "TL":
        leading = numeric(-1);
        break;
      case "T*":
        lineMatrix = multiply(translation(0, -leading), lineMatrix);
        textMatrix = [...lineMatrix] as Matrix;
        positionKnown = true;
        break;

      case "Tj":
      case "TJ":
      case "'":
      case '"': {
        // Bei ' und " beginnt implizit eine neue Zeile.
        if (token.value === "'" || token.value === '"') {
          lineMatrix = multiply(translation(0, -leading), lineMatrix);
          textMatrix = [...lineMatrix] as Matrix;
          positionKnown = true;
        }

        const isArray = token.value === "TJ";
        const operand = operands[operands.length - 1];
        const start = isArray ? arrayStart : operand?.start;
        const end = isArray ? operand?.end : operand?.end;

        if (positionKnown && start !== undefined && start >= 0 && end !== undefined) {
          const placed = multiply(textMatrix, ctm);
          operations.push({
            operandStart: start,
            operandEnd: end,
            isArray,
            x: placed[4],
            y: placed[5],
          });
        }

        // Ab hier ist die Position unbekannt (Textbreite fehlt).
        positionKnown = false;
        break;
      }
    }

    operands = [];
    arrayStart = -1;
  }

  return operations;
}

/* ---------- Öffentliche Schnittstelle ---------- */

/** Liest die Inhaltsströme einer Seite als ein zusammenhängendes Byte-Array. */
function readContents(page: PDFPage): Uint8Array | null {
  const contents = page.node.get(PDFName.of("Contents"));
  const resolved = page.node.context.lookup(contents);

  const decodeStream = (stream: unknown): Uint8Array | null => {
    if (stream instanceof PDFRawStream) return decodePDFRawStream(stream).decode();
    if (stream instanceof PDFStream) {
      try {
        return stream.getContents();
      } catch {
        return null;
      }
    }
    return null;
  };

  if (resolved instanceof PDFArray) {
    const parts: Uint8Array[] = [];
    for (let i = 0; i < resolved.size(); i++) {
      const part = decodeStream(page.node.context.lookup(resolved.get(i)));
      if (!part) return null;
      parts.push(part);
      // Trennzeichen: sonst könnte der letzte Operator des einen Teils mit dem
      // ersten Token des nächsten verschmelzen.
      parts.push(new Uint8Array([0x0a]));
    }
    const total = parts.reduce((sum, part) => sum + part.length, 0);
    const merged = new Uint8Array(total);
    let offset = 0;
    for (const part of parts) {
      merged.set(part, offset);
      offset += part.length;
    }
    return merged;
  }

  return decodeStream(resolved);
}

export interface RemovalOutcome {
  /** Wieviele der gesuchten Textstellen tatsächlich entfernt wurden. */
  removed: number;
  /** Wieviele nicht sicher zuzuordnen waren und nur übermalt werden. */
  skipped: number;
}

/**
 * Entfernt an den angegebenen Positionen den Originaltext einer Seite.
 * Verändert das Dokument nur, wenn mindestens eine Stelle eindeutig zugeordnet
 * werden konnte.
 */
export function removeTextAtPositions(
  doc: PDFDocument,
  pageIndex: number,
  targets: TextTarget[],
  tolerance = 1.5,
): RemovalOutcome {
  const page = doc.getPages()[pageIndex];
  if (!page || targets.length === 0) return { removed: 0, skipped: targets.length };

  const bytes = readContents(page);
  if (!bytes) return { removed: 0, skipped: targets.length };

  let operations: ShowOperation[];
  try {
    operations = collectShowOperations(bytes);
  } catch {
    // Ein unerwarteter Strom darf nicht die ganze Bearbeitung scheitern lassen.
    return { removed: 0, skipped: targets.length };
  }

  const ranges: Array<{ start: number; end: number; isArray: boolean }> = [];
  let removed = 0;
  let skipped = 0;

  for (const target of targets) {
    const matches = operations.filter(
      (operation) =>
        Math.abs(operation.x - target.x) <= tolerance &&
        Math.abs(operation.y - target.y) <= tolerance,
    );

    // Genau ein Treffer heisst eindeutig. Mehrere Treffer wären Raten — dann
    // lieber nur übermalen.
    if (matches.length === 1) {
      ranges.push({
        start: matches[0].operandStart,
        end: matches[0].operandEnd,
        isArray: matches[0].isArray,
      });
      removed++;
    } else {
      skipped++;
    }
  }

  if (ranges.length === 0) return { removed: 0, skipped };

  // Operanden leeren und den Strom neu zusammensetzen. Alles ausserhalb der
  // ersetzten Bereiche bleibt Byte für Byte erhalten.
  ranges.sort((a, b) => a.start - b.start);
  const pieces: Uint8Array[] = [];
  let cursor = 0;
  const encoder = new TextEncoder();

  for (const range of ranges) {
    if (range.start < cursor) continue; // Überlappung: überspringen.
    pieces.push(bytes.subarray(cursor, range.start));
    pieces.push(encoder.encode(range.isArray ? "[]" : "()"));
    cursor = range.end;
  }
  pieces.push(bytes.subarray(cursor));

  const total = pieces.reduce((sum, piece) => sum + piece.length, 0);
  const rewritten = new Uint8Array(total);
  let offset = 0;
  for (const piece of pieces) {
    rewritten.set(piece, offset);
    offset += piece.length;
  }

  const stream = page.node.context.flateStream(rewritten);
  page.node.set(PDFName.of("Contents"), page.node.context.register(stream));

  return { removed, skipped };
}
