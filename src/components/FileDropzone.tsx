"use client";

import { useCallback, useRef, useState } from "react";

/**
 * Datei-Auswahl per Klick oder Drag-and-Drop.
 * Bewusst ohne eigene Zustandslogik — die Dateien gehen direkt nach oben.
 */
export function FileDropzone({
  accept,
  multiple = false,
  label,
  hint,
  onFiles,
}: {
  accept: string;
  multiple?: boolean;
  label: string;
  hint?: string;
  onFiles: (files: File[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const handleFiles = useCallback(
    (list: FileList | null) => {
      if (!list || list.length === 0) return;
      const extensions = accept.split(",").map((e) => e.trim().toLowerCase());
      const files = Array.from(list).filter((file) =>
        extensions.some((extension) => file.name.toLowerCase().endsWith(extension)),
      );
      if (files.length > 0) onFiles(multiple ? files : [files[0]]);
    },
    [accept, multiple, onFiles],
  );

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        handleFiles(e.dataTransfer.files);
      }}
      onClick={() => inputRef.current?.click()}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
      }}
      className={`cursor-pointer rounded-xl border-2 border-dashed px-6 py-10 text-center transition ${
        dragging ? "border-accent bg-accent-soft" : "border-line bg-surface hover:border-accent/50"
      }`}
    >
      <p className="text-sm font-medium">{label}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        hidden
        onChange={(e) => {
          handleFiles(e.target.files);
          // Zurücksetzen, damit dieselbe Datei erneut gewählt werden kann.
          e.target.value = "";
        }}
      />
    </div>
  );
}
