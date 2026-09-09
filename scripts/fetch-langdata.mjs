/**
 * Lädt die OCR-Sprachdaten für den Offline-Betrieb herunter.
 *
 * Ohne diesen Schritt holt tesseract.js die Daten beim ersten Lauf selbst von
 * einem CDN und legt sie im Browser-Speicher ab — das funktioniert, braucht
 * aber einmal Internet und geht beim Leeren der Browserdaten verloren.
 * Nach diesem Skript liegen sie unter public/tessdata/ und die App kommt
 * vollständig ohne Internetzugang aus.
 *
 *   npm run ocr:offline           # Deutsch und Englisch
 *   npm run ocr:offline -- fra    # zusätzlich Französisch
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const BASE = "https://cdn.jsdelivr.net/npm/@tesseract.js-data";
const languages = process.argv.slice(2).length > 0 ? process.argv.slice(2) : ["deu", "eng"];
const target = join(process.cwd(), "public", "tessdata");

await mkdir(target, { recursive: true });

for (const language of languages) {
  const url = `${BASE}/${language}/4.0.0_best_int/${language}.traineddata.gz`;
  process.stdout.write(`  ${language} … `);
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    await writeFile(join(target, `${language}.traineddata.gz`), bytes);
    console.log(`${(bytes.length / 1024 / 1024).toFixed(1)} MB`);
  } catch (error) {
    console.log(`fehlgeschlagen (${error.message})`);
  }
}

console.log(`\nSprachdaten liegen in public/tessdata/. Die App nutzt sie automatisch.`);
