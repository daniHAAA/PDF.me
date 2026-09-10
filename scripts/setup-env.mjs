/**
 * Legt die Datei .env.local an.
 *
 * Warum ein Skript und keine Zeile in der Anleitung: Eine Kommandozeile, die
 * ein Passwort und einen Zufallswert in eine Datei schreibt, sieht unter
 * macOS/Linux (bash) und unter Windows (PowerShell) völlig unterschiedlich
 * aus — und PowerShell 5 schreibt Textdateien standardmässig mit einer
 * unsichtbaren Byte-Order-Mark, die den ersten Eintrag beschädigen kann.
 * Node läuft überall gleich, also erledigt Node es.
 *
 *   npm run setup                 fragt nach dem Passwort
 *   npm run setup -- meinPasswort setzt es direkt
 */
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { createInterface } from "node:readline/promises";
import { join } from "node:path";
import { stdin, stdout } from "node:process";

const target = join(process.cwd(), ".env.local");

if (existsSync(target)) {
  console.log(
    "\n.env.local ist bereits vorhanden — es wird nichts überschrieben.\n" +
      "Zum Neuanlegen die Datei zuerst löschen.\n",
  );
  process.exit(0);
}

let password = process.argv[2];

if (!password) {
  const rl = createInterface({ input: stdin, output: stdout });
  console.log("\nEinrichtung von PDF.me\n");
  password = (await rl.question("Passwort für den Login: ")).trim();
  rl.close();
}

if (!password) {
  console.error("\nKein Passwort angegeben. Abbruch.\n");
  process.exit(1);
}

if (password.length < 6) {
  console.error("\nDas Passwort sollte mindestens 6 Zeichen haben. Abbruch.\n");
  process.exit(1);
}

// 48 Zufallsbytes ergeben 64 Zeichen — deutlich über den geforderten 32.
const secret = randomBytes(48).toString("base64url");

// Bewusst ohne Byte-Order-Mark und mit \n als Zeilenende: so liest jede
// Umgebung die Datei gleich.
await writeFile(target, `APP_PASSWORD=${password}\nAUTH_SECRET=${secret}\n`, {
  encoding: "utf8",
});

console.log(
  `\n.env.local wurde angelegt.\n` +
    `  Passwort:      ${password}\n` +
    `  AUTH_SECRET:   automatisch erzeugt\n\n` +
    `Jetzt starten mit:  npm run dev\n` +
    `Danach im Browser:  http://localhost:3000\n`,
);
