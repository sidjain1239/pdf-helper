"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { PDFDocument } from "pdf-lib";
import { downloadBytes, fileToBytes, loadPdfJsLib } from "../lib/pdfClient";

function makeBlankSlide(idNum) {
  return {
    id: `blank-${idNum}`,
    kind: "blank",
    label: `Blank ${idNum}`
  };
}

function makePdfSlide(pageNo) {
  return {
    id: `pdf-${pageNo}`,
    kind: "pdf",
    pageNo,
    label: `PDF ${pageNo}`
  };
}

function drawBoardGrid(ctx, width, height, zoom) {
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = "rgba(15, 23, 42, 0.08)";
  ctx.lineWidth = 1;
  const gap = Math.max(24, Math.round(30 * zoom));

  for (let x = 0; x < width; x += gap) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }

  for (let y = 0; y < height; y += gap) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }
}

function loadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Image load failed"));
    img.src = dataUrl;
  });
}

function Icon({ name, className = "h-4 w-4" }) {
  const common = { className, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" };

  if (name === "open") return <svg {...common}><path d="M4 19h16" /><path d="M12 3v11" /><path d="m8 10 4 4 4-4" /></svg>;
  if (name === "blank") return <svg {...common}><rect x="5" y="4" width="14" height="16" rx="2" /><path d="M8 8h8M8 12h8M8 16h5" /></svg>;
  if (name === "plus") return <svg {...common}><path d="M12 5v14M5 12h14" /></svg>;
  if (name === "move") return <svg {...common}><path d="M12 2v20M2 12h20" /><path d="m9 5 3-3 3 3M9 19l3 3 3-3M5 9l-3 3 3 3M19 9l3 3-3 3" /></svg>;
  if (name === "pen") return <svg {...common}><path d="m4 20 4-1 10-10-3-3L5 16l-1 4Z" /><path d="m14 6 3 3" /></svg>;
  if (name === "highlight") return <svg {...common}><path d="m4 14 6 6 10-10-6-6-10 10Z" /><path d="M12 4 20 12" /></svg>;
  if (name === "eraser") return <svg {...common}><path d="m7 8 7-7 7 7-7 7H7l-4-4 4-3Z" /></svg>;
  if (name === "laser") return <svg {...common}><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1" /></svg>;
  if (name === "prev") return <svg {...common}><path d="m15 18-6-6 6-6" /></svg>;
  if (name === "next") return <svg {...common}><path d="m9 18 6-6-6-6" /></svg>;
  if (name === "go") return <svg {...common}><path d="M4 12h14" /><path d="m14 7 5 5-5 5" /></svg>;
  if (name === "undo") return <svg {...common}><path d="M9 7H4v5" /><path d="M4 12a8 8 0 1 0 2-5" /></svg>;
  if (name === "redo") return <svg {...common}><path d="M15 7h5v5" /><path d="M20 12a8 8 0 1 1-2-5" /></svg>;
  if (name === "clear") return <svg {...common}><path d="m4 20 16-16" /><path d="M7 4h11l2 4-8 8H5L3 12l4-8Z" /></svg>;
  if (name === "present") return <svg {...common}><path d="M3 5h18v12H3z" /><path d="M8 21h8M12 17v4" /></svg>;
  if (name === "minimize") return <svg {...common}><path d="M4 12h16" /></svg>;
  if (name === "save") return <svg {...common}><path d="M5 4h11l3 3v13H5z" /><path d="M8 4v6h8V4" /><path d="M9 20h6" /></svg>;
  return <svg {...common}><circle cx="12" cy="12" r="4" /></svg>;
}

function IconButton({ icon, active = false, onClick, title }) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      className={`flex h-9 w-9 items-center justify-center rounded-lg border ${active ? "border-red-400/70 bg-red-500/35" : "border-white/15 bg-white/10"} hover:bg-white/20`}
    >
      <Icon name={icon} className="h-4 w-4" />
    </button>
  );
}

export default function PresentPage() {
  const stageRef = useRef(null);
  const baseCanvasRef = useRef(null);
  const overlayCanvasRef = useRef(null);
  const undoStackRef = useRef([]);
  const redoStackRef = useRef([]);
  const slideInkRef = useRef({});

  const [pdfjsLib, setPdfjsLib] = useState(null);
  const [pdfBytes, setPdfBytes] = useState(null);
  const [fileName, setFileName] = useState("No file selected");
  const [status, setStatus] = useState("Start with blank slide or open a PDF");

  const [slides, setSlides] = useState([makeBlankSlide(1)]);
  const [activeSlideIndex, setActiveSlideIndex] = useState(0);
  const [pageJump, setPageJump] = useState("1");

  const [zoom, setZoom] = useState(1.2);
  const [tool, setTool] = useState("pen");
  const [penColor, setPenColor] = useState("#ff2e2e");
  const [penSize, setPenSize] = useState(4);
  const [highlighterOpacity, setHighlighterOpacity] = useState(0.22);

  const [isDrawing, setIsDrawing] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [laserPoint, setLaserPoint] = useState(null);

  const isPresentMode = isFullscreen;

  const activeSlide = slides[activeSlideIndex] || slides[0];

  const cursor = useMemo(() => {
    if (tool === "laser") return "none";
    if (tool === "pen" || tool === "highlighter" || tool === "eraser") return "crosshair";
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
    function onFullscreenChange() {
      setIsFullscreen(Boolean(document.fullscreenElement));
    }
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  useEffect(() => {
    setPageJump(String(activeSlideIndex + 1));
  }, [activeSlideIndex]);

  useEffect(() => {
    if (!pdfjsLib || !activeSlide) return;

    let cancelled = false;

    async function renderActiveSlide() {
      try {
        const baseCanvas = baseCanvasRef.current;
        const overlayCanvas = overlayCanvasRef.current;
        const baseCtx = baseCanvas.getContext("2d");

        if (activeSlide.kind === "pdf") {
          if (!pdfBytes) throw new Error("Open a PDF first");
          setStatus(`Rendering ${activeSlide.label}...`);
          const doc = await pdfjsLib.getDocument({ data: new Uint8Array(pdfBytes), disableWorker: true }).promise;
          if (cancelled) return;

          const pageNo = Math.max(1, Math.min(doc.numPages, activeSlide.pageNo));
          const page = await doc.getPage(pageNo);
          const viewport = page.getViewport({ scale: Number(zoom) || 1.2 });

          baseCanvas.width = viewport.width;
          baseCanvas.height = viewport.height;
          baseCtx.fillStyle = "#ffffff";
          baseCtx.fillRect(0, 0, baseCanvas.width, baseCanvas.height);
          await page.render({ canvasContext: baseCtx, viewport }).promise;
        } else {
          const width = Math.round(1280 * zoom);
          const height = Math.round(720 * zoom);
          baseCanvas.width = width;
          baseCanvas.height = height;
          drawBoardGrid(baseCtx, width, height, zoom);
        }

        overlayCanvas.width = baseCanvas.width;
        overlayCanvas.height = baseCanvas.height;

        const saved = slideInkRef.current[activeSlide.id] || "";
        restoreOverlaySnapshot(saved);
        undoStackRef.current = [];
        redoStackRef.current = [];
        setStatus(`${activeSlide.label} ready`);
      } catch (error) {
        if (!cancelled) setStatus(`Render failed: ${error.message}`);
      }
    }

    renderActiveSlide();
    return () => {
      cancelled = true;
    };
  }, [pdfjsLib, pdfBytes, activeSlide, zoom]);

  function overlayHasInk() {
    const canvas = overlayCanvasRef.current;
    if (!canvas || !canvas.width || !canvas.height) return false;
    return canvas
      .getContext("2d")
      .getImageData(0, 0, canvas.width, canvas.height)
      .data.some((v) => v !== 0);
  }

  function getOverlaySnapshot() {
    const canvas = overlayCanvasRef.current;
    if (!canvas || !canvas.width || !canvas.height) return "";
    return canvas.toDataURL("image/png");
  }

  function persistCurrentInk() {
    if (!activeSlide) return;
    if (!overlayHasInk()) {
      delete slideInkRef.current[activeSlide.id];
      return;
    }
    slideInkRef.current[activeSlide.id] = getOverlaySnapshot();
  }

  function clearOverlay() {
    const canvas = overlayCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  function clearCurrentSlideInk() {
    clearOverlay();
    if (activeSlide) delete slideInkRef.current[activeSlide.id];
    setStatus("Current slide ink cleared");
  }

  function restoreOverlaySnapshot(dataUrl) {
    const canvas = overlayCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!dataUrl) return;
    const img = new Image();
    img.onload = () => ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    img.src = dataUrl;
  }

  function pushUndoSnapshot() {
    undoStackRef.current.push(getOverlaySnapshot());
    if (undoStackRef.current.length > 60) undoStackRef.current.shift();
    redoStackRef.current = [];
  }

  function undoOverlay() {
    if (!undoStackRef.current.length) return;
    const current = getOverlaySnapshot();
    const previous = undoStackRef.current.pop();
    redoStackRef.current.push(current);
    restoreOverlaySnapshot(previous);
    persistCurrentInk();
  }

  function redoOverlay() {
    if (!redoStackRef.current.length) return;
    const current = getOverlaySnapshot();
    const next = redoStackRef.current.pop();
    undoStackRef.current.push(current);
    restoreOverlaySnapshot(next);
    persistCurrentInk();
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
    if (!activeSlide) return;
    if (tool === "move") return;

    const p = getPoint(e);

    if (tool === "laser") {
      setLaserPoint(p);
      return;
    }

    const canvas = overlayCanvasRef.current;
    const ctx = canvas.getContext("2d");
    pushUndoSnapshot();
    canvas.setPointerCapture(e.pointerId);

    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    if (tool === "eraser") {
      ctx.globalCompositeOperation = "destination-out";
      ctx.strokeStyle = "rgba(0,0,0,1)";
      ctx.lineWidth = Math.max(8, penSize * 2);
    } else if (tool === "highlighter") {
      ctx.globalCompositeOperation = "source-over";
      ctx.strokeStyle = `rgba(255,239,107,${highlighterOpacity})`;
      ctx.lineWidth = Math.max(12, penSize * 3);
    } else {
      ctx.globalCompositeOperation = "source-over";
      ctx.strokeStyle = penColor;
      ctx.lineWidth = penSize;
    }

    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    setIsDrawing(true);
  }

  function moveDraw(e) {
    if (tool === "laser") {
      setLaserPoint(getPoint(e));
      return;
    }
    if (!isDrawing) return;
    const p = getPoint(e);
    const ctx = overlayCanvasRef.current.getContext("2d");
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  }

  function endDraw() {
    if (tool === "laser") {
      setLaserPoint(null);
      return;
    }
    if (!isDrawing) return;
    const ctx = overlayCanvasRef.current.getContext("2d");
    ctx.closePath();
    ctx.globalCompositeOperation = "source-over";
    setIsDrawing(false);
    persistCurrentInk();
  }

  function changeSlide(nextIndex) {
    if (!slides.length) return;
    const idx = Math.max(0, Math.min(slides.length - 1, nextIndex));
    if (idx === activeSlideIndex) return;
    persistCurrentInk();
    setActiveSlideIndex(idx);
    setLaserPoint(null);
  }

  async function openPdf(fileList) {
    const file = Array.from(fileList || []).find((f) => f.name.toLowerCase().endsWith(".pdf"));
    if (!file) return;
    try {
      const bytes = await fileToBytes(file);
      if (!pdfjsLib) throw new Error("PDF engine is still loading");
      const doc = await pdfjsLib.getDocument({ data: new Uint8Array(bytes), disableWorker: true }).promise;
      persistCurrentInk();
      const nextSlides = [];
      for (let i = 1; i <= doc.numPages; i += 1) nextSlides.push(makePdfSlide(i));
      setPdfBytes(bytes);
      setFileName(file.name);
      setSlides(nextSlides);
      setActiveSlideIndex(0);
      slideInkRef.current = {};
      setStatus(`Loaded ${file.name} with ${doc.numPages} pages`);
    } catch (error) {
      setStatus(`Open failed: ${error.message}`);
    }
  }

  function startBlankDeck() {
    persistCurrentInk();
    setSlides([makeBlankSlide(1)]);
    setActiveSlideIndex(0);
    setPdfBytes(null);
    setFileName("Blank deck");
    slideInkRef.current = {};
    setStatus("Started blank smartboard deck");
  }

  function addBlankSlide() {
    persistCurrentInk();
    const blankCount = slides.filter((s) => s.kind === "blank").length;
    const newSlide = makeBlankSlide(blankCount + 1);
    const nextSlides = [...slides, newSlide];
    setSlides(nextSlides);
    setActiveSlideIndex(nextSlides.length - 1);
    setStatus(`${newSlide.label} added`);
  }

  async function saveDeckAsPdf() {
    try {
      if (!pdfjsLib) throw new Error("PDF engine is not ready");
      if (!slides.length) throw new Error("No slides to save");

      persistCurrentInk();
      setStatus("Saving teaching deck as PDF...");

      const out = await PDFDocument.create();
      let pdfDoc = null;
      if (pdfBytes) {
        pdfDoc = await pdfjsLib.getDocument({ data: new Uint8Array(pdfBytes), disableWorker: true }).promise;
      }

      for (let i = 0; i < slides.length; i += 1) {
        const slide = slides[i];
        setStatus(`Saving slide ${i + 1}/${slides.length}...`);

        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");

        if (slide.kind === "pdf") {
          if (!pdfDoc) throw new Error("PDF source missing for PDF slide export");
          const page = await pdfDoc.getPage(slide.pageNo);
          const viewport = page.getViewport({ scale: 1.3 });
          canvas.width = Math.max(1, Math.floor(viewport.width));
          canvas.height = Math.max(1, Math.floor(viewport.height));
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          await page.render({ canvasContext: ctx, viewport }).promise;
        } else {
          canvas.width = 1600;
          canvas.height = 900;
          drawBoardGrid(ctx, canvas.width, canvas.height, 1);
        }

        const savedInk = slideInkRef.current[slide.id];
        if (savedInk) {
          const img = await loadImage(savedInk);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        }

        const pngBytes = await fetch(canvas.toDataURL("image/png")).then((r) => r.arrayBuffer());
        const png = await out.embedPng(pngBytes);
        const outPage = out.addPage([png.width, png.height]);
        outPage.drawImage(png, { x: 0, y: 0, width: png.width, height: png.height });
      }

      const bytes = await out.save({ useObjectStreams: true, addDefaultPage: false });
      const baseName = fileName && fileName !== "No file selected" ? fileName.replace(/\.pdf$/i, "") : "teaching-deck";
      downloadBytes(bytes, `${baseName}-smartboard.pdf`, "application/pdf");
      setStatus("Teaching deck saved as PDF");
    } catch (error) {
      setStatus(`Save failed: ${error.message}`);
    }
  }

  async function togglePresentMode() {
    try {
      const host = stageRef.current;
      if (!host) return;
      if (!document.fullscreenElement) {
        await host.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch (error) {
      setStatus(`Fullscreen failed: ${error.message}`);
    }
  }

  return (
    <main className="mx-auto max-w-[1500px] p-3 md:p-5">
      <section className={`glass rounded-2xl p-2 md:p-3 ${isFullscreen ? "h-screen rounded-none border-0" : ""}`} ref={stageRef}>
        <div className="mb-2 flex items-center justify-between gap-2 rounded-lg bg-black/35 px-3 py-2 text-xs text-neutral-200">
          <span className="truncate">Deck: {fileName}</span>
          <span>
            Slide {activeSlideIndex + 1} / {slides.length}
          </span>
          <span className="truncate">{isPresentMode ? "Present Mode (Full Screen)" : status}</span>
        </div>

        {!isPresentMode ? (
          <div className="mb-2 rounded-xl border border-white/10 bg-black/45 p-2 text-xs text-neutral-100">
            <div className="flex flex-wrap items-center justify-center gap-2">
              <label className="rounded-lg border border-white/15 bg-white/10 px-3 py-2 hover:bg-white/20">
                Open PDF
                <input type="file" accept=".pdf" className="hidden" onChange={(e) => openPdf(e.target.files)} />
              </label>
              <button className="rounded-lg border border-white/15 bg-white/10 px-3 py-2 hover:bg-white/20" onClick={startBlankDeck}>
                Start Blank Deck
              </button>
              <button className="rounded-lg border border-white/15 bg-white/10 px-3 py-2 hover:bg-white/20" onClick={addBlankSlide}>
                Add Blank Slide
              </button>
              <button className="rounded-lg border border-red-400/60 bg-red-500/25 px-3 py-2 hover:bg-red-500/40" onClick={togglePresentMode}>
                Present Mode (Full Screen)
              </button>
            </div>
          </div>
        ) : null}

        <div className={`relative overflow-auto rounded-lg border border-white/10 bg-black/40 p-2 ${isFullscreen ? "h-[calc(100vh-150px)]" : "h-[72vh]"}`}>
          {!activeSlide ? (
            <div className="flex h-full items-center justify-center text-neutral-400">Create a blank slide or open a PDF</div>
          ) : (
            <div className="relative inline-block">
              <canvas ref={baseCanvasRef} className="mx-auto block rounded" />
              <canvas
                ref={overlayCanvasRef}
                className="absolute left-0 top-0 block h-full w-full rounded"
                style={{ touchAction: "none", cursor }}
                onPointerDown={startDraw}
                onPointerMove={moveDraw}
                onPointerUp={endDraw}
                onPointerLeave={endDraw}
              />
              {tool === "laser" && laserPoint ? (
                <div
                  className="pointer-events-none absolute rounded-full bg-red-500/70"
                  style={{
                    width: 18,
                    height: 18,
                    transform: "translate(-50%, -50%)",
                    left: `${(laserPoint.x / Math.max(1, overlayCanvasRef.current?.width || 1)) * 100}%`,
                    top: `${(laserPoint.y / Math.max(1, overlayCanvasRef.current?.height || 1)) * 100}%`,
                    boxShadow: "0 0 16px rgba(255,46,46,0.9)"
                  }}
                />
              ) : null}
            </div>
          )}
        </div>

        <div className="mt-2 rounded-xl border border-white/10 bg-black/50 p-2 text-xs text-neutral-100">
          <div className="flex flex-wrap items-center justify-center gap-2">
            <IconButton icon="pen" active={tool === "pen"} onClick={() => setTool("pen")} title="Pen" />
            <IconButton icon="highlight" active={tool === "highlighter"} onClick={() => setTool("highlighter")} title="Highlighter" />
            <IconButton icon="eraser" active={tool === "eraser"} onClick={() => setTool("eraser")} title="Eraser" />
            <IconButton icon="laser" active={tool === "laser"} onClick={() => setTool("laser")} title="Laser" />

            <IconButton icon="prev" onClick={() => changeSlide(activeSlideIndex - 1)} title="Previous Slide" />
            <IconButton icon="next" onClick={() => changeSlide(activeSlideIndex + 1)} title="Next Slide" />
            <IconButton icon="plus" onClick={addBlankSlide} title="Add Blank Slide" />
            <input
              type="number"
              min="1"
              max={slides.length || 1}
              value={pageJump}
              onChange={(e) => setPageJump(e.target.value)}
              className="w-16 rounded border border-white/15 bg-white/10 px-2 py-1"
            />
            <IconButton icon="go" onClick={() => changeSlide((Number(pageJump) || 1) - 1)} title="Go to Slide" />

            <label className="flex h-9 items-center gap-1 rounded-lg border border-white/15 bg-white/10 px-2">
              <Icon name="pen" className="h-3.5 w-3.5" />
              <input type="color" value={penColor} onChange={(e) => setPenColor(e.target.value)} className="h-6 w-8 rounded" />
            </label>
            <label className="flex h-9 items-center gap-1 rounded-lg border border-white/15 bg-white/10 px-2">
              <Icon name="pen" className="h-3.5 w-3.5" />
              <input type="range" min="1" max="16" value={penSize} onChange={(e) => setPenSize(Number(e.target.value))} className="w-20" />
            </label>
            <label className="flex h-9 items-center gap-1 rounded-lg border border-white/15 bg-white/10 px-2">
              <Icon name="highlight" className="h-3.5 w-3.5" />
              <input
                type="range"
                min="0.08"
                max="0.6"
                step="0.01"
                value={highlighterOpacity}
                onChange={(e) => setHighlighterOpacity(Number(e.target.value))}
                className="w-20"
              />
            </label>
            <label className="flex h-9 items-center gap-1 rounded-lg border border-white/15 bg-white/10 px-2">
              <Icon name="move" className="h-3.5 w-3.5" />
              <input type="range" min="0.75" max="2" step="0.05" value={zoom} onChange={(e) => setZoom(Number(e.target.value))} className="w-20" />
            </label>

            <IconButton icon="undo" onClick={undoOverlay} title="Undo" />
            <IconButton icon="redo" onClick={redoOverlay} title="Redo" />
            <IconButton icon="clear" onClick={clearCurrentSlideInk} title="Clear Slide Ink" />
            {isPresentMode ? (
              <IconButton icon="minimize" onClick={togglePresentMode} title="Minimize" />
            ) : (
              <IconButton icon="present" onClick={togglePresentMode} title="Present Mode (Full Screen)" />
            )}
            <IconButton icon="save" onClick={saveDeckAsPdf} title="Save Deck as PDF" />
          </div>
        </div>
      </section>
    </main>
  );
}
