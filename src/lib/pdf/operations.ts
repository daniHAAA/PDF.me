import { PDFDocument, PDFPage, degrees, rgb } from "pdf-lib";
import { FontCache, sanitizeForWinAnsi } from "./fonts";
import { removeTextAtPositions } from "./contentStream";
import { InputError } from "../errors";
import type { TextExtractor } from "../convert/types";
import type { TextEdit } from "./types";

/**
 * Alle strukturellen PDF-Operationen.
 *
 * Gemeinsames Muster: Bytes rein, Bytes raus. Nichts wird auf Platte
 * geschrieben, nichts zwischengespeichert.
 */

async function load(bytes: Uint8Array): Promise<PDFDocument> {
  // ignoreEncryption erlaubt das Öffnen von PDFs mit leerem Besitzerpasswort —
  // sehr verbreitet bei Dokumenten aus Behörden- oder Bankportalen.
  return PDFDocument.load(bytes, { ignoreEncryption: true });
}

export async function pageCount(bytes: Uint8Array): Promise<number> {
  return (await load(bytes)).getPageCount();
}

/** Fügt mehrere PDFs in der übergebenen Reihenfolge zu einem zusammen. */
export async function mergePdfs(files: Uint8Array[]): Promise<Uint8Array> {
  if (files.length === 0) throw new InputError("Keine Dateien zum Zusammenführen übergeben.");

  const out = await PDFDocument.create();
  for (const bytes of files) {
    const source = await load(bytes);
    // copyPages überträgt Seiten samt Ressourcen (Fonts, Bilder) ins Zieldokument.
    const copied = await out.copyPages(source, source.getPageIndices());
    for (const page of copied) out.addPage(page);
  }
  return out.save();
}

export interface SplitRange {
  /** 1-basiert und inklusive — so, wie Menschen Seitenbereiche angeben. */
  from: number;
  to: number;
  label?: string;
}

export interface SplitResult {
  label: string;
  bytes: Uint8Array;
}

/** Zerlegt ein PDF in mehrere Dokumente anhand von Seitenbereichen. */
export async function splitPdf(bytes: Uint8Array, ranges: SplitRange[]): Promise<SplitResult[]> {
  const source = await load(bytes);
  const total = source.getPageCount();
  if (ranges.length === 0) throw new InputError("Keine Seitenbereiche angegeben.");

  const results: SplitResult[] = [];
  for (const range of ranges) {
    const from = Math.max(1, Math.floor(range.from));
    const to = Math.min(total, Math.floor(range.to));
    if (from > to) {
      throw new InputError(
        `Ungültiger Bereich ${range.from}-${range.to} (Dokument hat ${total} Seiten).`,
      );
    }

    const out = await PDFDocument.create();
    const indices = Array.from({ length: to - from + 1 }, (_, i) => from - 1 + i);
    const copied = await out.copyPages(source, indices);
    for (const page of copied) out.addPage(page);

    results.push({
      label: range.label ?? (from === to ? `Seite-${from}` : `Seiten-${from}-${to}`),
      bytes: await out.save(),
    });
  }
  return results;
}

/** Zerlegt ein PDF in Einzelseiten. */
export async function splitIntoSinglePages(bytes: Uint8Array): Promise<SplitResult[]> {
  const total = await pageCount(bytes);
  const ranges = Array.from({ length: total }, (_, i) => ({ from: i + 1, to: i + 1 }));
  return splitPdf(bytes, ranges);
}

/**
 * Eine Seite in der Zielreihenfolge.
 * sourceIndex verweist auf die Position in der Liste der hochgeladenen Dateien —
 * so lassen sich in einem Durchgang Seiten aus mehreren PDFs mischen.
 */
export interface PageSpec {
  sourceIndex: number;
  /** 0-basierter Seitenindex innerhalb der Quelldatei. */
  pageIndex: number;
  /** Zusätzliche Drehung in Grad (0, 90, 180, 270). */
  rotation?: number;
}

/**
 * Baut ein PDF neu auf. Umsortieren, Drehen, Löschen und Einfügen aus anderen
 * Dateien sind derselbe Vorgang: die Zielliste beschreibt schlicht das Ergebnis.
 * Gelöschte Seiten sind einfach die, die nicht in der Liste stehen.
 */
export async function organizePages(
  sources: Uint8Array[],
  pages: PageSpec[],
): Promise<Uint8Array> {
  if (pages.length === 0) throw new InputError("Das Ergebnis hätte keine Seiten.");

  const loaded = await Promise.all(sources.map(load));
  const out = await PDFDocument.create();

  for (const spec of pages) {
    const source = loaded[spec.sourceIndex];
    if (!source) throw new InputError(`Quelldatei ${spec.sourceIndex + 1} fehlt.`);
    if (spec.pageIndex < 0 || spec.pageIndex >= source.getPageCount()) {
      throw new InputError(
        `Seite ${spec.pageIndex + 1} existiert nicht in Datei ${spec.sourceIndex + 1}.`,
      );
    }
  }

  // Pro Quelldatei ein einziger copyPages-Aufruf: der Aufruf durchläuft den
  // Objektgraphen der Quelle und ist entsprechend teuer. Doppelt angeforderte
  // Seiten liefert pdf-lib als eigenständige Seitenobjekte zurück (geprüft),
  // dieselbe Seite kann also mehrfach mit unterschiedlicher Drehung vorkommen.
  const bySource = new Map<number, Array<{ target: number; pageIndex: number }>>();
  pages.forEach((spec, target) => {
    const list = bySource.get(spec.sourceIndex) ?? [];
    list.push({ target, pageIndex: spec.pageIndex });
    bySource.set(spec.sourceIndex, list);
  });

  const copiedByTarget: PDFPage[] = new Array(pages.length);
  for (const [sourceIndex, entries] of bySource) {
    const copied = await out.copyPages(
      loaded[sourceIndex],
      entries.map((e) => e.pageIndex),
    );
    entries.forEach((entry, i) => {
      copiedByTarget[entry.target] = copied[i];
    });
  }

  // Erst jetzt in Zielreihenfolge einhängen und drehen.
  pages.forEach((spec, target) => {
    const added = out.addPage(copiedByTarget[target]);
    if (spec.rotation) {
      const current = added.getRotation().angle;
      added.setRotation(degrees((((current + spec.rotation) % 360) + 360) % 360));
    }
  });

  return out.save();
}

/**
 * Wendet Textänderungen an.
 *
 * Zwei Schritte, die zusammengehören:
 *  1. Den Originaltext aus dem Inhaltsstrom entfernen. Ohne das bliebe er
 *     unter der Abdeckung markierbar, kopierbar und auffindbar.
 *  2. Die Stelle übermalen und den neuen Text zeichnen. Das Übermalen bleibt
 *     auch dann nötig, wenn Schritt 1 gelungen ist: Unterstreichungen, farbige
 *     Hinterlegungen oder gerasterter Text (Scans) verschwinden nicht durch
 *     das Entfernen von Textbefehlen.
 *
 * Schritt 1 kann nicht in jedem Dokument sicher zugeordnet werden. Was übrig
 * bleibt, steht im Ergebnis — und die Rückmeldung sagt es ehrlich.
 */
export interface EditResult {
  bytes: Uint8Array;
  /** Stellen, an denen der Originaltext wirklich aus dem Dokument verschwand. */
  removedOriginals: number;
  /** Stellen, die nur übermalt werden konnten. */
  coveredOnly: number;
}

/** Baut das bearbeitete Dokument. removeOriginals steuert Schritt 1. */
async function buildEdited(
  bytes: Uint8Array,
  edits: TextEdit[],
  removeOriginals: boolean,
): Promise<{ doc: PDFDocument; removed: number; skipped: number }> {
  const doc = await load(bytes);
  const fonts = new FontCache(doc);
  const pages = doc.getPages();

  // Stellen aus der Texterkennung stammen aus einem Bild — dort gibt es keinen
  // Textbefehl, der entfernt werden könnte, und Übermalen ist bereits die
  // vollständige Lösung. Sie zählen deshalb in keiner der beiden Zahlen mit.
  const fromTextLayer = edits.filter((edit) => !edit.fromOcr);

  let removed = 0;
  let skipped = fromTextLayer.length;

  if (removeOriginals && fromTextLayer.length > 0) {
    // Seitenweise, weil jeder Inhaltsstrom nur einmal neu geschrieben wird.
    const byPage = new Map<number, TextEdit[]>();
    for (const edit of fromTextLayer) {
      const list = byPage.get(edit.pageIndex) ?? [];
      list.push(edit);
      byPage.set(edit.pageIndex, list);
    }

    removed = 0;
    skipped = 0;
    for (const [pageIndex, pageEdits] of byPage) {
      const outcome = removeTextAtPositions(
        doc,
        pageIndex,
        pageEdits.map((edit) => ({ x: edit.baseline.x, y: edit.baseline.y })),
      );
      removed += outcome.removed;
      skipped += outcome.skipped;
    }
  }

  for (const edit of edits) {
    const page = pages[edit.pageIndex];
    if (!page) throw new InputError(`Seite ${edit.pageIndex + 1} existiert nicht.`);

    // Original übermalen. Ein Hauch Rand deckt Kantenglättung mit ab.
    // Bei gedrehtem Text muss der Rand entlang der gedrehten Achsen wachsen,
    // nicht entlang x/y — sonst rutscht die Abdeckung schief.
    const angle = ((edit.rotation ?? 0) * Math.PI) / 180;
    const pad = Math.max(0.5, edit.box.height * 0.08);
    const alongX = Math.cos(angle);
    const alongY = Math.sin(angle);
    const acrossX = -Math.sin(angle);
    const acrossY = Math.cos(angle);

    page.drawRectangle({
      x: edit.box.x - pad * alongX - pad * acrossX,
      y: edit.box.y - pad * alongY - pad * acrossY,
      width: edit.box.width + pad * 2,
      height: edit.box.height + pad * 2,
      color: rgb(edit.background.r, edit.background.g, edit.background.b),
      rotate: degrees(edit.rotation ?? 0),
    });

    const text = sanitizeForWinAnsi(edit.text);
    if (!text.trim()) continue; // Nur löschen.

    // Neuen Text zeichnen. Passt er nicht in die Originalbreite, wird die
    // Schrift verkleinert statt über den Rand hinauszulaufen.
    // maxWidth kommt vom Client in Leserichtung gemessen — bei gedrehten
    // Seiten ist das nicht identisch mit box.width.
    const font = await fonts.get(edit.fontFamily, edit.bold, edit.italic);
    const maxWidth = edit.maxWidth ?? edit.box.width;
    let size = edit.fontSize;
    while (size > 4 && font.widthOfTextAtSize(text, size) > maxWidth) {
      size -= 0.25;
    }

    page.drawText(text, {
      x: edit.baseline.x,
      y: edit.baseline.y,
      size,
      font,
      color: rgb(edit.color.r, edit.color.g, edit.color.b),
      // Neuer Text folgt der Richtung des Originals.
      rotate: degrees(edit.rotation ?? 0),
    });
  }

  return { doc, removed, skipped };
}

/**
 * @param extractText Liest Text mit Position aus einem PDF. Wird hereingereicht,
 *   weil pdf.js im Browser und in Node unterschiedlich geladen wird. Fehlt der
 *   Parameter, entfällt die Nachprüfung und es bleibt beim reinen Übermalen —
 *   sicher, aber ohne echtes Entfernen.
 */
export async function applyTextEdits(
  bytes: Uint8Array,
  edits: TextEdit[],
  extractText?: TextExtractor,
): Promise<EditResult> {
  if (!extractText) {
    // Ohne Prüfmöglichkeit wird der Inhaltsstrom nicht angetastet.
    const safe = await buildEdited(bytes, edits, false);
    return {
      bytes: await safe.doc.save(),
      removedOriginals: 0,
      coveredOnly: safe.skipped,
    };
  }

  const attempt = await buildEdited(bytes, edits, true);
  const result = await attempt.doc.save();

  if (attempt.removed === 0) {
    return { bytes: result, removedOriginals: 0, coveredOnly: attempt.skipped };
  }

  // Der Eingriff in den Inhaltsstrom wird überprüft, statt ihm zu vertrauen:
  // Lässt sich das Ergebnis nicht mehr lesen oder steht der alte Text noch da,
  // wird die Fassung ohne Eingriff ausgeliefert. Ein bloss übermaltes PDF ist
  // deutlich besser als ein beschädigtes.
  const verified = await verifyRemoval(result, edits, extractText);
  if (verified) {
    return {
      bytes: result,
      removedOriginals: attempt.removed,
      coveredOnly: attempt.skipped,
    };
  }

  const fallback = await buildEdited(bytes, edits, false);
  return {
    bytes: await fallback.doc.save(),
    removedOriginals: 0,
    coveredOnly: fallback.skipped,
  };
}

/**
 * Prüft am fertigen Dokument, ob der Eingriff sauber war: Das PDF muss
 * lesbar sein und die ersetzten Texte dürfen an ihrer alten Position nicht
 * mehr auftauchen.
 */
async function verifyRemoval(
  result: Uint8Array,
  edits: TextEdit[],
  extractText: TextExtractor,
): Promise<boolean> {
  const withOriginal = edits.filter((edit) => !edit.fromOcr && edit.originalText?.trim());
  if (withOriginal.length === 0) return true;

  try {
    const pages = await extractText(result);

    for (const edit of withOriginal) {
      const page = pages[edit.pageIndex];
      if (!page) return false;

      const original = edit.originalText!.trim();
      const stillThere = page.items.some(
        (item) =>
          item.text.trim() === original &&
          Math.abs(item.x - edit.baseline.x) <= 2 &&
          Math.abs(item.y - edit.baseline.y) <= 2,
      );
      if (stillThere) return false;
    }
    return true;
  } catch {
    // Nicht mehr lesbar — der Eingriff war nicht sicher.
    return false;
  }
}
