"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, EmptyState, Notice } from "./ui";
import { FileDropzone } from "./FileDropzone";
import { PageThumbnail } from "./PageThumbnail";
import { downloadResult } from "@/lib/client/download";
import { organizeFiles } from "@/lib/client/engine";
import { toFile, type LoadedDoc } from "@/lib/client/types";

/** Eine Seite in der Zielreihenfolge. key bleibt über Umsortieren hinweg stabil. */
interface Slot {
  key: string;
  sourceIndex: number;
  pageIndex: number;
  rotation: number;
}

function buildSlots(docs: LoadedDoc[]): Slot[] {
  return docs.flatMap((doc, sourceIndex) =>
    Array.from({ length: doc.pageCount }, (_, pageIndex) => ({
      key: `${doc.id}-${pageIndex}`,
      sourceIndex,
      pageIndex,
      rotation: 0,
    })),
  );
}

export function OrganizePanel({
  doc,
  onOpenFiles,
}: {
  doc: LoadedDoc;
  onOpenFiles: (files: File[]) => Promise<LoadedDoc[]>;
}) {
  // Quellen: das aktive Dokument plus alles, was zusätzlich eingefügt wurde.
  const [sources, setSources] = useState<LoadedDoc[]>([doc]);
  const [slots, setSlots] = useState<Slot[]>(() => buildSlots([doc]));
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Dokumentwechsel bedeutet: von vorne anfangen.
  useEffect(() => {
    setSources([doc]);
    setSlots(buildSlots([doc]));
    setError(null);
  }, [doc]);

  const move = useCallback((from: number, to: number) => {
    setSlots((old) => {
      if (from === to || from < 0 || to < 0 || from >= old.length || to >= old.length) return old;
      const next = [...old];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }, []);

  const rotate = useCallback((key: string, delta: number) => {
    setSlots((old) =>
      old.map((slot) =>
        slot.key === key ? { ...slot, rotation: (((slot.rotation + delta) % 360) + 360) % 360 } : slot,
      ),
    );
  }, []);

  const remove = useCallback((key: string) => {
    setSlots((old) => old.filter((slot) => slot.key !== key));
  }, []);

  const addSource = useCallback(
    async (files: File[]) => {
      const loaded = await onOpenFiles(files);
      setSources((oldSources) => {
        const baseIndex = oldSources.length;
        setSlots((oldSlots) => [
          ...oldSlots,
          ...loaded.flatMap((added, offset) =>
            Array.from({ length: added.pageCount }, (_, pageIndex) => ({
              key: `${added.id}-${pageIndex}`,
              sourceIndex: baseIndex + offset,
              pageIndex,
              rotation: 0,
            })),
          ),
        ]);
        return [...oldSources, ...loaded];
      });
    },
    [onOpenFiles],
  );

  const save = useCallback(async () => {
    if (slots.length === 0) {
      setError("Es ist keine Seite mehr übrig.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      // Reihenfolge der Dateien muss zu sourceIndex passen.
      downloadResult(
        await organizeFiles(
          sources.map(toFile),
          slots.map((slot) => ({
            sourceIndex: slot.sourceIndex,
            pageIndex: slot.pageIndex,
            rotation: slot.rotation,
          })),
        ),
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Speichern fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  }, [slots, sources]);

  const removedCount = buildSlots(sources).length - slots.length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3">
        <span className="text-xs text-muted">
          {slots.length} Seite{slots.length === 1 ? "" : "n"}
          {removedCount > 0 && ` · ${removedCount} entfernt`}
          {sources.length > 1 && ` · aus ${sources.length} Dateien`}
        </span>
        <div className="ml-auto flex gap-2">
          <Button variant="ghost" onClick={() => setSlots(buildSlots(sources))}>
            Zurücksetzen
          </Button>
          <Button onClick={save} disabled={busy || slots.length === 0}>
            {busy ? "Speichert …" : "Als PDF speichern"}
          </Button>
        </div>
      </div>

      {error && <Notice tone="error">{error}</Notice>}

      <Notice>
        Kacheln zum Umsortieren ziehen. Über die Schaltflächen einer Kachel wird gedreht oder
        gelöscht. Seiten aus weiteren PDFs lassen sich unten anfügen und dann an die gewünschte
        Stelle ziehen.
      </Notice>

      {slots.length === 0 ? (
        <EmptyState>Alle Seiten entfernt. Über „Zurücksetzen“ kommen sie zurück.</EmptyState>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
          {slots.map((slot, index) => (
            <div
              key={slot.key}
              draggable
              onDragStart={() => setDragIndex(index)}
              onDragEnter={() => setOverIndex(index)}
              onDragOver={(e) => e.preventDefault()}
              onDragEnd={() => {
                setDragIndex(null);
                setOverIndex(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (dragIndex !== null) move(dragIndex, index);
                setDragIndex(null);
                setOverIndex(null);
              }}
              className={`group relative cursor-grab rounded-lg border bg-canvas p-2 transition active:cursor-grabbing ${
                overIndex === index && dragIndex !== index
                  ? "border-accent ring-2 ring-accent-soft"
                  : "border-line"
              } ${dragIndex === index ? "opacity-40" : ""}`}
            >
              <PageThumbnail
                pdf={sources[slot.sourceIndex].pdf}
                cacheKey={slot.key}
                pageIndex={slot.pageIndex}
                rotation={slot.rotation}
              />

              <div className="mt-2 flex items-center justify-between">
                <span className="text-[11px] text-muted">
                  {index + 1}
                  {sources.length > 1 && (
                    <span className="ml-1 opacity-60">· D{slot.sourceIndex + 1}</span>
                  )}
                </span>
                <div className="flex gap-0.5 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
                  <IconButton title="Nach links drehen" onClick={() => rotate(slot.key, -90)}>
                    ↺
                  </IconButton>
                  <IconButton title="Nach rechts drehen" onClick={() => rotate(slot.key, 90)}>
                    ↻
                  </IconButton>
                  <IconButton title="Seite entfernen" onClick={() => remove(slot.key)} danger>
                    ✕
                  </IconButton>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <FileDropzone
        accept=".pdf"
        multiple
        label="Seiten aus weiteren PDFs anfügen"
        hint="Die Seiten landen am Ende und lassen sich von dort an die gewünschte Stelle ziehen."
        onFiles={(files) => void addSource(files)}
      />
    </div>
  );
}

function IconButton({
  children,
  onClick,
  title,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`rounded px-1.5 py-0.5 text-xs leading-none transition hover:bg-white ${
        danger ? "text-red-600" : "text-muted hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}
