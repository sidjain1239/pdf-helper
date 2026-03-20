"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { downloadBytes, fileToBytes, loadPdfJsLib } from "../lib/pdfClient";

function pickReplacementFont(target) {
  const token = `${target?.fontName || ""} ${target?.fontFamily || ""}`.toLowerCase();
  const looksLikeTimes = token.includes("times");
  const looksLikeCourier = token.includes("courier") || token.includes("mono");
  const isBold = token.includes("bold") || token.includes("black") || token.includes("semibold") || token.includes("demi");
  const isItalic = token.includes("italic") || token.includes("oblique");

  if (looksLikeTimes) {
    if (isBold && isItalic) return StandardFonts.TimesRomanBoldItalic;
    if (isBold) return StandardFonts.TimesRomanBold;
    if (isItalic) return StandardFonts.TimesRomanItalic;
    return StandardFonts.TimesRoman;
  }

  if (looksLikeCourier) {
    if (isBold && isItalic) return StandardFonts.CourierBoldOblique;
    if (isBold) return StandardFonts.CourierBold;
    if (isItalic) return StandardFonts.CourierOblique;
    return StandardFonts.Courier;
  }

  if (isBold && isItalic) return StandardFonts.HelveticaBoldOblique;
  if (isBold) return StandardFonts.HelveticaBold;
  if (isItalic) return StandardFonts.HelveticaOblique;
  return StandardFonts.Helvetica;
}

function sampleTextColorFromPreview(target, previewCanvas) {
  if (!target || !previewCanvas) return rgb(0, 0, 0);
  const ctx = previewCanvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return rgb(0, 0, 0);

  const x = Math.max(0, Math.floor(target.x));
  const y = Math.max(0, Math.floor(target.y - target.height));
  const w = Math.max(1, Math.min(previewCanvas.width - x, Math.ceil(target.width)));
  const h = Math.max(1, Math.min(previewCanvas.height - y, Math.ceil(target.height * 1.2)));

  if (w <= 0 || h <= 0) return rgb(0, 0, 0);

  const data = ctx.getImageData(x, y, w, h).data;
  const samples = [];

  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3];
    if (a < 24) continue;
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    // Skip near-white pixels to reduce page background influence.
    if (r > 245 && g > 245 && b > 245) continue;
    const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    samples.push({ r, g, b, luminance });
  }

  if (!samples.length) return rgb(0, 0, 0);

  // Use darker ink pixels (instead of averaging all anti-aliased pixels), so replacement text
  // matches the original tone and does not look slightly lighter.
  samples.sort((a, b) => a.luminance - b.luminance);
  const takeCount = Math.max(1, Math.ceil(samples.length * 0.35));

  let rSum = 0;
  let gSum = 0;
  let bSum = 0;
  for (let i = 0; i < takeCount; i += 1) {
    rSum += samples[i].r;
    gSum += samples[i].g;
    bSum += samples[i].b;
  }

  return rgb(rSum / (takeCount * 255), gSum / (takeCount * 255), bSum / (takeCount * 255));
}

export default function EditPage() {
  const previewCanvasRef = useRef(null);
  const overlayCanvasRef = useRef(null);
  const undoStackRef = useRef([]);
  const redoStackRef = useRef([]);

  const [pdfjsLib, setPdfjsLib] = useState(null);
  const [pdfBytes, setPdfBytes] = useState(null);
  const [fileName, setFileName] = useState("No file selected");
  const [pageCount, setPageCount] = useState(0);
  const [selectedPage, setSelectedPage] = useState(1);
  const [status, setStatus] = useState("Ready");

  const [tool, setTool] = useState("move");
  const [brushColor, setBrushColor] = useState("#ff2e2e");
  const [brushSize, setBrushSize] = useState(4);
  const [highlightOpacity, setHighlightOpacity] = useState(0.14);
  const [textBox, setTextBox] = useState("Type here");

  const [textItems, setTextItems] = useState([]);
  const [selectedTextIndex, setSelectedTextIndex] = useState(-1);
  const [replaceTextValue, setReplaceTextValue] = useState("");
  const [textEditSupported, setTextEditSupported] = useState(false);
  const [textEditSupportReason, setTextEditSupportReason] = useState("");
  const [canvasSize, setCanvasSize] = useState({ width: 1, height: 1 });

  const [drawing, setDrawing] = useState(false);
  const [pageJump, setPageJump] = useState("1");
  const [, forceRender] = useState(0);

  const canvasCursor = useMemo(() => {
    if (tool === "brush" || tool === "highlight" || tool === "eraser" || tool === "redact") return "crosshair";
    if (tool === "text") return "cell";
    if (tool === "pdf-text-edit") return "text";
    return "default";
  }, [tool]);

  useEffect(() => {
    async function setup() {
      const lib = await loadPdfJsLib();
      setPdfjsLib(lib);
    }
    setup();
  }, []);

  useEffect(() => {
    if (!pdfjsLib || !pdfBytes) return;

    let cancelled = false;

    async function renderPage() {
      try {
        setStatus("Rendering preview...");
        // Use a fresh copy to avoid detached ArrayBuffer errors between page switches.
        const safeBytes = new Uint8Array(pdfBytes);
        const doc = await pdfjsLib.getDocument({ data: safeBytes, disableWorker: true }).promise;
        if (cancelled) return;
        setPageCount(doc.numPages);
        const page = await doc.getPage(selectedPage);
        const viewport = page.getViewport({ scale: 1.2 });
        const canvas = previewCanvasRef.current;
        const ctx = canvas.getContext("2d");
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        await page.render({ canvasContext: ctx, viewport }).promise;

        const overlay = overlayCanvasRef.current;
        overlay.width = viewport.width;
        overlay.height = viewport.height;
        setCanvasSize({ width: viewport.width, height: viewport.height });
        clearOverlay();

        const content = await page.getTextContent();
        const styles = content.styles || {};
        const mapped = content.items
          .map((item, idx) => {
            const tx = pdfjsLib.Util.transform(viewport.transform, item.transform);
            const x = tx[4];
            const y = tx[5];
            const pdfFontSize = Math.max(8, Math.hypot(item.transform[2], item.transform[3]));
            const h = Math.max(10, pdfFontSize * viewport.scale);
            const style = styles[item.fontName] || {};
            return {
              id: idx,
              text: item.str,
              x,
              y,
              width: Math.max(12, item.width * viewport.scale),
              height: h,
              pdfX: item.transform[4],
              pdfY: item.transform[5],
              pdfWidth: Math.max(8, item.width),
              pdfFontSize,
              fontName: item.fontName || "",
              fontFamily: style.fontFamily || ""
            };
          })
          .filter((item) => item.text && item.text.trim());

        const meaningfulItems = mapped.filter((item) => /[A-Za-z0-9]/.test(item.text));
        const supported = meaningfulItems.length > 0;

        setTextItems(meaningfulItems);
        setTextEditSupported(supported);
        setTextEditSupportReason(
          supported
            ? "Yellow boxes are shown because the app detected editable text blocks. Click one to replace it."
            : "This PDF uses image/non-selectable text, so PDF text edit is hidden for this file."
        );
        if (!supported && tool === "pdf-text-edit") {
          setTool("move");
        }
        setSelectedTextIndex(-1);
        setReplaceTextValue("");
        setStatus("Preview ready");
      } catch (error) {
        if (!cancelled) setStatus(`Render failed: ${error.message}`);
      }
    }

    renderPage();
    return () => {
      cancelled = true;
    };
  }, [pdfjsLib, pdfBytes, selectedPage]);

  useEffect(() => {
    setPageJump(String(selectedPage));
  }, [selectedPage]);

  async function onUpload(fileList) {
    const file = Array.from(fileList || []).find((f) => f.name.toLowerCase().endsWith(".pdf"));
    if (!file) return;
    const bytes = await fileToBytes(file);
    setPdfBytes(bytes);
    setFileName(file.name);
    setSelectedPage(1);
    setTextItems([]);
    setTextEditSupported(false);
    setTextEditSupportReason("");
    undoStackRef.current = [];
    redoStackRef.current = [];
    forceRender((v) => v + 1);
    setStatus("PDF loaded");
  }

  function clearOverlay() {
    const overlay = overlayCanvasRef.current;
    if (!overlay) return;
    const ctx = overlay.getContext("2d");
    ctx.clearRect(0, 0, overlay.width, overlay.height);
  }

  function getOverlaySnapshot() {
    const overlay = overlayCanvasRef.current;
    if (!overlay || !overlay.width || !overlay.height) return "";
    return overlay.toDataURL("image/png");
  }

  function pushUndoSnapshot() {
    const shot = getOverlaySnapshot();
    undoStackRef.current.push(shot);
    if (undoStackRef.current.length > 40) undoStackRef.current.shift();
    redoStackRef.current = [];
    forceRender((v) => v + 1);
  }

  function restoreOverlaySnapshot(dataUrl) {
    const overlay = overlayCanvasRef.current;
    if (!overlay) return;
    const ctx = overlay.getContext("2d");
    ctx.clearRect(0, 0, overlay.width, overlay.height);
    if (!dataUrl) return;
    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, 0, 0, overlay.width, overlay.height);
    };
    img.src = dataUrl;
  }

  function undoOverlay() {
    if (!undoStackRef.current.length) return;
    const current = getOverlaySnapshot();
    const previous = undoStackRef.current.pop();
    redoStackRef.current.push(current);
    restoreOverlaySnapshot(previous);
    forceRender((v) => v + 1);
  }

  function redoOverlay() {
    if (!redoStackRef.current.length) return;
    const current = getOverlaySnapshot();
    const next = redoStackRef.current.pop();
    undoStackRef.current.push(current);
    restoreOverlaySnapshot(next);
    forceRender((v) => v + 1);
  }

  function getPoint(e) {
    const canvas = overlayCanvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scaleX = rect.width ? canvas.width / rect.width : 1;
    const scaleY = rect.height ? canvas.height / rect.height : 1;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY
    };
  }

  function startDraw(e) {
    if (!pdfBytes) return;
    const ctx = overlayCanvasRef.current.getContext("2d");
    const p = getPoint(e);

    if (tool === "text") {
      if (!textBox.trim()) return;
      pushUndoSnapshot();
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = brushColor;
      ctx.font = `${Math.max(12, brushSize * 4)}px Segoe UI`;
      ctx.fillText(textBox, p.x, p.y);
      return;
    }

    if (tool !== "brush" && tool !== "highlight" && tool !== "eraser" && tool !== "redact") return;

    pushUndoSnapshot();
    e.currentTarget.setPointerCapture(e.pointerId);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    if (tool === "eraser") {
      ctx.globalCompositeOperation = "destination-out";
      ctx.strokeStyle = "rgba(0,0,0,1)";
      ctx.lineWidth = Math.max(6, brushSize * 2);
    } else if (tool === "redact") {
      ctx.globalCompositeOperation = "source-over";
      ctx.strokeStyle = "rgba(0,0,0,1)";
      ctx.lineWidth = Math.max(10, brushSize * 4);
    } else if (tool === "highlight") {
      ctx.globalCompositeOperation = "source-over";
      ctx.strokeStyle = `rgba(255,239,107,${highlightOpacity})`;
      ctx.lineWidth = Math.max(10, brushSize * 3);
    } else {
      ctx.globalCompositeOperation = "source-over";
      ctx.strokeStyle = brushColor;
      ctx.lineWidth = brushSize;
    }

    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    setDrawing(true);
  }

  function moveDraw(e) {
    if (!drawing) return;
    const p = getPoint(e);
    const ctx = overlayCanvasRef.current.getContext("2d");
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  }

  function endDraw() {
    if (!drawing) return;
    const ctx = overlayCanvasRef.current.getContext("2d");
    ctx.closePath();
    ctx.globalCompositeOperation = "source-over";
    setDrawing(false);
  }

  function overlayHasInk() {
    const overlay = overlayCanvasRef.current;
    if (!overlay || !overlay.width || !overlay.height) return false;
    return overlay
      .getContext("2d")
      .getImageData(0, 0, overlay.width, overlay.height)
      .data.some((v) => v !== 0);
  }

  async function commitOverlayToCurrentPage(options = {}) {
    const { silent = true } = options;
    if (!pdfBytes) throw new Error("Upload a PDF first");
    if (!overlayHasInk()) return pdfBytes;

    if (!silent) setStatus("Applying edits...");

    const overlay = overlayCanvasRef.current;
    const dataUrl = overlay.toDataURL("image/png");
    const pngBytes = await fetch(dataUrl).then((r) => r.arrayBuffer());

    const pdf = await PDFDocument.load(pdfBytes);
    const page = pdf.getPage(selectedPage - 1);
    const image = await pdf.embedPng(pngBytes);
    const { width, height } = page.getSize();
    page.drawImage(image, { x: 0, y: 0, width, height });

    const result = await pdf.save({ useObjectStreams: false, addDefaultPage: false });
    if (!result?.length) throw new Error("Generated PDF was empty");

    setPdfBytes(result);
    clearOverlay();
    undoStackRef.current = [];
    redoStackRef.current = [];
    forceRender((v) => v + 1);

    if (!silent) setStatus(`Edits applied to PDF page (${result.length} bytes)`);
    return result;
  }

  async function changePageWithAutoApply(nextPage) {
    if (!pdfBytes) return;
    const clamped = Math.max(1, Math.min(pageCount || 1, nextPage));
    if (clamped === selectedPage) return;

    try {
      await commitOverlayToCurrentPage({ silent: true });
      setSelectedPage(clamped);
    } catch (error) {
      setStatus(`Auto-apply failed: ${error.message}`);
    }
  }

  async function replacePdfText() {
    try {
      if (!pdfBytes) throw new Error("Upload a PDF first");
      if (!textEditSupported) throw new Error("PDF text edit is not supported for this file");
      if (selectedTextIndex < 0) throw new Error("Select a text item first");
      if (!replaceTextValue.trim()) throw new Error("Enter replacement text");

      const baseBytes = await commitOverlayToCurrentPage({ silent: true });

      const target = textItems.find((t) => t.id === selectedTextIndex);
      if (!target) throw new Error("Selected text not found");

      const pdf = await PDFDocument.load(baseBytes);
      const page = pdf.getPage(selectedPage - 1);
      const font = await pdf.embedFont(pickReplacementFont(target));
      const sampledColor = sampleTextColorFromPreview(target, previewCanvasRef.current);

      const textSize = Math.max(9, target.pdfFontSize);
      const pdfX = target.pdfX;
      const pdfY = target.pdfY;
      const clearY = pdfY - textSize * 0.28;
      const clearHeight = textSize * 1.42;
      const clearWidth = Math.max(target.pdfWidth + 8, replaceTextValue.length * textSize * 0.55 + 6);

      page.drawRectangle({
        x: pdfX - 2,
        y: clearY,
        width: clearWidth,
        height: clearHeight,
        color: rgb(1, 1, 1),
        opacity: 1
      });
      page.drawText(replaceTextValue, {
        x: pdfX,
        y: pdfY,
        size: textSize,
        font,
        color: sampledColor
      });

      const result = await pdf.save({ useObjectStreams: true });
      setPdfBytes(result);
      setStatus("PDF text edit applied (supported PDFs)");
    } catch (error) {
      setStatus(`Text edit failed: ${error.message}`);
    }
  }

  async function duplicateCurrentPage() {
    try {
      if (!pdfBytes) throw new Error("Upload a PDF first");
      const baseBytes = await commitOverlayToCurrentPage({ silent: true });
      const pdf = await PDFDocument.load(baseBytes);
      const [copied] = await pdf.copyPages(pdf, [selectedPage - 1]);
      pdf.insertPage(selectedPage, copied);
      const result = await pdf.save({ useObjectStreams: true });
      setPdfBytes(result);
      setSelectedPage(selectedPage + 1);
      setStatus("Current page duplicated");
    } catch (error) {
      setStatus(`Duplicate failed: ${error.message}`);
    }
  }

  async function insertBlankPageAfter() {
    try {
      if (!pdfBytes) throw new Error("Upload a PDF first");
      const baseBytes = await commitOverlayToCurrentPage({ silent: true });
      const pdf = await PDFDocument.load(baseBytes);
      const current = pdf.getPage(selectedPage - 1);
      const { width, height } = current.getSize();
      pdf.insertPage(selectedPage, [width, height]);
      const result = await pdf.save({ useObjectStreams: true });
      setPdfBytes(result);
      setSelectedPage(selectedPage + 1);
      setStatus("Blank page inserted");
    } catch (error) {
      setStatus(`Insert failed: ${error.message}`);
    }
  }

  async function deleteCurrentPage() {
    try {
      if (!pdfBytes) throw new Error("Upload a PDF first");
      const baseBytes = await commitOverlayToCurrentPage({ silent: true });
      const pdf = await PDFDocument.load(baseBytes);
      if (pdf.getPageCount() <= 1) throw new Error("Cannot delete last page");
      pdf.removePage(selectedPage - 1);
      const result = await pdf.save({ useObjectStreams: true });
      setPdfBytes(result);
      setSelectedPage((prev) => Math.max(1, prev - 1));
      setStatus("Current page deleted");
    } catch (error) {
      setStatus(`Delete failed: ${error.message}`);
    }
  }

  async function downloadPdf() {
    try {
      if (!pdfBytes?.length) {
        setStatus("No PDF data to download");
        return;
      }
      const finalBytes = await commitOverlayToCurrentPage({ silent: true });
      const outName = fileName.replace(/\.pdf$/i, "") + "-edited.pdf";
      downloadBytes(finalBytes, outName, "application/pdf");
      setStatus(`Downloaded ${outName}`);
    } catch (error) {
      setStatus(`Download failed: ${error.message}`);
    }
  }

  return (
    <main className="mx-auto max-w-[1400px] p-4 md:p-6">
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
        <aside className="glass rounded-2xl p-4">
          <h1 className="text-xl font-semibold">Edit</h1>
          <p className="mt-1 text-xs text-neutral-300">Paint-like editing directly on page preview.</p>

          <input type="file" accept=".pdf" className="mt-3 w-full rounded-lg p-2 text-xs" onChange={(e) => onUpload(e.target.files)} />

          <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
            {["move", "brush", "highlight", "eraser", "redact", "text", ...(textEditSupported ? ["pdf-text-edit"] : [])].map((name) => (
              <button
                key={name}
                onClick={() => setTool(name)}
                className={`rounded-lg px-2 py-2 ${tool === name ? "bg-red-500/35" : "bg-white/10"}`}
              >
                {name}
              </button>
            ))}
          </div>

          {pdfBytes ? (
            <div className="mt-3 rounded-lg border border-yellow-400/45 bg-yellow-500/20 p-3 text-xs text-yellow-100">
              {textEditSupportReason || "Checking PDF text support..."}
            </div>
          ) : null}

          <div className="mt-3 rounded-lg bg-black/30 p-3">
            <label className="text-xs text-neutral-300">Brush Color</label>
            <input type="color" value={brushColor} onChange={(e) => setBrushColor(e.target.value)} className="mt-1 h-10 w-full rounded" />
            <label className="mt-2 block text-xs text-neutral-300">Brush Size: {brushSize}</label>
            <input type="range" min="1" max="14" value={brushSize} onChange={(e) => setBrushSize(Number(e.target.value))} className="w-full" />
            <label className="mt-2 block text-xs text-neutral-300">Highlight Opacity: {highlightOpacity.toFixed(2)}</label>
            <input
              type="range"
              min="0.08"
              max="0.5"
              step="0.01"
              value={highlightOpacity}
              onChange={(e) => setHighlightOpacity(Number(e.target.value))}
              className="w-full"
            />
            <label className="mt-2 block text-xs text-neutral-300">Text Box</label>
            <input value={textBox} onChange={(e) => setTextBox(e.target.value)} className="mt-1 w-full rounded-lg p-2" />
          </div>

          {textEditSupported ? (
            <div className="mt-3 rounded-lg bg-black/30 p-3">
              <p className="text-xs text-neutral-300">PDF text edit (supported PDFs)</p>
              <input
                value={replaceTextValue}
                onChange={(e) => setReplaceTextValue(e.target.value)}
                className="mt-2 w-full rounded-lg p-2"
                placeholder="Replacement text"
              />
              <button className="neon-btn mt-2 w-full rounded-lg px-3 py-2 text-sm" onClick={replacePdfText}>
                Replace Selected PDF Text
              </button>
              <p className="mt-2 text-[11px] text-neutral-400">
                Choose tool "pdf-text-edit", click a yellow box in preview, then replace.
              </p>
            </div>
          ) : null}

          <div className="mt-3 rounded-lg bg-black/30 p-3">
            <p className="text-xs text-neutral-300">More page tools</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button className="rounded-lg bg-white/10 px-2 py-2 text-xs" onClick={duplicateCurrentPage}>
                Duplicate Page
              </button>
              <button className="rounded-lg bg-white/10 px-2 py-2 text-xs" onClick={insertBlankPageAfter}>
                Insert Blank
              </button>
              <button className="rounded-lg bg-white/10 px-2 py-2 text-xs" onClick={deleteCurrentPage}>
                Delete Page
              </button>
            </div>
          </div>

          <div className="mt-2 grid grid-cols-2 gap-2">
            <button
              className="rounded-lg bg-white/10 px-3 py-2 text-sm disabled:opacity-40"
              onClick={undoOverlay}
              disabled={!undoStackRef.current.length}
            >
              Undo
            </button>
            <button
              className="rounded-lg bg-white/10 px-3 py-2 text-sm disabled:opacity-40"
              onClick={redoOverlay}
              disabled={!redoStackRef.current.length}
            >
              Redo
            </button>
          </div>
          <button className="neon-btn mt-2 w-full rounded-lg px-3 py-2" onClick={downloadPdf}>
            Download PDF
          </button>
        </aside>

        <section className="glass rounded-2xl p-4">
          <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded bg-white/10 px-2 py-1">{status}</span>
            <span className="rounded bg-white/10 px-2 py-1">File: {fileName}</span>
          </div>

          <div className="mb-3 flex items-center gap-2 text-xs">
            <button className="rounded bg-white/10 px-2 py-1" onClick={() => changePageWithAutoApply(selectedPage - 1)}>
              Prev
            </button>
            <span>
              Page {selectedPage} / {pageCount || 0}
            </span>
            <button
              className="rounded bg-white/10 px-2 py-1"
              onClick={() => changePageWithAutoApply(selectedPage + 1)}
            >
              Next
            </button>
            <input
              type="number"
              min="1"
              max={pageCount || 1}
              value={pageJump}
              onChange={(e) => setPageJump(e.target.value)}
              className="w-16 rounded bg-white/10 px-2 py-1"
            />
            <button
              className="rounded bg-white/10 px-2 py-1"
              onClick={() => changePageWithAutoApply(Number(pageJump) || 1)}
            >
              Go
            </button>
            <button
              className="rounded bg-white/10 px-2 py-1"
              onClick={() => {
                pushUndoSnapshot();
                clearOverlay();
              }}
            >
              Clear Overlay
            </button>
          </div>

          <div className="relative overflow-auto rounded-lg border border-white/10 bg-black/40 p-2">
            {!pdfBytes ? (
              <div className="flex h-[72vh] items-center justify-center text-neutral-400">Upload a PDF to start editing</div>
            ) : (
              <div className="relative inline-block">
                <canvas ref={previewCanvasRef} className="mx-auto block rounded" />
                {tool === "pdf-text-edit" && textEditSupported ? (
                  <div className="pointer-events-none absolute left-0 top-0 h-full w-full">
                    {textItems.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className={`pointer-events-auto absolute border text-[10px] ${
                          selectedTextIndex === item.id
                            ? "border-red-400 bg-red-500/25"
                            : "border-yellow-200/70 bg-yellow-300/15"
                        }`}
                        style={{
                          left: `${(item.x / Math.max(1, canvasSize.width)) * 100}%`,
                          top: `${(Math.max(0, item.y - item.height) / Math.max(1, canvasSize.height)) * 100}%`,
                          width: `${(Math.max(18, item.width) / Math.max(1, canvasSize.width)) * 100}%`,
                          height: `${(Math.max(12, item.height + 4) / Math.max(1, canvasSize.height)) * 100}%`
                        }}
                        onClick={() => {
                          setSelectedTextIndex(item.id);
                          setReplaceTextValue(item.text);
                        }}
                        title={item.text}
                        aria-label={`select text ${item.text}`}
                      />
                    ))}
                  </div>
                ) : null}
                <canvas
                  ref={overlayCanvasRef}
                  className="absolute left-0 top-0 block h-full w-full rounded"
                  style={{
                    touchAction: "none",
                    cursor: canvasCursor,
                    pointerEvents: tool === "pdf-text-edit" ? "none" : "auto"
                  }}
                  onPointerDown={startDraw}
                  onPointerMove={moveDraw}
                  onPointerUp={endDraw}
                  onPointerLeave={endDraw}
                />
              </div>
            )}
          </div>
        </section>
      </section>
    </main>
  );
}
