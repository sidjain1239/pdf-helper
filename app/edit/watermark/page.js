"use client";

import { useEffect, useRef, useState } from "react";
import { PDFDocument, StandardFonts, degrees, rgb } from "pdf-lib";
import { downloadBytes, fileToBytes, loadPdfJsLib } from "../../lib/pdfClient";

const FONT_OPTIONS = [
  { label: "Helvetica", value: "Helvetica" },
  { label: "Helvetica Bold", value: "HelveticaBold" },
  { label: "Times Roman", value: "TimesRoman" },
  { label: "Times Bold", value: "TimesRomanBold" },
  { label: "Courier", value: "Courier" },
  { label: "Courier Bold", value: "CourierBold" }
];

function hexToRgb01(hex) {
  const clean = (hex || "#ff2e2e").replace("#", "");
  const value = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;
  const num = Number.parseInt(value, 16);
  const r = ((num >> 16) & 255) / 255;
  const g = ((num >> 8) & 255) / 255;
  const b = (num & 255) / 255;
  return rgb(r, g, b);
}

function fontByName(name) {
  if (name === "HelveticaBold") return StandardFonts.HelveticaBold;
  if (name === "TimesRoman") return StandardFonts.TimesRoman;
  if (name === "TimesRomanBold") return StandardFonts.TimesRomanBold;
  if (name === "Courier") return StandardFonts.Courier;
  if (name === "CourierBold") return StandardFonts.CourierBold;
  return StandardFonts.Helvetica;
}

function fontForCanvas(name) {
  if (name === "HelveticaBold") return "bold Arial";
  if (name === "TimesRoman") return "Times New Roman";
  if (name === "TimesRomanBold") return "bold Times New Roman";
  if (name === "Courier") return "Courier New";
  if (name === "CourierBold") return "bold Courier New";
  return "Arial";
}

function hexToRgbInt(hex) {
  const clean = (hex || "#ff2e2e").replace("#", "");
  const value = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;
  const num = Number.parseInt(value, 16);
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255
  };
}

function repeatShiftFromTextMetrics(textWidth, fontSize, angleDeg) {
  const textHeight = Math.max(10, fontSize * 1.2);
  const delta = ((Number(angleDeg) || -25) + 45) * (Math.PI / 180);
  const projectedAlongDiagonal = Math.abs(textWidth * Math.cos(delta)) + Math.abs(textHeight * Math.sin(delta));
  const diagonalPadding = Math.max(14, fontSize * 0.35);
  const diagonalDistance = projectedAlongDiagonal + diagonalPadding;
  return diagonalDistance / Math.SQRT2;
}

function repeatOffsetByIndex(i, shiftStep) {
  if (i === 0) return 0;
  const level = Math.ceil(i / 2);
  const direction = i % 2 === 1 ? -1 : 1;
  return direction * level * shiftStep;
}

export default function WatermarkPage() {
  const previewCanvasRef = useRef(null);
  const [pdfBytes, setPdfBytes] = useState(null);
  const [watermarkedBytes, setWatermarkedBytes] = useState(null);
  const [pdfjsLib, setPdfjsLib] = useState(null);
  const [fileName, setFileName] = useState("No file selected");
  const [status, setStatus] = useState("Ready");

  const [watermarkText, setWatermarkText] = useState("CONFIDENTIAL");
  const [fontName, setFontName] = useState("HelveticaBold");
  const [fontSize, setFontSize] = useState(56);
  const [angle, setAngle] = useState(-25);
  const [colorHex, setColorHex] = useState("#ff2e2e");
  const [opacity, setOpacity] = useState(0.22);
  const [repeatCount, setRepeatCount] = useState(1);
  const [currentPageOnly, setCurrentPageOnly] = useState(false);
  const [targetPage, setTargetPage] = useState(1);

  useEffect(() => {
    async function setup() {
      const lib = await loadPdfJsLib();
      setPdfjsLib(lib);
    }
    setup();
  }, []);

  useEffect(() => {
    if (!pdfBytes || !pdfjsLib || !previewCanvasRef.current) return;

    let cancelled = false;

    async function renderPreview() {
      try {
        const safeBytes = new Uint8Array(pdfBytes);
        const doc = await pdfjsLib.getDocument({ data: safeBytes, disableWorker: true }).promise;
        if (cancelled) return;

        const requestedPage = currentPageOnly ? Number(targetPage) || 1 : 1;
        const pageNo = Math.max(1, Math.min(doc.numPages, requestedPage));
        const page = await doc.getPage(pageNo);
        const viewport = page.getViewport({ scale: 0.9 });

        const canvas = previewCanvasRef.current;
        const ctx = canvas.getContext("2d");
        canvas.width = viewport.width;
        canvas.height = viewport.height;

        await page.render({ canvasContext: ctx, viewport }).promise;
        if (cancelled) return;

        const { r, g, b } = hexToRgbInt(colorHex);
        const safeRepeat = Math.max(1, Number(repeatCount) || 1);
        const safeFontSize = Number(fontSize) || 56;
        const safeAngle = Number(angle) || -25;
        const safeOpacity = Number(opacity) || 0.22;
        const safeText = watermarkText || "CONFIDENTIAL";

        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${safeOpacity})`;
        ctx.textBaseline = "alphabetic";
        ctx.font = `${safeFontSize}px ${fontForCanvas(fontName)}`;
        const textWidth = Math.max(10, ctx.measureText(safeText).width);
        const shiftStep = repeatShiftFromTextMetrics(textWidth, safeFontSize, safeAngle);

        for (let i = 0; i < safeRepeat; i += 1) {
          const shift = repeatOffsetByIndex(i, shiftStep);
          const x = canvas.width * 0.12 + shift;
          const y = canvas.height * 0.55 + shift;

          ctx.save();
          ctx.translate(x, y);
          ctx.rotate((safeAngle * Math.PI) / 180);
          ctx.fillText(safeText, 0, 0);
          ctx.restore();
        }
      } catch {
        // Keep preview non-blocking and avoid noisy UI status changes.
      }
    }

    renderPreview();
    return () => {
      cancelled = true;
    };
  }, [pdfBytes, pdfjsLib, watermarkText, fontName, fontSize, angle, colorHex, opacity, repeatCount, currentPageOnly, targetPage]);

  async function onUpload(fileList) {
    const file = Array.from(fileList || []).find((f) => f.name.toLowerCase().endsWith(".pdf"));
    if (!file) return;
    const bytes = await fileToBytes(file);
    setPdfBytes(bytes);
    setWatermarkedBytes(null);
    setFileName(file.name);
    setStatus("PDF loaded");
  }

  async function generateWatermarkedBytes(baseBytes) {
    if (!baseBytes) return null;
    if (!watermarkText.trim()) return null;

    const pdf = await PDFDocument.load(baseBytes);
    const font = await pdf.embedFont(fontByName(fontName));
    const color = hexToRgb01(colorHex);

    const pageIndices = currentPageOnly
      ? [Math.max(0, Math.min(pdf.getPageCount() - 1, Number(targetPage) - 1))]
      : pdf.getPageIndices();

    pageIndices.forEach((pageIndex) => {
      const page = pdf.getPage(pageIndex);
      const { width, height } = page.getSize();
      const safeRepeat = Math.max(1, Number(repeatCount) || 1);
      const safeFontSize = Number(fontSize) || 56;
      const safeAngle = Number(angle) || -25;
      const safeOpacity = Number(opacity) || 0.22;
      const safeText = watermarkText || "CONFIDENTIAL";
      const textWidth = Math.max(10, font.widthOfTextAtSize(safeText, safeFontSize));
      const shiftStep = repeatShiftFromTextMetrics(textWidth, safeFontSize, safeAngle);

      for (let i = 0; i < safeRepeat; i += 1) {
        const shift = repeatOffsetByIndex(i, shiftStep);
        page.drawText(safeText, {
          x: width * 0.12 + shift,
          // PDF Y-axis grows upward, opposite of canvas preview.
          y: height * 0.55 - shift,
          size: safeFontSize,
          // Match preview tilt direction: canvas and PDF use different coordinate orientation.
          rotate: degrees(-safeAngle),
          font,
          color,
          opacity: safeOpacity
        });
      }
    });

    return pdf.save({ useObjectStreams: true });
  }

  useEffect(() => {
    if (!pdfBytes) return;
    let cancelled = false;

    const timer = setTimeout(async () => {
      try {
        setStatus("Applying watermark automatically...");
        const result = await generateWatermarkedBytes(pdfBytes);
        if (cancelled) return;
        setWatermarkedBytes(result);
        setStatus(result ? "Watermark auto-applied" : "Enter watermark text to generate output");
      } catch (error) {
        if (!cancelled) setStatus(`Watermark failed: ${error.message}`);
      }
    }, 220);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [pdfBytes, watermarkText, fontName, fontSize, angle, colorHex, opacity, repeatCount, currentPageOnly, targetPage]);

  function downloadResult() {
    if (!watermarkedBytes) return;
    const outName = fileName.replace(/\.pdf$/i, "") + "-watermarked.pdf";
    downloadBytes(watermarkedBytes, outName, "application/pdf");
    setStatus(`Downloaded ${outName}`);
  }

  return (
    <main className="mx-auto max-w-[1400px] p-4 md:p-6">
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-[370px_minmax(0,1fr)]">
        <aside className="glass rounded-2xl p-4">
          <h1 className="text-xl font-semibold">Watermark Studio</h1>
          <p className="mt-1 text-xs text-neutral-300">Dedicated watermark page with advanced controls.</p>

          <input
            type="file"
            accept=".pdf"
            className="mt-3 w-full rounded-lg p-2 text-xs"
            onChange={(e) => onUpload(e.target.files)}
          />

          <input
            className="mt-3 w-full rounded-lg p-2"
            value={watermarkText}
            onChange={(e) => setWatermarkText(e.target.value)}
            placeholder="Watermark text"
          />

          <label className="mt-3 block text-xs text-neutral-300">Font</label>
          <select value={fontName} onChange={(e) => setFontName(e.target.value)} className="mt-1 w-full rounded-lg p-2">
            {FONT_OPTIONS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-neutral-300">Font Size</label>
              <input
                type="number"
                min="8"
                max="180"
                value={fontSize}
                onChange={(e) => setFontSize(Number(e.target.value))}
                className="mt-1 w-full rounded-lg p-2"
              />
            </div>
            <div>
              <label className="text-xs text-neutral-300">Angle</label>
              <input
                type="number"
                min="-180"
                max="180"
                value={angle}
                onChange={(e) => setAngle(Number(e.target.value))}
                className="mt-1 w-full rounded-lg p-2"
              />
            </div>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-neutral-300">Color</label>
              <input type="color" value={colorHex} onChange={(e) => setColorHex(e.target.value)} className="mt-1 h-10 w-full rounded" />
            </div>
            <div>
              <label className="text-xs text-neutral-300">Repeat (number)</label>
              <input
                type="number"
                min="1"
                max="12"
                value={repeatCount}
                onChange={(e) => setRepeatCount(Number(e.target.value))}
                className="mt-1 w-full rounded-lg p-2"
              />
            </div>
          </div>

          <label className="mt-3 block text-xs text-neutral-300">Opacity: {Number(opacity).toFixed(2)}</label>
          <input
            type="range"
            min="0.05"
            max="1"
            step="0.01"
            value={opacity}
            onChange={(e) => setOpacity(Number(e.target.value))}
            className="w-full"
          />

          <div className="mt-3 rounded-lg bg-black/30 p-3 text-xs">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={currentPageOnly}
                onChange={(e) => setCurrentPageOnly(e.target.checked)}
              />
              Apply only to one page
            </label>
            {currentPageOnly ? (
              <input
                type="number"
                min="1"
                value={targetPage}
                onChange={(e) => setTargetPage(Number(e.target.value))}
                className="mt-2 w-full rounded-lg p-2"
                placeholder="Page number"
              />
            ) : null}
          </div>

          <button className="neon-btn mt-2 w-full rounded-lg px-3 py-2" onClick={downloadResult}>
            Download Watermarked PDF
          </button>
        </aside>

        <section className="glass rounded-2xl p-4">
          <h2 className="text-lg font-semibold">Live Preview</h2>
          <div className="mt-2 overflow-auto rounded-lg border border-white/10 bg-black/40 p-2">
            {!pdfBytes ? (
              <div className="flex h-[420px] items-center justify-center text-neutral-400">Upload a PDF to see watermark preview</div>
            ) : (
              <canvas ref={previewCanvasRef} className="mx-auto rounded" />
            )}
          </div>

          <div className="mt-2 rounded-lg bg-black/30 p-3 text-sm text-neutral-200">
            <p>File: {fileName}</p>
            <p className="mt-1">Status: {status}</p>
            <p className="mt-2 text-xs text-neutral-400">
              Tip: This preview updates live from your controls. Use smaller opacity and repeat count 1-3 for clean results.
            </p>
          </div>
        </section>
      </section>
    </main>
  );
}
