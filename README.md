# PDF.me

Lokale Web-App zum Bearbeiten, Zusammenführen, Teilen, Umsortieren und Konvertieren von PDFs.
Läuft auf dem eigenen Rechner, wird im Browser bedient und speichert keine Dateien.

```bash
npm install
npm run setup      # fragt nach dem Passwort und legt .env.local an
npm run dev        # http://localhost:3000
```

Läuft auf macOS, Windows und Linux. Voraussetzung ist Node.js — siehe
[Einrichtung](#einrichtung).

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

### Schritt 1: Node.js installieren

Ohne Node.js gibt es kein `npm`, und nichts weiter funktioniert. Version 20 oder neuer.

**Windows** (PowerShell):

```powershell
winget install OpenJS.NodeJS.LTS
winget install Git.Git
```

> **PowerShell danach schliessen und neu öffnen.** Erst dann kennt sie die neuen Befehle.
> Ohne Neustart meldet sie weiterhin *„Die Benennung `npm` wurde nicht als Name eines Cmdlet
> … erkannt"* — das ist kein Fehler der Installation, die Sitzung hat den Suchpfad nur noch
> nicht neu eingelesen.

**macOS** (Terminal, mit [Homebrew](https://brew.sh)):

```bash
brew install node git
```

Ohne Homebrew: das Installationsprogramm von [nodejs.org](https://nodejs.org) verwenden;
Git bringt macOS mit, sobald einmal `xcode-select --install` gelaufen ist.

Prüfen, ob es geklappt hat — beide Befehle müssen eine Versionsnummer ausgeben:

```
node -v
git -v
```

### Schritt 2: Optional LibreOffice

Nur für **Word → PDF** nötig. Ohne LibreOffice läuft alles andere normal, und die Oberfläche
weist an genau der Stelle darauf hin.

| System | Befehl |
|---|---|
| Windows | `winget install TheDocumentFoundation.LibreOffice` |
| macOS | `brew install --cask libreoffice` |
| Ubuntu/Debian | `sudo apt install libreoffice-writer` |

> Wichtig bei Linux: `libreoffice-core` allein reicht nicht. Ohne das Paket
> `libreoffice-writer` existiert `soffice` zwar, kann aber keine Textdokumente laden.
> Die App prüft das beim Öffnen des Konvertieren-Bereichs mit einer echten Testkonvertierung
> und sagt Bescheid, statt später mit einem unverständlichen Fehler abzubrechen.

### Schritt 3: Projekt holen und installieren

Auf beiden Systemen identisch:

```
git clone -b claude/pdf-web-app https://github.com/daniHAAA/PDF.me.git
cd PDF.me
npm install
```

`npm install` kopiert nebenbei die Laufzeitdateien von pdf.js und tesseract.js nach `public/`.

### Schritt 4: Passwort festlegen

```
npm run setup
```

Fragt nach einem Passwort und legt `.env.local` mit diesem Passwort und einem zufälligen
`AUTH_SECRET` an. Eine vorhandene Datei wird nie überschrieben.

Ohne Rückfrage geht es auch:

```
npm run setup -- meinPasswort
```

Wer die Datei lieber von Hand schreibt, nimmt `.env.example` als Vorlage:

| Variable | Pflicht | Bedeutung |
|---|---|---|
| `APP_PASSWORD` | ja | Passwort für den Login. |
| `AUTH_SECRET` | ja | Schlüssel zum Signieren des Session-Cookies, mindestens 32 Zeichen. |
| `SESSION_HOURS` | nein | Gültigkeitsdauer der Anmeldung, Vorgabe 12 Stunden. |
| `MAX_UPLOAD_MB` | nein | Grösstmögliche Datei, Vorgabe 100 MB. |
| `SOFFICE_PATH` | nein | Pfad zu `soffice`, falls er nicht im Suchpfad liegt. |

### Schritt 5: Starten

```
npm run dev
```

Dann [http://localhost:3000](http://localhost:3000) öffnen und mit dem Passwort anmelden.

Für den täglichen Gebrauch ist die gebaute Fassung schneller:

```
npm run build
npm start
```

### Von einem anderen Rechner nutzen (ohne dort etwas zu installieren)

Der häufigste Fall: Die App läuft auf einem Rechner — etwa dem Mac — und wird von einem
zweiten genutzt, auf dem sich nichts installieren lässt, weil die Administratorrechte fehlen.
Dort genügt ein Browser.

Auf dem Rechner, der die App bereitstellt:

```
npm run build
npm run share
```

`npm run share` zeigt die Adresse an, unter der die App im Netz erreichbar ist:

```
  Auf diesem Rechner:
    http://localhost:3000

  Von anderen Geräten im selben Netz:
    http://192.168.1.42:3000
```

Diese zweite Adresse auf dem anderen Rechner im Browser öffnen — dasselbe Passwort, derselbe
Funktionsumfang. Ein Lesezeichen darauf, und es fühlt sich an wie jede andere interne Anwendung.

Voraussetzungen und Grenzen:

- **Beide Geräte im selben Netz** (gleiches WLAN oder Netzwerkkabel). Im Homeoffice über VPN
  klappt es nur, wenn das VPN die Verbindung zwischen den Geräten zulässt.
- **Der bereitstellende Rechner muss wach bleiben.** Klappt der Mac zu, ist die App weg.
  Dagegen hilft `caffeinate -i npm run share` im Terminal oder
  *Systemeinstellungen → Batterie → Automatischen Ruhezustand deaktivieren*.
- **Beim ersten Start fragt macOS**, ob Node eingehende Verbindungen annehmen darf —
  „Erlauben" wählen. Wurde versehentlich abgelehnt, findet sich der Schalter unter
  *Systemeinstellungen → Netzwerk → Firewall → Optionen*.
- **Die Verbindung ist unverschlüsselt** (`http://`, nicht `https://`) und die App ist damit
  für jeden im selben Netz sichtbar. Geschützt ist sie nur durch das Passwort. Im Firmen- oder
  Heimnetz ist das vertretbar; für einen Zugang über das Internet gehört ein HTTPS-Zugang
  davor (siehe unten).
- **Die IP-Adresse kann sich ändern**, wenn der Router sie neu vergibt. Dann zeigt
  `npm run share` einfach die neue an. Wer das dauerhaft vermeiden will, vergibt im Router eine
  feste Adresse für den Rechner.

### Auf einem Server betreiben

Wenn die App dauerhaft laufen soll, ohne dass ein Arbeitsrechner dafür wach bleiben muss,
gehört sie auf einen Server — eine Maschine im Firmennetz oder einen gemieteten Server.

Zu beachten ist dabei:

- **Ein durchgehend laufender Node-Prozess ist nötig.** Plattformen, die nur einzelne
  Funktionen ausführen (etwa Vercel in der Standardeinstellung), passen nicht: Word → PDF
  startet LibreOffice als eigenes Programm, und grosse Dateien überschreiten die dortigen
  Grenzen für Anfragedauer und Datenmenge. Geeignet ist alles, was einen Container oder eine
  virtuelle Maschine bereitstellt.
- **LibreOffice muss auf dem Server installiert sein**, sonst fehlt Word → PDF.
- **HTTPS davor.** Sobald der Zugang über HTTPS läuft, schaltet die App das Sitzungs-Cookie
  automatisch auf `Secure` — dafür ist nichts zu konfigurieren.
- **Ein gemeinsames Passwort reicht dann nicht mehr.** Für mehrere Personen gehören
  persönliche Zugangsdaten her, damit nachvollziehbar bleibt, wer zugreift.
- **Datenschutz.** Sobald die App nicht mehr auf dem eigenen Rechner läuft, wandern die
  hochgeladenen Dokumente über das Netz zu diesem Server. Die App speichert dort zwar nichts,
  aber wo der Server steht und wer ihn betreibt, ist bei Gäste- und Vertragsdokumenten eine
  Frage, die vorher geklärt sein will.

### Wenn etwas nicht läuft

| Meldung | Ursache | Lösung |
|---|---|---|
| `npm` / `node` / `git` „wurde nicht als Name eines Cmdlet … erkannt" | Nicht installiert, oder die Sitzung kennt den neuen Suchpfad noch nicht | Schritt 1, danach Terminal neu öffnen |
| `command not found: npm` (macOS) | dasselbe | Schritt 1, danach Terminal neu öffnen |
| `Umgebungsvariable APP_PASSWORD fehlt` | `.env.local` fehlt | `npm run setup` |
| `EADDRINUSE … 3000` | Port belegt, meist von einem älteren Start | Anderes Fenster schliessen, oder `npm run dev -- -p 3001` |
| Anmeldung springt ohne Fehler auf den Login zurück | Veraltete Fassung: das Sitzungs-Cookie war auf `Secure` gesetzt und wurde über `http://` verworfen | Aktuellen Stand holen (`git pull`) |
| Anderer Rechner erreicht die Adresse nicht | Nicht dasselbe Netz, oder die Firewall blockt | Beide Geräte im selben WLAN; macOS-Firewall-Abfrage mit „Erlauben" beantworten |
| Word → PDF meldet fehlendes LibreOffice | Schritt 2 übersprungen | LibreOffice installieren, danach Server neu starten |

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
├── setup-env.mjs              Legt .env.local an (npm run setup)
├── share.mjs                  Startet die App und zeigt die Netzwerkadresse
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
