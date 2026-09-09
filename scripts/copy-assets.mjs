/**
 * Kopiert die Laufzeit-Assets von pdf.js und tesseract.js nach public/.
 *
 * Beide Bibliotheken arbeiten in Web Workern und laden zur Laufzeit weitere
 * Dateien nach (Worker-Skript, WebAssembly, Schriftmetriken). Diese müssen
 * unter einer festen URL liegen.
 *
 * Warum lokal statt vom CDN: tesseract.js holt sich seinen Worker
 * standardmässig von jsdelivr. Eine Anwendung, die auf dem eigenen Rechner
 * läuft, wäre damit ohne Internet funktionsunfähig — und in abgeschotteten
 * Netzen schlicht kaputt. Die Dateien liegen ohnehin in node_modules.
 *
 * Der Weg über public/ funktioniert mit Webpack und Turbopack gleichermassen
 * und überlebt Bundler-Updates. Die kopierten Ordner gehören nicht ins
 * Repository (siehe .gitignore) — sie entstehen bei jeder Installation neu.
 */
import { cp, mkdir, access } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);

async function copyAll(packageName, targetDir, assets) {
  const root = dirname(require.resolve(`${packageName}/package.json`));
  const target = join(process.cwd(), "public", targetDir);
  await mkdir(target, { recursive: true });

  for (const [from, to] of assets) {
    const source = join(root, from);
    try {
      await access(source);
    } catch {
      console.warn(`[copy-assets] übersprungen (nicht gefunden): ${packageName}/${from}`);
      continue;
    }
    await cp(source, join(target, to), { recursive: true });
  }
  console.log(`[copy-assets] ${packageName} → public/${targetDir}/`);
}

await copyAll("pdfjs-dist", "pdfjs", [
  // Muss zum legacy-Build passen, den der Client lädt (siehe lib/client/pdfjs.ts).
  ["legacy/build/pdf.worker.min.mjs", "pdf.worker.min.mjs"],
  ["cmaps", "cmaps"],
  ["standard_fonts", "standard_fonts"],
]);

await copyAll("tesseract.js", "tesseract", [["dist/worker.min.js", "worker.min.js"]]);

// tesseract.js sucht sich zur Laufzeit die passende WebAssembly-Variante
// (mit/ohne SIMD) aus, deshalb wird der ganze Ordner übernommen.
await copyAll("tesseract.js-core", "tesseract/core", [[".", "."]]);
