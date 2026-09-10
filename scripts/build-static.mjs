/**
 * Baut die Fassung ohne Server für GitHub Pages (oder jeden anderen
 * Webserver, der nur Dateien ausliefert).
 *
 *   npm run build:static
 *   npm run build:static -- /anderer-pfad
 *
 * Der Unterpfad muss zum Ziel passen: Auf GitHub Pages liegt ein Projekt
 * unter dem Repository-Namen (https://<konto>.github.io/PDF.me/). Wird die
 * Seite unter einer eigenen Domain ausgeliefert, ist er leer ("").
 */
import { spawnSync } from "node:child_process";
import { writeFile, readdir } from "node:fs/promises";
import { join } from "node:path";

const basePath = process.argv[2] ?? process.env.BASE_PATH ?? "/PDF.me";
const out = join(process.cwd(), "out");

console.log(`\nBaue statische Fassung, Unterpfad: "${basePath || "(keiner)"}"\n`);

const build = spawnSync("npx", ["next", "build"], {
  stdio: "inherit",
  env: { ...process.env, STATIC_EXPORT: "1", BASE_PATH: basePath },
  shell: process.platform === "win32",
});

if (build.status !== 0) process.exit(build.status ?? 1);

/*
 * GitHub Pages schickt alles durch Jekyll, und Jekyll überspringt jeden Ordner,
 * dessen Name mit einem Unterstrich beginnt. Genau dort legt Next aber sein
 * gesamtes JavaScript ab (_next/). Ohne diese leere Datei liefert Pages für
 * jede Skriptdatei einen 404 aus, und die Seite bleibt weiss — ohne jede
 * Fehlermeldung, die auf die Ursache hinweisen würde.
 */
await writeFile(join(out, ".nojekyll"), "");

const entries = await readdir(out);
console.log(`
Fertig. Die Dateien liegen in out/ (${entries.length} Einträge, .nojekyll angelegt).

Zum lokalen Ausprobieren:
  npx serve out          und dann http://localhost:3000${basePath}/

Veröffentlichen: der Arbeitsablauf .github/workflows/pages.yml erledigt das
bei jedem Push automatisch.
`);
