# PDF.me

Lokale Web-App zum Bearbeiten, Zusammenführen, Teilen, Umsortieren und Konvertieren von PDFs.
Läuft auf dem eigenen Rechner, wird im Browser bedient und speichert keine Dateien.

```bash
npm install
cp .env.example .env.local     # Passwort und Secret eintragen
npm run dev                    # http://localhost:3000
```

---

## Inhalt

- [Was die App kann](#was-die-app-kann)
- [Einrichtung](#einrichtung)
- [Wie die Bearbeitung funktioniert](#wie-die-bearbeitung-funktioniert)
- [Architektur](#architektur)
- [Optionale Zusatzprogramme](#optionale-zusatzprogramme)
- [Grenzen](#grenzen)
- [Projektstruktur](#projektstruktur)
- [Tests](#tests)

---

## Was die App kann

| Bereich | Funktion |
|---|---|
| **Text bearbeiten** | Text im PDF anklicken, überschreiben oder löschen. Funktioniert bei normalen PDFs über den Textlayer und bei Scans über Texterkennung. |
| **Seiten** | Umsortieren per Ziehen, drehen, löschen, Seiten aus anderen PDFs einfügen — alles in einem Durchgang. |
| **Zusammenführen** | Beliebig viele PDFs in frei wählbarer Reihenfolge zu einem Dokument. |
| **Teilen** | Nach Seitenbereichen (`1-3, 5, 8-12`) oder in Einzelseiten. Mehrere Teile kommen als ZIP. |
| **Konvertieren** | Word → PDF und PDF → Word. |

**Dateien werden nicht gespeichert.** Hochladen, verarbeiten, herunterladen — die Verarbeitung
läuft im Arbeitsspeicher, es gibt keine Datenbank, keine Ablage und keine Historie. Temporäre
Dateien entstehen nur bei der Word-Konvertierung und werden sofort danach gelöscht.

---

## Einrichtung

### Voraussetzungen

- **Node.js 20 oder neuer** ([nodejs.org](https://nodejs.org))
- **LibreOffice** — nur für Word → PDF nötig. Ohne LibreOffice läuft alles andere normal,
  und die Oberfläche weist an der Stelle darauf hin.
  - macOS: `brew install --cask libreoffice`
  - Ubuntu/Debian: `sudo apt install libreoffice-writer`
  - Windows: [libreoffice.org/download](https://www.libreoffice.org/download/)

> Wichtig bei Linux: `libreoffice-core` allein reicht nicht. Ohne das Paket
> `libreoffice-writer` existiert `soffice` zwar, kann aber keine Textdokumente laden.
> Die App prüft das beim Start des Konvertieren-Bereichs mit einer echten Testkonvertierung
> und sagt Bescheid, statt später mit einem unverständlichen Fehler abzubrechen.

### Installieren

```bash
npm install
```

Der Installationsschritt kopiert nebenbei die Laufzeitdateien von pdf.js und tesseract.js nach
`public/` (siehe [Architektur](#architektur)).

### Konfigurieren

`.env.example` nach `.env.local` kopieren und ausfüllen:

```bash
cp .env.example .env.local
```

| Variable | Pflicht | Bedeutung |
|---|---|---|
| `APP_PASSWORD` | ja | Passwort für den Login. |
| `AUTH_SECRET` | ja | Schlüssel zum Signieren des Session-Cookies, mindestens 32 Zeichen. |
| `SESSION_HOURS` | nein | Gültigkeitsdauer der Anmeldung, Vorgabe 12 Stunden. |
| `MAX_UPLOAD_MB` | nein | Grösstmögliche Datei, Vorgabe 100 MB. |
| `SOFFICE_PATH` | nein | Pfad zu `soffice`, falls er nicht im Suchpfad liegt. |

Secret erzeugen:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

### Starten

```bash
npm run dev      # Entwicklung, lädt Änderungen automatisch nach
npm run build && npm start   # schnellere Fassung für den täglichen Gebrauch
```

Danach [http://localhost:3000](http://localhost:3000) im Browser öffnen.

### Für Kollegen im gleichen Netz freigeben

`npm start` lauscht auch auf der Netzwerkadresse des Rechners; Kollegen erreichen die App dann
unter `http://<deine-ip>:3000` mit demselben Passwort. Der Zugang ist damit im lokalen Netz
offen — für den Einsatz über das Internet hinaus gehören ein HTTPS-Zugang davor und
persönliche Zugangsdaten statt eines gemeinsamen Passworts.

---

## Wie die Bearbeitung funktioniert

Der Abschnitt ist der wichtigste, weil sich hier die Möglichkeiten und Grenzen der App erklären.

### Warum Text in einem PDF nicht wie in Word funktioniert

Ein Word-Dokument speichert Absätze. Ein PDF speichert etwas ganz anderes: eine Liste von
Zeichenanweisungen der Form *„setze die Schrift Helvetica in 11 pt, gehe zu Position (72, 700),
zeichne die Glyphen H-a-l-l-o"*. Es gibt keine Absätze, keine Zeilen und keinen Textfluss —
nur Glyphen an festen Koordinaten.

Daraus folgt alles Weitere: Text kann nicht umbrechen, wenn er länger wird, und man kann nicht
einfach „mittendrin tippen". Was PDF-Editoren tun — auch die kommerziellen — ist ein
Austausch an Ort und Stelle.

### Der Ablauf in vier Schritten

**1. Seite anzeigen und Textpositionen ermitteln**

pdf.js rendert die Seite in ein Canvas und liefert gleichzeitig zu jedem Textfragment die
Transformationsmatrix. Aus ihr ergeben sich Position, Schriftgrösse und Leserichtung.

**2. Bearbeitbare Felder darüberlegen**

Über das Bild kommt für jedes Fragment ein unsichtbares, bearbeitbares Feld — exakt an der
Stelle, in der passenden Grösse und Neigung. Es sieht aus, als bearbeite man das PDF direkt;
tatsächlich bearbeitet man eine Auflage.

**3. Bei Scans: Texterkennung**

Ein eingescanntes PDF enthält nur ein Bild. Hat eine Seite kaum Text, meldet die App das und
bietet Texterkennung an. Tesseract liefert dann jedes erkannte Wort mit Rechteck und Grundlinie
zurück — ab da läuft alles identisch zu Schritt 2, es macht also keinen Unterschied mehr, ob
das PDF gescannt war.

**4. Beim Speichern: entfernen, übermalen, neu zeichnen**

Serverseitig passieren drei Dinge pro geänderter Stelle:

1. **Der Originaltext wird aus dem Dokument entfernt.** Der Inhaltsstrom der Seite wird
   durchgelesen, die Textmatrix mitgeführt und so der Zeichenbefehl an der gesuchten Position
   gefunden. Sein Textinhalt wird geleert.
2. **Die Stelle wird übermalt** — mit der Hintergrundfarbe, die vorher aus dem gerenderten
   Bild gemessen wurde. Nötig bleibt das auch nach Schritt 1: bei Scans steht der Text im Bild,
   und Unterstreichungen oder farbige Hinterlegungen verschwinden nicht mit dem Textbefehl.
3. **Der neue Text wird gezeichnet**, in der gemessenen Textfarbe und an derselben Grundlinie.
   Passt er nicht in die alte Breite, wird die Schrift so weit verkleinert, bis er hineinpasst.

### Warum Schritt 1 wichtig ist

Nur zu übermalen würde reichen, damit es *aussieht*, als sei der Text geändert. Der alte Text
bliebe aber im Dokument: markierbar, kopierbar, per Suche auffindbar und für jedes
Auswerteprogramm sichtbar. Wer in einer Offerte 500 auf 400 ändert, verschickt sonst ein
Dokument, in dem die 500 noch steht.

Der Eingriff in den Inhaltsstrom hat eine bewusste Vorsichtsregel: Nach jedem Textbefehl rückt
die Schreibmarke um die Breite des Geschriebenen weiter, und diese Breite hängt von den
Metriken der eingebetteten Schrift ab. Wo sie sich nicht sicher bestimmen lässt, gilt die
Position als unsicher, und die Stelle wird **nicht** angefasst — dann bleibt es beim Übermalen.

Danach wird das Ergebnis überprüft: Es muss lesbar sein und der alte Text darf an seiner
Position nicht mehr auftauchen. Schlägt die Prüfung fehl, liefert die App die Fassung ohne
Eingriff aus. Ein bloss übermaltes PDF ist deutlich besser als ein beschädigtes.

**Nach dem Speichern sagt die App, was passiert ist.** Konnte nicht überall entfernt werden,
erscheint ein Hinweis mit der Anzahl der betroffenen Stellen — damit bei vertraulichen
Inhalten klar ist, wo nachzusehen ist.

---

## Architektur

### Überblick

```
Browser                                  Server (Node)
─────────────────────────────────        ──────────────────────────────
pdf.js      Seite rendern,               pdf-lib     Seiten kopieren, drehen,
            Textpositionen                           zeichnen, Inhaltsströme
tesseract.js  Texterkennung              pdf.js      Text mit Position auslesen
Canvas      Farben messen                docx        Word-Datei schreiben
                                         LibreOffice Word → PDF
        │                                        ▲
        └──── multipart-Upload ──────────────────┘
              Binärdatei zurück, nichts gespeichert
```

### Warum diese Bibliotheken

| Baustein | Wahl | Begründung |
|---|---|---|
| Rahmen | **Next.js** | Oberfläche und Server in einem Prozess, ein Startbefehl. |
| PDF schreiben | **pdf-lib** | Reines JavaScript, kein Systemprogramm nötig; deckt Kopieren, Drehen, Zeichnen und Inhaltsströme ab. |
| PDF lesen | **pdf.js** | Der einzige Renderer, der auch die Position jedes Textfragments liefert — die Grundlage der Bearbeitung. |
| Texterkennung | **tesseract.js** | Läuft als WebAssembly im Browser, ohne Installation. |
| Word schreiben | **docx** | Erzeugt .docx-Dateien ohne Office. |
| Word lesen | **LibreOffice** | Ein .docx layoutgetreu darzustellen heisst, Word-Layout nachzubauen. Dafür gibt es in JavaScript nichts Vergleichbares. |
| Anmeldung | **jose** | Signiertes Cookie, keine Datenbank — passend zur zustandslosen App. |

### Wo Arbeit stattfindet und warum

**Im Browser:** Anzeige, Textpositionen, Texterkennung, Farbmessung. Das hält den Server frei,
vermeidet Uploads beim Blättern — und gescannte Dokumente verlassen den Rechner nie, weil die
Texterkennung lokal läuft.

**Auf dem Server:** alles, was das PDF verändert. Der Grund ist nicht Rechenleistung, sondern
Verlässlichkeit: pdf-lib schreibt dort in einer kontrollierten Umgebung, und die Datei geht als
fertiger Download zurück.

### Umgang mit grossen Dokumenten

- Im Bearbeiten-Bereich wird immer nur die aktuelle Seite gerendert. Ein 500-Seiten-Dokument
  öffnet damit genauso schnell wie ein einseitiges.
- Vorschaubilder im Seiten-Bereich entstehen erst, wenn die Kachel in Sichtweite kommt, und
  werden zwischengespeichert — Umsortieren und Drehen lösen kein erneutes Rendern aus.
- Ein Rendervorgang wird abgebrochen, sobald weitergeblättert wird.
- Serverseitig wird pro Quelldatei nur einmal kopiert, nicht pro Seite.

Gemessen mit einem Dokument aus 120 Seiten und rund 4000 Textfragmenten: Öffnen samt erster
Seite 0,4 s, Seitenwechsel 0,15 s, Neuaufbau aller 120 Seiten auf dem Server 0,16 s.

### Anmeldung

Ein Passwort aus `APP_PASSWORD`, verglichen in konstanter Zeit. Bei Erfolg wird ein signiertes
JWT in einem `HttpOnly`-Cookie gesetzt. Eine Middleware prüft jede Anfrage; API-Aufrufe ohne
gültige Anmeldung erhalten 401, Seitenaufrufe eine Weiterleitung zum Login. Kein Nutzerkonto,
keine Datenbank, kein Serverzustand.

---

## Optionale Zusatzprogramme

Beide sind freiwillig — die App läuft ohne sie und sagt jeweils, was fehlt.

### Bessere PDF → Word-Umwandlung

Eingebaut ist ein Konverter, der aus den Textpositionen Zeilen und Absätze rekonstruiert und
Schriftgrösse, Fett/Kursiv sowie Ausrichtung überträgt. Tabellen kommen dabei als Text an.

Für höhere Layouttreue, inklusive Tabellen und Textrahmen:

```bash
pip install pdf2docx
```

Die App erkennt das von selbst und nutzt es dann.

### Texterkennung ohne Internet

Beim ersten Lauf lädt tesseract.js die Sprachdaten (rund 15 MB je Sprache) von einem CDN und
legt sie im Browser ab. Wer das vermeiden will oder in einem abgeschotteten Netz arbeitet:

```bash
npm run ocr:offline            # Deutsch und Englisch
npm run ocr:offline -- fra     # weitere Sprachen
```

Die Daten landen in `public/tessdata/` und werden automatisch von dort geladen. Das
Worker-Programm und die WebAssembly-Dateien liegen ohnehin schon lokal.

---

## Grenzen

Ehrlich benannt, damit es keine Überraschungen gibt:

- **Text fliesst nicht um.** Wird ein Text länger, verkleinert sich die Schrift, statt in die
  nächste Zeile zu laufen. Das liegt am Aufbau von PDFs, nicht an der App.
- **Schriften werden zugeordnet, nicht übernommen.** Eingebettete Schriften enthalten meist nur
  die tatsächlich verwendeten Zeichen; ein neu getipptes Zeichen fehlt darin. Neuer Text wird
  deshalb in der passenden Standardschrift gesetzt (serifenlos, Serif oder Monospace, jeweils
  normal/fett/kursiv). Bei ungewöhnlichen Hausschriften ist der Unterschied sichtbar.
- **Zeichenvorrat.** Die Standardschriften decken Westeuropa ab, Umlaute und ß eingeschlossen.
  Typografische Anführungszeichen und Gedankenstriche werden auf einfache Zeichen abgebildet;
  Zeichen ausserhalb (etwa Kyrillisch) fallen weg.
- **Nicht jede Stelle lässt sich restlos entfernen.** Siehe
  [Wie die Bearbeitung funktioniert](#warum-schritt-1-wichtig-ist) — die App meldet, wenn es
  vorkommt.
- **Texterkennung ist nicht fehlerfrei.** Schräg eingescannte, kontrastarme oder handschriftliche
  Vorlagen liefern Lücken. Eine höhere Zoomstufe vor dem Erkennen hilft oft.
- **PDF → Word ist eine Rekonstruktion.** Absätze und Ausrichtung stimmen meist, mehrspaltige
  Layouts und Tabellen nicht zwangsläufig.
- **Passwortgeschützte PDFs** lassen sich nur öffnen, wenn sie kein Öffnungspasswort haben.

---

## Projektstruktur

```
src/
├── middleware.ts              Zugangsschutz für alle Routen
├── app/
│   ├── page.tsx               Arbeitsbereich
│   ├── login/                 Anmeldung
│   └── api/
│       ├── auth/              Anmelden, Abmelden
│       ├── merge/             Zusammenführen
│       ├── split/             Teilen (PDF oder ZIP)
│       ├── organize/          Seiten neu aufbauen
│       ├── edit/              Textänderungen anwenden
│       ├── convert/           Word ↔ PDF
│       └── capabilities/      Meldet, welche Zusatzprogramme da sind
├── lib/
│   ├── config.ts              Einstellungen aus der Umgebung
│   ├── auth.ts                Session-Cookie
│   ├── http.ts                Gemeinsame Bausteine der API-Routen
│   ├── pdf/
│   │   ├── operations.ts      Zusammenführen, Teilen, Seiten, Textänderungen
│   │   ├── contentStream.ts   Originaltext aus dem Inhaltsstrom entfernen
│   │   ├── fonts.ts           Schriftzuordnung und Zeichenvorrat
│   │   └── types.ts           Gemeinsame Datentypen
│   ├── convert/
│   │   ├── libreoffice.ts     Word → PDF, inklusive Funktionsprüfung
│   │   ├── pdfToDocx.ts       PDF → Word, zwei Wege
│   │   └── extract.ts         Text mit Position auslesen (Server)
│   └── client/
│       ├── pdfjs.ts           pdf.js im Browser
│       ├── textLayer.ts       Textfragmente zu bearbeitbaren Feldern
│       ├── ocr.ts             Texterkennung
│       ├── colors.ts          Hintergrund- und Textfarbe messen
│       └── download.ts        Hochladen und Ergebnis herunterladen
└── components/                Oberfläche

scripts/
├── copy-assets.mjs            Laufzeitdateien nach public/ (läuft automatisch)
├── fetch-langdata.mjs         Sprachdaten für den Offline-Betrieb
└── smoke.mjs                  Test über die echten Schnittstellen
```

---

## Tests

```bash
npm run build && npm start &   # Server starten
npm run smoke                  # 14 Tests über die echten Schnittstellen
```

Geprüft werden: Zugangsschutz, Anmeldung, Zusammenführen, Teilen nach Bereichen und in
Einzelseiten, Fehlerbehandlung bei ungültigen Bereichen, Umsortieren mit Drehung und
Mehrfachverwendung derselben Seite, Textersetzung, das tatsächliche Verschwinden des
Originaltexts, das Erhaltenbleiben des übrigen Texts, Umlaute und Sonderzeichen sowie beide
Konvertierungsrichtungen.

Weitere Prüfungen:

```bash
npm run typecheck
```

---

## Lizenz

MIT — siehe [LICENSE](LICENSE).
