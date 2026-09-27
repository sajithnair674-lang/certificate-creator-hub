// Shared helpers for the uploaded certificate design (image or PDF).

export type FieldKey = "name" | "course" | "date" | "reg";

export type FieldPos = {
  x: number; // % of width from the left
  y: number; // % of height from the top
  size: number; // font size in PDF points
};

export type DesignLayout = Record<FieldKey, FieldPos>;

export type DesignInfo = {
  url: string;
  mime: string;
  fileName: string;
  layout: DesignLayout;
};

export const DEFAULT_LAYOUT: DesignLayout = {
  name: { x: 50, y: 40, size: 40 },
  course: { x: 50, y: 54, size: 20 },
  date: { x: 50, y: 87, size: 12 },
  reg: { x: 50, y: 91, size: 12 },
};

export const FIELD_LABELS: Record<FieldKey, string> = {
  name: "Student name",
  course: "Course",
  date: "Issue date",
  reg: "Register no.",
};

const A4_RATIO = 297 / 210; // landscape

export function normalizeLayout(raw: unknown): DesignLayout {
  const out: DesignLayout = JSON.parse(JSON.stringify(DEFAULT_LAYOUT));
  if (raw && typeof raw === "object") {
    for (const key of Object.keys(DEFAULT_LAYOUT) as FieldKey[]) {
      const v = (raw as Record<string, unknown>)[key];
      if (v && typeof v === "object") {
        const p = v as Record<string, unknown>;
        const n = (x: unknown, fallback: number) =>
          typeof x === "number" && Number.isFinite(x) ? x : fallback;
        out[key] = {
          x: n(p.x, out[key].x),
          y: n(p.y, out[key].y),
          size: n(p.size, out[key].size),
        };
      }
    }
  }
  return out;
}

/**
 * Loads the design file (image or PDF first page) and renders it onto a
 * canvas cropped to the A4 landscape ratio, returning a JPEG data URL.
 */
export async function loadDesignAsDataUrl(
  url: string,
  mime: string,
): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Could not load the design file");
  const bytes = await res.arrayBuffer();

  const cover = (source: CanvasImageSource, sw: number, sh: number) => {
    const canvas = document.createElement("canvas");
    const targetW = Math.max(sw, 1200);
    canvas.width = Math.round(targetW);
    canvas.height = Math.round(targetW / A4_RATIO);
    // "cover" crop: scale to fill, then center-crop
    const scale = Math.max(canvas.width / sw, canvas.height / sh);
    const dw = sw * scale;
    const dh = sh * scale;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas not supported");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(
      source,
      (canvas.width - dw) / 2,
      (canvas.height - dh) / 2,
      dw,
      dh,
    );
    return canvas.toDataURL("image/jpeg", 0.92);
  };

  if (mime === "application/pdf") {
    const pdfjs = await import("pdfjs-dist");
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/build/pdf.worker.min.mjs",
      import.meta.url,
    ).toString();
    const pdf = await pdfjs.getDocument({ data: bytes }).promise;
    const page = await pdf.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(2400 / base.width, 2400 / base.height);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas not supported");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport }).promise;
    return cover(canvas, canvas.width, canvas.height);
  }

  const blob = new Blob([bytes], { type: mime || "image/png" });
  const objectUrl = URL.createObjectURL(blob);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Not a valid image file"));
      el.src = objectUrl;
    });
    return cover(img, img.naturalWidth, img.naturalHeight);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
