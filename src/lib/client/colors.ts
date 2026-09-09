"use client";

import type { Rgb } from "@/lib/pdf/types";

/**
 * Farbanalyse auf dem gerenderten Canvas.
 *
 * Damit eine Textänderung unsichtbar bleibt, müssen zwei Farben stimmen:
 * die Hintergrundfarbe (womit übermalt wird) und die Textfarbe (womit neu
 * geschrieben wird). Beides wird aus dem Bild gelesen, statt Weiss und Schwarz
 * anzunehmen — sonst hinterlässt jede Änderung auf farbigem Grund oder in einem
 * Scan einen weissen Kasten.
 */

export interface ScreenBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

function toRgb(r: number, g: number, b: number): Rgb {
  return { r: r / 255, g: g / 255, b: b / 255 };
}

function luminance(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Hintergrundfarbe: häufigste Farbe in einem schmalen Ring um die Textbox.
 * Der Ring liegt neben dem Text, enthält also den Untergrund und nicht die
 * Glyphen selbst.
 */
export function sampleBackground(
  ctx: CanvasRenderingContext2D,
  box: ScreenBox,
  fallback: Rgb = { r: 1, g: 1, b: 1 },
): Rgb {
  const margin = Math.max(2, Math.round(box.height * 0.35));
  const left = Math.max(0, Math.floor(box.left - margin));
  const top = Math.max(0, Math.floor(box.top - margin));
  const right = Math.min(ctx.canvas.width, Math.ceil(box.left + box.width + margin));
  const bottom = Math.min(ctx.canvas.height, Math.ceil(box.top + box.height + margin));
  if (right <= left || bottom <= top) return fallback;

  const data = ctx.getImageData(left, top, right - left, bottom - top).data;
  const innerLeft = box.left - left;
  const innerTop = box.top - top;
  const innerRight = innerLeft + box.width;
  const innerBottom = innerTop + box.height;
  const width = right - left;

  // Farben grob quantisieren (4er-Schritte), damit Kompressionsrauschen und
  // Kantenglättung nicht jeden Pixel zu einer eigenen "Farbe" machen.
  const histogram = new Map<number, { count: number; r: number; g: number; b: number }>();

  for (let y = 0; y < bottom - top; y++) {
    for (let x = 0; x < width; x++) {
      const insideText = x >= innerLeft && x <= innerRight && y >= innerTop && y <= innerBottom;
      if (insideText) continue;

      const offset = (y * width + x) * 4;
      const r = data[offset];
      const g = data[offset + 1];
      const b = data[offset + 2];
      const key = ((r >> 2) << 12) | ((g >> 2) << 6) | (b >> 2);

      const bucket = histogram.get(key);
      if (bucket) {
        bucket.count++;
        bucket.r += r;
        bucket.g += g;
        bucket.b += b;
      } else {
        histogram.set(key, { count: 1, r, g, b });
      }
    }
  }

  let best: { count: number; r: number; g: number; b: number } | null = null;
  for (const bucket of histogram.values()) {
    if (!best || bucket.count > best.count) best = bucket;
  }
  if (!best) return fallback;

  return toRgb(best.r / best.count, best.g / best.count, best.b / best.count);
}

/**
 * Textfarbe: die dunkelste (bzw. vom Hintergrund am weitesten entfernte) Farbe
 * innerhalb der Box. Bei normalem Text sind das die Glyphen.
 */
export function sampleTextColor(
  ctx: CanvasRenderingContext2D,
  box: ScreenBox,
  background: Rgb,
  fallback: Rgb = { r: 0, g: 0, b: 0 },
): Rgb {
  const left = Math.max(0, Math.floor(box.left));
  const top = Math.max(0, Math.floor(box.top));
  const right = Math.min(ctx.canvas.width, Math.ceil(box.left + box.width));
  const bottom = Math.min(ctx.canvas.height, Math.ceil(box.top + box.height));
  if (right <= left || bottom <= top) return fallback;

  const data = ctx.getImageData(left, top, right - left, bottom - top).data;
  const backgroundLuminance = luminance(background.r * 255, background.g * 255, background.b * 255);

  let bestDistance = -1;
  let picked: Rgb | null = null;

  for (let offset = 0; offset < data.length; offset += 4) {
    const r = data[offset];
    const g = data[offset + 1];
    const b = data[offset + 2];
    const distance = Math.abs(luminance(r, g, b) - backgroundLuminance);
    if (distance > bestDistance) {
      bestDistance = distance;
      picked = toRgb(r, g, b);
    }
  }

  // Zu geringer Kontrast heisst: in der Box war gar kein Text (etwa nur ein
  // Leerzeichen). Dann lieber den Vorgabewert nehmen.
  return bestDistance > 25 && picked ? picked : fallback;
}
