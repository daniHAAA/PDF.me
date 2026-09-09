"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Notice, Spinner } from "./ui";
import { sampleBackground, sampleTextColor } from "@/lib/client/colors";
import { recognizePage, releaseOcrWorker } from "@/lib/client/ocr";
import { buildEditableItems, textVolume, type EditableItem } from "@/lib/client/textLayer";
import { ApiError, postAndDownload } from "@/lib/client/download";
import { toFile, type LoadedDoc } from "@/lib/client/types";
import type { PageViewport } from "@/lib/client/pdfjs";
import type { TextEdit } from "@/lib/pdf/types";

const ZOOM_LEVELS = [0.75, 1, 1.25, 1.5, 2];
/** Weniger Zeichen als das auf einer Seite heisst: da ist kein Textlayer. */
const SCAN_THRESHOLD = 8;

export function EditPanel({ doc }: { doc: LoadedDoc }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewportRef = useRef<PageViewport | null>(null);

  const [pageNumber, setPageNumber] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [items, setItems] = useState<EditableItem[]>([]);
  const [rendering, setRendering] = useState(false);
  const [ocrStatus, setOcrStatus] = useState<string | null>(null);
  const [looksScanned, setLooksScanned] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveReport, setSaveReport] = useState<string | null>(null);

  // Änderungen überleben den Seitenwechsel, deshalb liegen sie ausserhalb der
  // Seitenzustände. Schlüssel ist die Item-ID.
  const [edits, setEdits] = useState<Map<string, TextEdit>>(new Map());

  /* ---------- Seite rendern ---------- */
  useEffect(() => {
    let cancelled = false;
    let renderTask: { cancel: () => void } | null = null;

    async function render() {
      setRendering(true);
      setError(null);
      try {
        const page = await doc.pdf.getPage(pageNumber);
        // Bildschirmauflösung berücksichtigen, sonst ist die Vorschau auf
        // Retina-Displays unscharf.
        const ratio = Math.min(window.devicePixelRatio || 1, 2);
        const viewport = page.getViewport({ scale: zoom * ratio });
        const canvas = canvasRef.current;
        if (!canvas || cancelled) return;

        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        // CSS-Grösse ohne Ratio: das Canvas ist intern feiner aufgelöst.
        canvas.style.width = `${Math.floor(viewport.width / ratio)}px`;
        canvas.style.height = `${Math.floor(viewport.height / ratio)}px`;

        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) throw new Error("Canvas nicht verfügbar.");

        const task = page.render({ canvas, canvasContext: context, viewport });
        renderTask = task;
        await task.promise;
        if (cancelled) return;

        viewportRef.current = viewport;
        const extracted = await buildEditableItems(page, viewport);
        if (cancelled) return;

        setItems(extracted);
        setLooksScanned(textVolume(extracted) < SCAN_THRESHOLD);
      } catch (caught) {
        // Ein abgebrochener Render ist kein Fehler, sondern der Normalfall beim
        // schnellen Blättern.
        const name = (caught as { name?: string })?.name;
        if (!cancelled && name !== "RenderingCancelledException") {
          setError(caught instanceof Error ? caught.message : "Seite konnte nicht geladen werden.");
        }
      } finally {
        if (!cancelled) setRendering(false);
      }
    }

    void render();
    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [doc, pageNumber, zoom]);

  // Beim Verlassen den OCR-Worker freigeben — er hält mehrere MB Sprachdaten.
  useEffect(() => () => void releaseOcrWorker(), []);

  // Dokumentwechsel setzt alles zurück.
  useEffect(() => {
    setPageNumber(1);
    setEdits(new Map());
    setItems([]);
  }, [doc]);

  /* ---------- Bearbeiten ---------- */
  const commitEdit = useCallback(
    (item: EditableItem, rawValue: string) => {
      const value = rawValue.replace(/\s+/g, " ").trim();
      const previous = edits.get(item.id);
      const current = previous?.text ?? item.original;
      if (value === current.trim()) return;

      const canvas = canvasRef.current;
      const context = canvas?.getContext("2d", { willReadFrequently: true });
      if (!context) return;

      // Farben genau jetzt aus dem gerenderten Bild lesen: nach einem
      // Seitenwechsel ist dieses Canvas weg.
      const background = sampleBackground(context, item.screen);
      const color = sampleTextColor(context, item.screen, background);

      const edit: TextEdit = {
        pageIndex: pageNumber - 1,
        box: {
          x: item.pdf.boxX,
          y: item.pdf.boxY,
          width: item.pdf.boxWidth,
          height: item.pdf.boxHeight,
        },
        baseline: { x: item.pdf.baselineX, y: item.pdf.baselineY },
        text: value,
        // Der Server prüft damit, ob der Originaltext wirklich verschwunden ist.
        originalText: item.original,
        fromOcr: item.source === "ocr",
        fontSize: item.pdf.fontSize,
        maxWidth: item.pdf.boxWidth,
        fontFamily: item.fontFamily,
        bold: item.bold,
        italic: item.italic,
        color,
        background,
        rotation: item.pdf.rotationDeg,
      };

      setEdits((old) => new Map(old).set(item.id, edit));
    },
    [edits, pageNumber],
  );

  const resetEdit = useCallback((id: string) => {
    setEdits((old) => {
      const next = new Map(old);
      next.delete(id);
      return next;
    });
  }, []);

  /* ---------- OCR ---------- */
  const runOcr = useCallback(async () => {
    const canvas = canvasRef.current;
    const viewport = viewportRef.current;
    if (!canvas || !viewport) return;

    setOcrStatus("Sprachdaten werden geladen …");
    setError(null);
    try {
      const recognized = await recognizePage(canvas, viewport, pageNumber, {
        onProgress: (status, progress) => {
          setOcrStatus(`${status} ${Math.round(progress * 100)} %`);
        },
      });
      if (recognized.length === 0) {
        setError("Es wurde kein Text erkannt. Höhere Zoomstufe wählen und erneut versuchen.");
      } else {
        // Erkannten Text zusätzlich zum vorhandenen Layer anzeigen: manche
        // Scans enthalten beides (Bild plus dürftiger Textlayer).
        setItems((old) => [...old, ...recognized]);
        setLooksScanned(false);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Texterkennung fehlgeschlagen.");
    } finally {
      setOcrStatus(null);
    }
  }, [pageNumber]);

  /* ---------- Speichern ---------- */
  const save = useCallback(async () => {
    if (edits.size === 0) return;
    setSaving(true);
    setError(null);
    setSaveReport(null);
    try {
      const form = new FormData();
      form.append("file", toFile(doc));
      form.append("edits", JSON.stringify([...edits.values()]));
      const { headers } = await postAndDownload("/api/edit", form, "bearbeitet.pdf");

      // Ehrliche Rückmeldung: an manchen Stellen lässt sich der Originaltext
      // nicht eindeutig zuordnen und bleibt unter der Abdeckung stehen.
      const covered = Number(headers.get("X-Edit-Covered") ?? 0);
      const removed = Number(headers.get("X-Edit-Removed") ?? 0);
      setSaveReport(
        covered > 0
          ? `Achtung: Bei ${covered} von ${removed + covered} geänderten Textstellen liess sich der ` +
              `Originaltext nicht eindeutig im Dokument zuordnen. Dort ist er überdeckt und damit ` +
              `unsichtbar, technisch aber noch enthalten — per Textsuche oder Kopieren auffindbar. ` +
              `Für vertrauliche Inhalte diese Stellen prüfen.`
          : null,
      );
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Speichern fehlgeschlagen.");
    } finally {
      setSaving(false);
    }
  }, [doc, edits]);

  const editsOnPage = [...edits.values()].filter((e) => e.pageIndex === pageNumber - 1).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface px-4 py-3">
        <Button variant="ghost" onClick={() => setPageNumber((p) => Math.max(1, p - 1))} disabled={pageNumber <= 1}>
          ←
        </Button>
        <span className="text-xs text-muted">
          Seite{" "}
          <input
            type="number"
            min={1}
            max={doc.pageCount}
            value={pageNumber}
            onChange={(e) => {
              const value = Number(e.target.value);
              if (value >= 1 && value <= doc.pageCount) setPageNumber(value);
            }}
            className="w-14 rounded border border-line px-1.5 py-1 text-center text-xs"
          />{" "}
          von {doc.pageCount}
        </span>
        <Button
          variant="ghost"
          onClick={() => setPageNumber((p) => Math.min(doc.pageCount, p + 1))}
          disabled={pageNumber >= doc.pageCount}
        >
          →
        </Button>

        <span className="mx-1 h-5 w-px bg-line" />

        <select
          value={zoom}
          onChange={(e) => setZoom(Number(e.target.value))}
          className="rounded border border-line px-2 py-1.5 text-xs"
        >
          {ZOOM_LEVELS.map((level) => (
            <option key={level} value={level}>
              {Math.round(level * 100)} %
            </option>
          ))}
        </select>

        <Button variant="ghost" onClick={runOcr} disabled={Boolean(ocrStatus) || rendering}>
          Text erkennen (OCR)
        </Button>

        <div className="ml-auto flex items-center gap-3">
          {rendering && <Spinner label="rendert …" />}
          {ocrStatus && <Spinner label={ocrStatus} />}
          {edits.size > 0 && (
            <span className="text-xs text-muted">
              {edits.size} Änderung{edits.size === 1 ? "" : "en"}
              {editsOnPage > 0 && ` (${editsOnPage} auf dieser Seite)`}
            </span>
          )}
          <Button onClick={save} disabled={edits.size === 0 || saving}>
            {saving ? "Speichert …" : "Als PDF speichern"}
          </Button>
        </div>
      </div>

      {error && <Notice tone="error">{error}</Notice>}
      {saveReport && <Notice tone="warn">{saveReport}</Notice>}

      {looksScanned && (
        <Notice tone="warn">
          Auf dieser Seite ist kein durchsuchbarer Text hinterlegt — vermutlich ein Scan.
          Mit „Text erkennen (OCR)“ werden die Wörter erkannt und bearbeitbar. Der erste Lauf lädt
          einmalig die Sprachdaten (rund 15 MB) und dauert etwas länger.
        </Notice>
      )}

      <Notice>
        Text anklicken und überschreiben. Leeren löscht ihn. Änderungen sind gelb markiert und
        werden erst beim Speichern in eine neue PDF-Datei geschrieben — das Original bleibt unberührt.
      </Notice>

      <div className="overflow-auto rounded-xl border border-line bg-canvas p-6">
        <div className="page-shell relative mx-auto w-fit shadow-sm">
          <canvas ref={canvasRef} className="block bg-white" />

          {/* Overlay: eine bearbeitbare Box je Textfragment, exakt darüber. */}
          <div className="absolute inset-0" style={{ zoom: 1 }}>
            {items.map((item) => {
              const ratio = Math.min(window.devicePixelRatio || 1, 2);
              const edit = edits.get(item.id);
              return (
                <div
                  key={item.id}
                  contentEditable
                  suppressContentEditableWarning
                  spellCheck={false}
                  data-edited={edit ? "true" : "false"}
                  className="text-box"
                  style={{
                    left: item.screen.left / ratio,
                    top: item.screen.top / ratio,
                    width: Math.max(item.screen.width / ratio, 6),
                    height: item.screen.height / ratio,
                    fontSize: item.screen.fontSize / ratio,
                    lineHeight: `${item.screen.height / ratio}px`,
                    transform: item.screen.angleDeg ? `rotate(${item.screen.angleDeg}deg)` : undefined,
                    fontFamily:
                      item.fontFamily === "serif"
                        ? "Georgia, serif"
                        : item.fontFamily === "mono"
                          ? "ui-monospace, monospace"
                          : "system-ui, sans-serif",
                    fontWeight: item.bold ? 600 : 400,
                    fontStyle: item.italic ? "italic" : "normal",
                    // Unbearbeitet: unsichtbar, das gerenderte Original zeigt sich.
                    // Bearbeitet: mit den gemessenen Farben überdeckt — dieselbe
                    // Kombination, die der Server später ins PDF schreibt. So ist
                    // die Vorschau ehrlich.
                    color: edit ? cssColor(edit.color) : "transparent",
                    backgroundColor: edit ? cssColor(edit.background) : undefined,
                  }}
                  onBlur={(e) => commitEdit(item, e.currentTarget.textContent ?? "")}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      e.currentTarget.textContent = item.original;
                      resetEdit(item.id);
                      e.currentTarget.blur();
                    }
                    if (e.key === "Enter") {
                      e.preventDefault();
                      e.currentTarget.blur();
                    }
                  }}
                  // Inhalt bewusst nur einmal setzen: React darf hier nicht
                  // nachrendern, sonst springt der Cursor beim Tippen.
                  dangerouslySetInnerHTML={{ __html: escapeHtml(edit?.text ?? item.original) }}
                />
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function cssColor(color: { r: number; g: number; b: number }): string {
  const channel = (value: number) => Math.round(Math.min(1, Math.max(0, value)) * 255);
  return `rgb(${channel(color.r)}, ${channel(color.g)}, ${channel(color.b)})`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
