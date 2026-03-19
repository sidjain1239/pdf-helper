export async function fileToBytes(file) {
  return new Uint8Array(await file.arrayBuffer());
}

export function toUint8(data) {
  if (data instanceof Uint8Array) return data;
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  return new Uint8Array(data || []);
}

export function bytesToHuman(size) {
  if (!size && size !== 0) return "-";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(2)} KB`;
  return `${(size / (1024 * 1024)).toFixed(2)} MB`;
}

export function downloadBytes(bytes, fileName, mime = "application/pdf") {
  const safe = toUint8(bytes);
  if (!safe.length) {
    throw new Error("Nothing to download");
  }
  const blob = new Blob([safe], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Delay revoke to avoid 0 B files in some browsers when download starts slowly.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function parseRange(rangeText, maxPages) {
  const m = /^\s*(\d+)\s*-\s*(\d+)\s*$/.exec(rangeText || "");
  if (!m) return [];
  const start = Math.max(1, Number(m[1]));
  const end = Math.min(maxPages, Number(m[2]));
  if (end < start) return [];
  const out = [];
  for (let i = start; i <= end; i += 1) out.push(i - 1);
  return out;
}

export function parseList(listText, maxPages) {
  return (listText || "")
    .split(",")
    .map((v) => Number(v.trim()))
    .filter((n) => n >= 1 && n <= maxPages)
    .map((n) => n - 1);
}

export async function loadPdfJsLib() {
  const lib = await import("pdfjs-dist/legacy/build/pdf.mjs");
  lib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${lib.version}/pdf.worker.min.mjs`;
  return lib;
}

export async function renderPdfPage(pdfjsLib, bytes, pageNumber, scale = 1.2) {
  const doc = await pdfjsLib.getDocument({ data: toUint8(bytes) }).promise;
  const page = await doc.getPage(pageNumber);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  await page.render({ canvasContext: ctx, viewport }).promise;
  return { dataUrl: canvas.toDataURL("image/png"), width: canvas.width, height: canvas.height, pageCount: doc.numPages };
}
