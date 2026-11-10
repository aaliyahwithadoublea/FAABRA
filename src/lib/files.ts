"use client";

export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export type CellValue = string | number | null | undefined;

export interface SheetSpec {
  name: string;
  /** Optional heading lines printed above the table. */
  title?: string[];
  columns: { header: string; width?: number; money?: boolean }[];
  rows: CellValue[][];
  /** A final bold row, e.g. totals. */
  totals?: CellValue[];
}

/** Save one or more tables as an Excel workbook. */
export async function exportExcel(fileName: string, sheets: SheetSpec[]) {
  const { default: writeXlsxFile } = await import("write-excel-file/browser");
  const data = sheets.map((s) => {
    const cell = (value: CellValue, col: number, bold = false) => {
      if (value === null || value === undefined || value === "") return null;
      if (typeof value === "number") {
        return {
          value,
          type: Number,
          format: s.columns[col]?.money ? "#,##0.00" : "#,##0.###",
          ...(bold ? { fontWeight: "bold" as const } : {}),
        };
      }
      return { value, type: String, ...(bold ? { fontWeight: "bold" as const } : {}) };
    };
    const rows = [
      ...(s.title ?? []).map((line, i) => [{ value: line, type: String, fontWeight: i === 0 ? ("bold" as const) : undefined }]),
      ...(s.title?.length ? [[]] : []),
      s.columns.map((c) => ({
        value: c.header,
        type: String,
        fontWeight: "bold" as const,
        backgroundColor: "#E6F1EC",
        align: c.money ? ("right" as const) : undefined,
      })),
      ...s.rows.map((r) => r.map((v, i) => cell(v, i))),
      ...(s.totals ? [s.totals.map((v, i) => cell(v, i, true))] : []),
    ];
    return {
      data: rows,
      sheet: s.name.slice(0, 31),
      columns: s.columns.map((c) => ({ width: c.width ?? (c.money ? 16 : 20) })),
    };
  });
  await writeXlsxFile(data, { fontFamily: "Calibri", fontSize: 11 }).toFile(fileName);
}

/** Turn a DOM node into a PNG and share it (phone share sheet) or download it. */
export async function shareNodeAsImage(node: HTMLElement, fileName: string, title: string): Promise<"shared" | "downloaded"> {
  const { toBlob } = await import("html-to-image");
  const blob = await toBlob(node, { pixelRatio: 2.5, backgroundColor: "#ffffff", cacheBust: true });
  if (!blob) throw new Error("Could not create the image.");
  const file = new File([blob], fileName, { type: "image/png" });
  if (typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title });
      return "shared";
    } catch (error) {
      // The user closed the share sheet: nothing more to do.
      if (error instanceof DOMException && error.name === "AbortError") return "shared";
    }
  }
  downloadBlob(blob, fileName);
  return "downloaded";
}

/** Read an image file, shrink it to fit `max` pixels, and return a PNG data URL. */
export function imageToDataUrl(file: File, max = 256): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      canvas.getContext("2d")?.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("That file is not an image."));
    };
    img.src = url;
  });
}
