import { execFile } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

/**
 * DOCX → PDF über LibreOffice im Headless-Modus.
 *
 * Warum LibreOffice und keine JS-Bibliothek? Ein .docx layoutgetreu zu rendern
 * heisst, Word-Layout nachzubauen: Tabellen, Kopf-/Fusszeilen, Abschnitte,
 * Schriftmetriken, Seitenumbrüche. LibreOffice hat dafür eine ausgereifte
 * Engine; die JS-Alternativen liefern nur grobe Näherungen.
 *
 * Kosten dieser Entscheidung: LibreOffice muss auf dem Rechner installiert sein.
 */

export class LibreOfficeMissingError extends Error {
  constructor() {
    super(
      "LibreOffice wurde nicht gefunden. Installiere es, um Word-Dateien zu konvertieren:\n" +
        "  macOS:  brew install --cask libreoffice\n" +
        "  Ubuntu: sudo apt install libreoffice\n" +
        "  Windows: https://www.libreoffice.org/download/",
    );
    this.name = "LibreOfficeMissingError";
  }
}

const BINARY_CANDIDATES = [
  process.env.SOFFICE_PATH,
  "soffice",
  "libreoffice",
  "/Applications/LibreOffice.app/Contents/MacOS/soffice",
  "C:\\Program Files\\LibreOffice\\program\\soffice.exe",
].filter((c): c is string => Boolean(c));

let resolvedBinary: string | null = null;

export async function findLibreOffice(): Promise<string | null> {
  if (resolvedBinary) return resolvedBinary;
  for (const candidate of BINARY_CANDIDATES) {
    try {
      await run(candidate, ["--version"], { timeout: 20_000 });
      resolvedBinary = candidate;
      return candidate;
    } catch {
      // Nächsten Kandidaten probieren.
    }
  }
  return null;
}

/**
 * Konvertiert einen Puffer in ein Zielformat und gibt das Ergebnis zurück.
 * Arbeitet in einem eigenen Temp-Verzeichnis, das danach restlos gelöscht wird.
 */
/**
 * Prüft, ob LibreOffice tatsächlich konvertieren KANN — nicht nur, ob das
 * Programm existiert.
 *
 * Der Unterschied ist real: eine Minimalinstallation bringt zwar soffice mit,
 * aber ohne die Writer-Komponente fehlt der Filter für Textdokumente.
 * "soffice --version" antwortet dann fröhlich, und erst die Konvertierung
 * scheitert mit "source file could not be loaded". Deshalb hier eine echte
 * Mini-Konvertierung. Das Ergebnis wird für die Prozesslaufzeit gemerkt.
 */
let probeResult: { available: boolean; reason?: string } | null = null;

export async function probeLibreOffice(): Promise<{ available: boolean; reason?: string }> {
  if (probeResult) return probeResult;

  const binary = await findLibreOffice();
  if (!binary) {
    probeResult = { available: false, reason: "LibreOffice ist nicht installiert." };
    return probeResult;
  }

  const workdir = await mkdtemp(join(tmpdir(), "pdfme-probe-"));
  try {
    const inputPath = join(workdir, "probe.txt");
    await writeFile(inputPath, "probe");
    await run(
      binary,
      [
        "--headless",
        "--norestore",
        "--nolockcheck",
        `-env:UserInstallation=file://${join(workdir, "profile")}`,
        "--convert-to",
        "pdf",
        "--outdir",
        workdir,
        inputPath,
      ],
      { timeout: 120_000, maxBuffer: 8 * 1024 * 1024 },
    );
    const produced = (await readdir(workdir)).some((name) => name.endsWith(".pdf"));
    probeResult = produced
      ? { available: true }
      : { available: false, reason: WRITER_MISSING_HINT };
  } catch {
    probeResult = { available: false, reason: WRITER_MISSING_HINT };
  } finally {
    await rm(workdir, { recursive: true, force: true });
  }

  return probeResult;
}

const WRITER_MISSING_HINT =
  "LibreOffice ist zwar vorhanden, kann aber keine Textdokumente laden — meist fehlt die " +
  "Writer-Komponente.\n  Ubuntu/Debian: sudo apt install libreoffice-writer\n" +
  "  macOS/Windows: die vollständige LibreOffice-Installation von libreoffice.org verwenden.";

export async function convertWithLibreOffice(
  input: Uint8Array,
  inputFilename: string,
  targetFormat: "pdf" | "docx",
): Promise<Uint8Array> {
  const binary = await findLibreOffice();
  if (!binary) throw new LibreOfficeMissingError();

  const workdir = await mkdtemp(join(tmpdir(), "pdfme-"));
  try {
    const inputPath = join(workdir, inputFilename);
    await writeFile(inputPath, input);

    /*
     * -env:UserInstallation zwingt LibreOffice in ein eigenes Profil pro Aufruf.
     * Ohne das teilen sich parallele Konvertierungen ein Profil und blockieren
     * sich gegenseitig ("another instance is running") — bei einer Web-App mit
     * mehreren gleichzeitigen Nutzern ein sicherer Weg in Timeouts.
     */
    await run(
      binary,
      [
        "--headless",
        "--norestore",
        "--nolockcheck",
        `-env:UserInstallation=file://${join(workdir, "profile")}`,
        "--convert-to",
        targetFormat,
        "--outdir",
        workdir,
        inputPath,
      ],
      { timeout: 180_000, maxBuffer: 32 * 1024 * 1024 },
    );

    const produced = (await readdir(workdir)).find((name) => name.endsWith(`.${targetFormat}`));
    if (!produced) {
      // Zwei plausible Ursachen — beide nennen, statt zu raten.
      throw new Error(
        `LibreOffice hat keine ${targetFormat.toUpperCase()}-Datei erzeugt.\n` +
          "Entweder ist die Eingabedatei beschädigt oder passwortgeschützt, oder es fehlt " +
          "die Writer-Komponente.\n  Ubuntu/Debian: sudo apt install libreoffice-writer",
      );
    }

    return new Uint8Array(await readFile(join(workdir, produced)));
  } finally {
    // Aufräumen in jedem Fall — die App speichert bewusst nichts dauerhaft.
    await rm(workdir, { recursive: true, force: true });
  }
}

export async function docxToPdf(docx: Uint8Array): Promise<Uint8Array> {
  return convertWithLibreOffice(docx, "eingabe.docx", "pdf");
}
