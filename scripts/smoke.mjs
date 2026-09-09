/**
 * End-to-End-Test gegen einen laufenden Server.
 *
 * Startet keinen Server selbst — Adresse über BASE_URL, Passwort über
 * APP_PASSWORD (beides mit sinnvollen Vorgaben aus .env.local).
 *
 *   npm run build && npm start &
 *   npm run smoke
 */
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { Document, Packer, Paragraph, TextRun } from "docx";
import { readFileSync } from "node:fs";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";

function envFromFile(key) {
  try {
    const line = readFileSync(".env.local", "utf8")
      .split("\n")
      .find((l) => l.startsWith(`${key}=`));
    return line?.slice(key.length + 1).trim();
  } catch {
    return undefined;
  }
}

const PASSWORD = process.env.APP_PASSWORD ?? envFromFile("APP_PASSWORD");

let passed = 0;
let failed = 0;
let cookie = "";

async function test(name, fn) {
  try {
    await fn();
    console.log(`  ok   ${name}`);
    passed++;
  } catch (error) {
    console.log(`  FAIL ${name}\n       ${error.message}`);
    failed++;
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

/* ---------- Testdaten ---------- */

async function makePdf(pages, prefix = "Seite") {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= pages; i++) {
    const page = doc.addPage([595, 842]);
    page.drawText(`${prefix} ${i}`, { x: 72, y: 750, size: 24, font, color: rgb(0, 0, 0) });
  }
  return Buffer.from(await doc.save());
}

async function makeDocx() {
  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({ children: [new TextRun({ text: "Angebot", bold: true, size: 40 })] }),
          new Paragraph({ children: [new TextRun({ text: "Zwei Nächte im Doppelzimmer.", size: 24 })] }),
        ],
      },
    ],
  });
  return Buffer.from(await Packer.toBuffer(doc));
}

function blob(buffer, type) {
  return new Blob([buffer], { type });
}

async function post(path, form) {
  return fetch(`${BASE}${path}`, { method: "POST", body: form, headers: { cookie } });
}

async function countPages(buffer) {
  return (await PDFDocument.load(buffer, { ignoreEncryption: true })).getPageCount();
}

/* ---------- Ablauf ---------- */

console.log(`\nSmoke-Test gegen ${BASE}\n`);

await test("Zugriff ohne Anmeldung wird abgewiesen", async () => {
  const response = await fetch(`${BASE}/api/capabilities`, { redirect: "manual" });
  assert(response.status === 401, `erwartet 401, bekam ${response.status}`);
});

await test("Falsches Passwort wird abgelehnt", async () => {
  const response = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: "definitiv-falsch" }),
  });
  assert(response.status === 401, `erwartet 401, bekam ${response.status}`);
});

await test("Anmeldung mit richtigem Passwort", async () => {
  assert(PASSWORD, "APP_PASSWORD ist nicht gesetzt");
  const response = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: PASSWORD }),
  });
  assert(response.ok, `Anmeldung fehlgeschlagen (${response.status})`);
  cookie = (response.headers.get("set-cookie") ?? "").split(";")[0];
  assert(cookie.startsWith("pdfme_session="), "kein Session-Cookie erhalten");
});

await test("Zusammenführen: 2 + 3 Seiten ergibt 5", async () => {
  const form = new FormData();
  form.append("files", blob(await makePdf(2, "A"), "application/pdf"), "a.pdf");
  form.append("files", blob(await makePdf(3, "B"), "application/pdf"), "b.pdf");

  const response = await post("/api/merge", form);
  assert(response.ok, `Status ${response.status}`);
  const result = Buffer.from(await response.arrayBuffer());
  assert((await countPages(result)) === 5, "falsche Seitenzahl");
});

await test("Teilen nach Bereichen liefert ein ZIP mit zwei Dateien", async () => {
  const form = new FormData();
  form.append("file", blob(await makePdf(10), "application/pdf"), "quelle.pdf");
  form.append("mode", "ranges");
  form.append("ranges", JSON.stringify([{ from: 1, to: 3 }, { from: 8, to: 10 }]));

  const response = await post("/api/split", form);
  assert(response.ok, `Status ${response.status}`);
  assert(
    response.headers.get("Content-Type") === "application/zip",
    "erwartet ZIP bei mehreren Teilen",
  );
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(Buffer.from(await response.arrayBuffer()));
  assert(Object.keys(zip.files).length === 2, "erwartet zwei Dateien im Archiv");
});

await test("Teilen mit einem Bereich liefert direkt ein PDF", async () => {
  const form = new FormData();
  form.append("file", blob(await makePdf(10), "application/pdf"), "quelle.pdf");
  form.append("mode", "ranges");
  form.append("ranges", JSON.stringify([{ from: 4, to: 6 }]));

  const response = await post("/api/split", form);
  assert(response.headers.get("Content-Type") === "application/pdf", "erwartet PDF");
  assert((await countPages(Buffer.from(await response.arrayBuffer()))) === 3, "erwartet 3 Seiten");
});

await test("Ungültiger Seitenbereich wird als Fehler gemeldet", async () => {
  const form = new FormData();
  form.append("file", blob(await makePdf(3), "application/pdf"), "quelle.pdf");
  form.append("mode", "ranges");
  form.append("ranges", JSON.stringify([{ from: 9, to: 2 }]));

  const response = await post("/api/split", form);
  // 400, nicht 500: eine unsinnige Eingabe ist kein Serverfehler.
  assert(response.status === 400, `erwartet 400, bekam ${response.status}`);
  const body = await response.json();
  assert(/Ungültiger Bereich/.test(body.error), `unklare Meldung: ${body.error}`);
});

await test("Seiten reorganisieren: umsortieren, drehen, löschen, mischen", async () => {
  const form = new FormData();
  form.append("files", blob(await makePdf(3, "A"), "application/pdf"), "a.pdf");
  form.append("files", blob(await makePdf(2, "B"), "application/pdf"), "b.pdf");
  form.append(
    "pages",
    JSON.stringify([
      { sourceIndex: 1, pageIndex: 1, rotation: 90 },
      { sourceIndex: 0, pageIndex: 2 },
      // Dieselbe Quellseite zweimal, einmal gedreht: prüft, dass die Kopien
      // wirklich unabhängig sind.
      { sourceIndex: 0, pageIndex: 0 },
      { sourceIndex: 0, pageIndex: 0, rotation: 180 },
    ]),
  );

  const response = await post("/api/organize", form);
  assert(response.ok, `Status ${response.status}`);
  const doc = await PDFDocument.load(Buffer.from(await response.arrayBuffer()));
  assert(doc.getPageCount() === 4, `erwartet 4 Seiten, bekam ${doc.getPageCount()}`);

  const rotations = doc.getPages().map((p) => p.getRotation().angle);
  assert(rotations[0] === 90, `Seite 1: erwartet 90°, bekam ${rotations[0]}`);
  assert(rotations[2] === 0, `Seite 3: erwartet 0°, bekam ${rotations[2]}`);
  assert(rotations[3] === 180, `Seite 4: erwartet 180°, bekam ${rotations[3]}`);
});

await test("Text bearbeiten ersetzt den Inhalt an Ort und Stelle", async () => {
  const source = await makePdf(1, "Seite");
  const form = new FormData();
  form.append("file", blob(source, "application/pdf"), "quelle.pdf");
  form.append(
    "edits",
    JSON.stringify([
      {
        pageIndex: 0,
        box: { x: 72, y: 745, width: 120, height: 26 },
        baseline: { x: 72, y: 750 },
        text: "Ersetzt durch Test",
        fontSize: 24,
        maxWidth: 200,
        fontFamily: "sans",
        bold: false,
        italic: false,
        color: { r: 0, g: 0, b: 0 },
        background: { r: 1, g: 1, b: 1 },
        rotation: 0,
      },
    ]),
  );

  const response = await post("/api/edit", form);
  assert(response.ok, `Status ${response.status}`);
  const result = Buffer.from(await response.arrayBuffer());

  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(result), useSystemFonts: false }).promise;
  const content = await (await pdf.getPage(1)).getTextContent();
  const text = content.items.map((i) => i.str).join(" ");
  assert(text.includes("Ersetzt durch Test"), `neuer Text fehlt: "${text}"`);
});

await test("Der ersetzte Originaltext ist wirklich aus dem PDF verschwunden", async () => {
  const form = new FormData();
  form.append("file", blob(await makePdf(1, "Preis 500 CHF"), "application/pdf"), "quelle.pdf");
  form.append(
    "edits",
    JSON.stringify([
      {
        pageIndex: 0,
        box: { x: 72, y: 745, width: 200, height: 26 },
        baseline: { x: 72, y: 750 },
        text: "Preis 400 CHF",
        originalText: "Preis 500 CHF 1",
        fontSize: 24,
        maxWidth: 300,
        fontFamily: "sans",
        bold: false,
        italic: false,
        color: { r: 0, g: 0, b: 0 },
        background: { r: 1, g: 1, b: 1 },
        rotation: 0,
      },
    ]),
  );

  const response = await post("/api/edit", form);
  assert(response.ok, `Status ${response.status}`);
  assert(
    response.headers.get("X-Edit-Removed") === "1",
    `Originaltext nicht entfernt (entfernt=${response.headers.get("X-Edit-Removed")}, ` +
      `nur überdeckt=${response.headers.get("X-Edit-Covered")})`,
  );

  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const pdf = await pdfjs.getDocument({
    data: new Uint8Array(Buffer.from(await response.arrayBuffer())),
    useSystemFonts: false,
  }).promise;
  const content = await (await pdf.getPage(1)).getTextContent();
  const text = content.items.map((i) => i.str).join(" ");

  // Genau das ist der Punkt: eine Textsuche im Ergebnis darf die alte Zahl
  // nicht mehr finden.
  assert(!text.includes("500"), `alter Text noch auffindbar: "${text}"`);
  assert(text.includes("Preis 400 CHF"), `neuer Text fehlt: "${text}"`);
});

await test("Unveränderter Text auf derselben Seite bleibt erhalten", async () => {
  // Absicherung gegen zu forsches Löschen: nur die bearbeitete Stelle darf weg.
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([595, 842]);
  page.drawText("Zeile A behalten", { x: 60, y: 700, size: 12, font });
  page.drawText("Zeile B ersetzen", { x: 60, y: 660, size: 12, font });
  page.drawText("Zeile C behalten", { x: 60, y: 620, size: 12, font });
  const source = Buffer.from(await doc.save());

  const form = new FormData();
  form.append("file", blob(source, "application/pdf"), "quelle.pdf");
  form.append(
    "edits",
    JSON.stringify([
      {
        pageIndex: 0,
        box: { x: 60, y: 657, width: 120, height: 14 },
        baseline: { x: 60, y: 660 },
        text: "Zeile B neu",
        originalText: "Zeile B ersetzen",
        fontSize: 12,
        maxWidth: 200,
        fontFamily: "sans",
        bold: false,
        italic: false,
        color: { r: 0, g: 0, b: 0 },
        background: { r: 1, g: 1, b: 1 },
        rotation: 0,
      },
    ]),
  );

  const response = await post("/api/edit", form);
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const pdf = await pdfjs.getDocument({
    data: new Uint8Array(Buffer.from(await response.arrayBuffer())),
    useSystemFonts: false,
  }).promise;
  const text = (await (await pdf.getPage(1)).getTextContent()).items.map((i) => i.str).join(" ");

  assert(text.includes("Zeile A behalten"), `Zeile A verloren: "${text}"`);
  assert(text.includes("Zeile C behalten"), `Zeile C verloren: "${text}"`);
  assert(!text.includes("Zeile B ersetzen"), `Zeile B nicht entfernt: "${text}"`);
  assert(text.includes("Zeile B neu"), `neuer Text fehlt: "${text}"`);
});

await test("Umlaute und Sonderzeichen überstehen die Bearbeitung", async () => {
  const form = new FormData();
  form.append("file", blob(await makePdf(1), "application/pdf"), "quelle.pdf");
  form.append(
    "edits",
    JSON.stringify([
      {
        pageIndex: 0,
        box: { x: 72, y: 745, width: 120, height: 26 },
        baseline: { x: 72, y: 750 },
        // Typografische Anführungszeichen und Gedankenstrich sind nicht in
        // WinAnsi — sie müssen ersetzt statt abgelehnt werden.
        text: "Andermatt – „Grüße“ für Zürich",
        fontSize: 14,
        maxWidth: 400,
        fontFamily: "sans",
        bold: true,
        italic: false,
        color: { r: 0, g: 0, b: 0 },
        background: { r: 1, g: 1, b: 1 },
        rotation: 0,
      },
    ]),
  );

  const response = await post("/api/edit", form);
  assert(response.ok, `Status ${response.status} — Sonderzeichen brachten die Route zum Absturz`);
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const pdf = await pdfjs.getDocument({
    data: new Uint8Array(Buffer.from(await response.arrayBuffer())),
    useSystemFonts: false,
  }).promise;
  const content = await (await pdf.getPage(1)).getTextContent();
  const text = content.items.map((i) => i.str).join("");
  assert(text.includes("Grüße"), `Umlaute verloren: "${text}"`);
  assert(text.includes("Zürich"), `Umlaute verloren: "${text}"`);
});

await test("PDF → Word erzeugt eine lesbare .docx", async () => {
  const form = new FormData();
  form.append("file", blob(await makePdf(2, "Kapitel"), "application/pdf"), "quelle.pdf");
  form.append("filename", "quelle.pdf");

  const response = await post("/api/convert/pdf-to-docx", form);
  assert(response.ok, `Status ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  // Eine .docx ist ein ZIP — die Signatur ist der schnellste Gültigkeitstest.
  assert(buffer[0] === 0x50 && buffer[1] === 0x4b, "keine gültige ZIP/DOCX-Datei");

  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(buffer);
  const xml = await zip.file("word/document.xml").async("string");
  assert(xml.includes("Kapitel 1"), "Text der ersten Seite fehlt");
  assert(xml.includes("Kapitel 2"), "Text der zweiten Seite fehlt");
  // Die Quelle ist Helvetica, also serifenlos. Landet hier eine Serifenschrift,
  // stuft die Schriftklassifikation falsch ein ("sans-serif" enthält "serif").
  assert(xml.includes("Calibri"), "serifenlose Schrift wurde falsch zugeordnet");
  assert(!xml.includes("Times New Roman"), "Helvetica faelschlich als Serifenschrift eingestuft");
});

await test("Word → PDF konvertiert über LibreOffice", async () => {
  const capabilities = await (await fetch(`${BASE}/api/capabilities`, { headers: { cookie } })).json();
  if (!capabilities.libreOffice) {
    console.log("       (übersprungen: LibreOffice nicht installiert)");
    return;
  }

  const form = new FormData();
  form.append(
    "file",
    blob(await makeDocx(), "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
    "angebot.docx",
  );
  form.append("filename", "angebot.docx");

  const response = await post("/api/convert/docx-to-pdf", form);
  assert(response.ok, `Status ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  assert(buffer.subarray(0, 4).toString() === "%PDF", "keine gültige PDF-Datei");

  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(buffer), useSystemFonts: false }).promise;
  const content = await (await pdf.getPage(1)).getTextContent();
  const text = content.items.map((i) => i.str).join(" ");
  assert(text.includes("Angebot"), `erwarteter Text fehlt: "${text}"`);
});

console.log(`\n${passed} bestanden, ${failed} fehlgeschlagen\n`);
process.exit(failed === 0 ? 0 : 1);
