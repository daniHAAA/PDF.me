# PDF.me

Web-App zum Bearbeiten, Zusammenführen, Teilen, Umsortieren und Konvertieren von PDFs.

Die Verarbeitung läuft **vollständig im Browser**. Dateien werden nicht hochgeladen und
verlassen den Rechner nicht — es gibt nichts, was auf einem Server gespeichert werden könnte.
Dadurch lässt sich die App auf zwei Arten betreiben:

| | **Als Webseite** | **Lokal** |
|---|---|---|
| Aufruf | eine Adresse im Browser | `npm run dev` auf dem eigenen Rechner |
| Installation | keine | Node.js |
| Text bearbeiten, OCR, Seiten, Teilen, Zusammenführen, PDF → Word | ✓ | ✓ |
| Word → PDF | — (braucht LibreOffice) | ✓ |
| Passwortschutz | — | ✓ |

Siehe [Zwei Betriebsarten](#zwei-betriebsarten).

---

## Inhalt

- [Was die App kann](#was-die-app-kann)
- [Zwei Betriebsarten](#zwei-betriebsarten)
- [Als Webseite veröffentlichen](#als-webseite-veröffentlichen)
- [Einrichtung](#einrichtung) (lokaler Betrieb)
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

## Zwei Betriebsarten

Beide entstehen aus derselben Quelle; der Unterschied ist eine Einstellung beim Bauen.

### Warum das überhaupt geht

Die Bibliotheken, die PDFs lesen und schreiben (`pdf-lib`, `pdf.js`), laufen im Browser
genauso wie auf einem Server. Es gibt also keinen technischen Grund, eine Datei erst
hochzuladen, sie dort zu verändern und wieder herunterzuladen. Alles rechnet im Browser.

Das hat drei Folgen:

1. **Die Datei verlässt den Rechner nicht.** Kein Upload, keine Zwischenkopie, nichts, was
   irgendwo liegen bleiben könnte.
2. **Es ist schneller**, weil die Übertragung in beide Richtungen entfällt.
3. **Es braucht keinen Server.** Damit lässt sich die App als gewöhnliche Webseite
   veröffentlichen und von jedem Gerät nutzen — auch von einem, auf dem sich mangels
   Administratorrechten nichts installieren lässt.

### Was ohne Server fehlt

Genau zwei Dinge:

**Word → PDF.** Ein `.docx` layoutgetreu darzustellen heisst, das Layout von Word nachzubauen:
Tabellen, Kopf- und Fusszeilen, Abschnitte, Schriftmetriken, Seitenumbrüche. Dafür braucht es
LibreOffice — ein ausgewachsenes Programm, das es im Browser nicht gibt. Die Gegenrichtung
(PDF → Word) funktioniert dagegen auch ohne Server.

**Der Passwortschutz.** Eine Anmeldung braucht eine Stelle, die das Passwort prüft und eine
Sitzung ausstellt. Ohne Server gibt es die nicht. Eine Abfrage in der Seite selbst wäre
wirkungslos — jeder könnte sie im Quelltext nachlesen oder überspringen — und deshalb ist
absichtlich keine eingebaut: eine Anmeldemaske, die nichts schützt, wiegt in falscher
Sicherheit.

Wichtig für die Einordnung: Der Passwortschutz im lokalen Betrieb sichert nicht die Dokumente,
sondern den Zugang zur Anwendung. Die Dokumente sind ohnehin geschützt, weil sie den Browser
nie verlassen. Wer die veröffentlichte Adresse aufruft, sieht das Werkzeug — nie eine Datei.

---

## Als Webseite veröffentlichen

Über GitHub Pages, wie jede andere statische Seite.

### Einmalig einrichten

1. Im Repository auf **Settings → Pages** gehen.
2. Unter **Source** den Eintrag **GitHub Actions** wählen.

Das war's. Der Arbeitsablauf `.github/workflows/pages.yml` liegt bereits im Projekt und baut
bei jedem Push auf `main` die Seite neu.

Danach ist die App erreichbar unter:

```
https://<konto>.github.io/<repository>/
```

### Von Hand bauen

```
npm run build:static
```

Legt die fertigen Dateien in `out/` ab — die lassen sich auf jeden Webserver kopieren. Liegt
die Seite nicht unter einem Unterpfad, sondern unter einer eigenen Domain:

```
npm run build:static -- ""
```

Vorher lokal ansehen:

```
npx serve out
```

### Was dabei zu beachten ist

- **Die Adresse ist öffentlich**, wenn das Repository öffentlich ist. Das Werkzeug ist damit
  für jeden nutzbar — die Dokumente aber nicht einsehbar, weil sie nie übertragen werden.
  (GitHub Pages aus einem privaten Repository gibt es nur mit GitHub Enterprise.)
- **Die Seite ist rund 50 MB gross**, hauptsächlich wegen der Bausteine für die Texterkennung.
  Für den Besucher spielt das keine Rolle: geladen wird nur, was er tatsächlich benutzt.
- **Die OCR-Sprachdaten** lädt der Arbeitsablauf mit ein. Schlägt das fehl, holt sie
  tesseract.js beim ersten Gebrauch selbst nach — dann ist einmalig Internet nötig.

---

## Einrichtung

Dieser Abschnitt beschreibt den **lokalen Betrieb** — nötig für Word → PDF und den
Passwortschutz. Wer nur die veröffentlichte Webseite nutzt, braucht davon nichts.

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

> Für diesen Fall ist meist die veröffentlichte Webseite der bessere Weg — sie braucht keinen
> laufenden Rechner im Hintergrund. Siehe
> [Als Webseite veröffentlichen](#als-webseite-veröffentlichen). Der Weg hier lohnt sich, wenn
> zusätzlich Word → PDF oder der Passwortschutz gebraucht wird.

Die App läuft auf einem Rechner — etwa dem Mac — und wird von einem zweiten genutzt, auf dem
sich nichts installieren lässt. Dort genügt ein Browser.

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
Browser  (macht die eigentliche Arbeit)          Server  (nur im lokalen Betrieb)
─────────────────────────────────────────        ───────────────────────────────
pdf.js        Seite rendern, Textpositionen      LibreOffice  Word → PDF
pdf-lib       Seiten kopieren, drehen,           pdf2docx     PDF → Word, optional
              zeichnen, Inhaltsströme                         mit besserem Layout
tesseract.js  Texterkennung für Scans            jose         Anmeldung
docx          Word-Datei schreiben
Canvas        Hintergrund- und Textfarbe messen

Die Datei bleibt im Browser.                     Erreichbar nur, wenn ein Server läuft.
```

### Warum diese Bibliotheken

| Baustein | Wahl | Begründung |
|---|---|---|
| Rahmen | **Next.js** | Erzeugt aus einer Quelle sowohl die Fassung mit Server als auch reine Dateien für einen statischen Webserver. |
| PDF schreiben | **pdf-lib** | Reines JavaScript, läuft im Browser wie in Node; deckt Kopieren, Drehen, Zeichnen und Inhaltsströme ab. |
| PDF lesen | **pdf.js** | Der einzige Renderer, der auch die Position jedes Textfragments liefert — die Grundlage der Bearbeitung. |
| Texterkennung | **tesseract.js** | Läuft als WebAssembly im Browser, ohne Installation. |
| Word schreiben | **docx** | Erzeugt .docx-Dateien ohne Office. |
| Word lesen | **LibreOffice** | Ein .docx layoutgetreu darzustellen heisst, Word-Layout nachzubauen. Dafür gibt es in JavaScript nichts Vergleichbares — und deshalb fehlt diese Richtung ohne Server. |
| Anmeldung | **jose** | Signiertes Cookie, keine Datenbank — passend zur zustandslosen App. |

### Wie eine Bearbeitung abläuft

Der gesamte Weg spielt sich im Browser ab (`lib/client/engine.ts`):

1. Die Datei wird über `<input type="file">` eingelesen — sie bleibt im Arbeitsspeicher des
   Browsers.
2. pdf.js zeigt sie an und liefert die Textpositionen.
3. pdf-lib verändert die Bytes.
4. Das Ergebnis wird als Download angeboten.

Kein Netzwerkzugriff, kein Server, keine Zwischenkopie. Die einzige Ausnahme ist Word → PDF,
das die Datei kurz an den lokalen Server gibt und dort nach der Umwandlung sofort löscht.

### Ein Quelltext, zwei Fassungen

Dateien mit der Endung `.node.ts` (die Route Handler und die Anmeldeseite) gelten nur im
Server-Betrieb als Teil der App. Beim statischen Bauen fehlt diese Endung in der Liste
`pageExtensions`, wodurch Next sie schlicht nicht als Routen erkennt — Route Handler und ein
Proxy sind bei `output: export` nicht möglich und würden den Build sonst abbrechen.

Dass die App gerade ohne Server läuft, erkennt der Code an `lib/client/mode.ts`; danach richtet
sich, ob die Anmeldung, der Abmelden-Knopf und Word → PDF angeboten werden.

### Umgang mit grossen Dokumenten

- Im Bearbeiten-Bereich wird immer nur die aktuelle Seite gerendert. Ein 500-Seiten-Dokument
  öffnet damit genauso schnell wie ein einseitiges.
- Vorschaubilder im Seiten-Bereich entstehen erst, wenn die Kachel in Sichtweite kommt, und
  werden zwischengespeichert — Umsortieren und Drehen lösen kein erneutes Rendern aus.
- Ein Rendervorgang wird abgebrochen, sobald weitergeblättert wird.
- Beim Umbauen eines Dokuments wird pro Quelldatei nur einmal kopiert, nicht pro Seite.

Gemessen mit einem Dokument aus 120 Seiten und rund 4000 Textfragmenten: Öffnen samt erster
Seite 0,4 s, Seitenwechsel 0,15 s, Neuaufbau aller 120 Seiten 0,16 s.

### Anmeldung

Ein Passwort aus `APP_PASSWORD`, verglichen in konstanter Zeit. Bei Erfolg wird ein signiertes
JWT in einem `HttpOnly`-Cookie gesetzt. Eine Middleware prüft jede Anfrage; API-Aufrufe ohne
gültige Anmeldung erhalten 401, Seitenaufrufe eine Weiterleitung zum Login. Kein Nutzerkonto,
keine Datenbank, kein Serverzustand.

Das Cookie trägt die Kennzeichnung `Secure` nur dann, wenn die Verbindung tatsächlich über
HTTPS läuft — nicht schon deshalb, weil die Anwendung im Produktionsmodus gestartet wurde. Der
Unterschied ist wichtig, sobald die App über eine Netzwerkadresse genutzt wird: Ein
`Secure`-Cookie verwirft der Browser über `http://192.168.x.x` kommentarlos, die Anmeldung
meldet Erfolg, und man landet ohne Fehlermeldung wieder auf dem Login.

Ohne Server (statische Fassung) gibt es keine Anmeldung — siehe
[Zwei Betriebsarten](#zwei-betriebsarten).

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
├── proxy.ts                   Zugangsschutz (nur Server-Betrieb)
├── app/
│   ├── page.tsx               Arbeitsbereich
│   ├── login/page.node.tsx    Anmeldung — ".node" = nur mit Server
│   └── api/                   alle Route Handler als route.node.ts
│       ├── auth/              Anmelden, Abmelden
│       ├── merge/ split/ organize/ edit/
│       │                      HTTP-Zugang zu denselben Funktionen,
│       │                      die im Browser laufen (für Skripte und Tests)
│       ├── convert/           Word ↔ PDF
│       └── capabilities/      Meldet, welche Zusatzprogramme da sind
├── lib/
│   ├── config.ts              Einstellungen aus der Umgebung
│   ├── auth.ts                Session-Cookie
│   ├── errors.ts              Eingabefehler von Serverfehlern trennen
│   ├── http.ts                Gemeinsame Bausteine der API-Routen
│   ├── pdf/                   läuft im Browser wie auf dem Server
│   │   ├── operations.ts      Zusammenführen, Teilen, Seiten, Textänderungen
│   │   ├── contentStream.ts   Originaltext aus dem Inhaltsstrom entfernen
│   │   ├── fonts.ts           Schriftzuordnung und Zeichenvorrat
│   │   └── types.ts           Gemeinsame Datentypen
│   ├── convert/
│   │   ├── types.ts           Datentypen der Textextraktion (ohne Importe)
│   │   ├── docxBuilder.ts     Word-Datei aus Textpositionen — auch im Browser
│   │   ├── libreoffice.ts     Word → PDF, inklusive Funktionsprüfung
│   │   ├── pdfToDocx.ts       PDF → Word auf dem Server (pdf2docx)
│   │   └── extract.ts         Text mit Position auslesen (Server)
│   └── client/
│       ├── engine.ts          Alle PDF-Vorgänge im Browser
│       ├── mode.ts            Läuft die App mit oder ohne Server?
│       ├── basePath.ts        Unterpfad für nachgeladene Dateien
│       ├── pdfjs.ts           pdf.js im Browser
│       ├── extractText.ts     Text mit Position auslesen (Browser)
│       ├── textLayer.ts       Textfragmente zu bearbeitbaren Feldern
│       ├── ocr.ts             Texterkennung
│       ├── colors.ts          Hintergrund- und Textfarbe messen
│       └── download.ts        Ergebnis herunterladen
└── components/                Oberfläche

scripts/
├── setup-env.mjs              Legt .env.local an (npm run setup)
├── share.mjs                  Startet die App und zeigt die Netzwerkadresse
├── build-static.mjs           Baut die Fassung ohne Server (npm run build:static)
├── copy-assets.mjs            Laufzeitdateien nach public/ (läuft automatisch)
├── fetch-langdata.mjs         Sprachdaten für den Offline-Betrieb
└── smoke.mjs                  Test über die echten Schnittstellen

.github/workflows/pages.yml    Veröffentlicht die Seite bei jedem Push
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

Die statische Fassung lässt sich so prüfen, wie ein Webserver sie ausliefert:

```bash
npm run build:static
npx serve out          # dann http://localhost:3000/PDF.me/
```

Weitere Prüfungen:

```bash
npm run typecheck
```

---

## Lizenz

MIT — siehe [LICENSE](LICENSE).
