"use client";

import { useState } from "react";
import { PDFDocument } from "pdf-lib";
import { bytesToHuman, downloadBytes, fileToBytes, loadPdfJsLib } from "../lib/pdfClient";

const COMPRESSION_LEVELS = [
  {
    id: "light",
    label: "Light",
    quality: 0.82,
    scale: 1,
    features: ["Best visual quality", "Good for text-heavy files", "Small size reduction"]
  },
  {
    id: "balanced",
    label: "Balanced",
    quality: 0.68,
    scale: 0.92,
    features: ["Default recommended", "Good quality-size balance", "Faster than strong mode"]
  },
  {
    id: "strong",
    label: "Strong",
    quality: 0.52,
    scale: 0.8,
    features: ["Higher size reduction", "Best for scanned PDFs", "Moderate quality tradeoff"]
  },
  {
    id: "extreme",
    label: "Extreme",
    quality: 0.38,
    scale: 0.68,
    features: ["Maximum size reduction", "Fast sharing over low bandwidth", "Noticeable quality loss"]
  }
];

export default function CompressionPage() {
  const [sourceBytes, setSourceBytes] = useState(null);
  const [sourceName, setSourceName] = useState("No file selected");
  const [resultBytes, setResultBytes] = useState(null);
  const [resultName, setResultName] = useState("compressed.pdf");
  const [status, setStatus] = useState("Ready");
  const [loading, setLoading] = useState(false);

  const [compressionLevel, setCompressionLevel] = useState("balanced");
  const [grayscaleCompression, setGrayscaleCompression] = useState(false);
  const [stripMetadata, setStripMetadata] = useState(true);

  const activeCompression = COMPRESSION_LEVELS.find((level) => level.id === compressionLevel) || COMPRESSION_LEVELS[1];

  async function handleUpload(fileList) {
    const file = Array.from(fileList || []).find((f) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"));
    if (!file) return;
    const bytes = await fileToBytes(file);
    setSourceBytes(bytes);
    setSourceName(file.name);
    setResultBytes(null);
    setResultName(file.name.replace(/\.pdf$/i, "") + "-compressed.pdf");
    setStatus(`Loaded ${file.name} (${bytesToHuman(bytes.length)})`);
  }

  async function compressPdf() {
    try {
      if (!sourceBytes) throw new Error("Upload a PDF first");
      setLoading(true);
      const inputBytes = new Uint8Array(sourceBytes);
      const inputSize = inputBytes.length;

      const pdfjsLib = await loadPdfJsLib();
      const sourceDoc = await pdfjsLib.getDocument({ data: inputBytes, disableWorker: true }).promise;
      const out = await PDFDocument.create();
      const { quality, scale, label } = activeCompression;

      if (stripMetadata) {
        out.setProducer("PDF Toolkit On-device");
        out.setCreator("PDF Toolkit");
        out.setAuthor("");
        out.setSubject("");
        out.setTitle("");
        out.setKeywords([]);
      }

      for (let pageNo = 1; pageNo <= sourceDoc.numPages; pageNo += 1) {
        setStatus(`Compress (${label}) in progress... page ${pageNo}/${sourceDoc.numPages}`);
        const page = await sourceDoc.getPage(pageNo);
        const viewport = page.getViewport({ scale: Number(scale) || 1 });

        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d", { alpha: false });
        canvas.width = Math.max(1, Math.floor(viewport.width));
        canvas.height = Math.max(1, Math.floor(viewport.height));

        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: ctx, viewport }).promise;

        if (grayscaleCompression) {
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const data = imageData.data;
          for (let i = 0; i < data.length; i += 4) {
            const gray = Math.round(data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114);
            data[i] = gray;
            data[i + 1] = gray;
            data[i + 2] = gray;
          }
          ctx.putImageData(imageData, 0, 0);
        }

        const jpegDataUrl = canvas.toDataURL("image/jpeg", quality);
        const jpgBytes = await fetch(jpegDataUrl).then((r) => r.arrayBuffer());
        const jpg = await out.embedJpg(jpgBytes);

        const outPage = out.addPage([viewport.width, viewport.height]);
        outPage.drawImage(jpg, { x: 0, y: 0, width: viewport.width, height: viewport.height });
      }

      const bytes = await out.save({ useObjectStreams: true, addDefaultPage: false });
      setResultBytes(bytes);

      const baseName = sourceName.replace(/\.pdf$/i, "") || "file";
      const finalName = `${baseName}-${compressionLevel}.pdf`;
      setResultName(finalName);

      const reduction = inputSize > 0 ? ((inputSize - bytes.length) / inputSize) * 100 : 0;
      setStatus(`Compressed (${activeCompression.label}): ${bytesToHuman(inputSize)} -> ${bytesToHuman(bytes.length)} (${reduction.toFixed(1)}%)`);
    } catch (error) {
      setStatus(`Compress failed: ${error.message}`);
    } finally {
      setLoading(false);
    }
  }

  function downloadResult() {
    if (!resultBytes) return;
    downloadBytes(resultBytes, resultName, "application/pdf");
    setStatus(`Downloaded ${resultName}`);
  }

  return (
    <main className="mx-auto max-w-[1400px] p-4 md:p-6">
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-[420px_minmax(0,1fr)]">
        <aside className="glass rounded-2xl p-4">
          <h1 className="text-xl font-semibold">Compression Studio</h1>
          <p className="mt-1 text-xs text-neutral-300">Dedicated section for PDF compression levels and options.</p>

          <input type="file" accept=".pdf" className="mt-3 w-full rounded-lg p-2 text-xs" onChange={(e) => handleUpload(e.target.files)} />

          <label className="mt-3 block text-xs text-neutral-300">Compression Level</label>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {COMPRESSION_LEVELS.map((level) => (
              <button
                key={level.id}
                onClick={() => setCompressionLevel(level.id)}
                className={`rounded-lg px-2 py-2 text-xs ${compressionLevel === level.id ? "bg-red-500/40 text-white" : "bg-white/10 text-neutral-200"}`}
              >
                {level.label}
              </button>
            ))}
          </div>

          <div className="mt-3 rounded-lg bg-black/30 p-3 text-xs text-neutral-200">
            <p className="font-semibold text-white">{activeCompression.label} level features</p>
            <p className="mt-1">
              JPEG quality: {(activeCompression.quality * 100).toFixed(0)}% | Render scale: {(activeCompression.scale * 100).toFixed(0)}%
            </p>
            <ul className="mt-2 space-y-1">
              {activeCompression.features.map((feature) => (
                <li key={feature} className="rounded bg-white/5 px-2 py-1">
                  {feature}
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-3 grid gap-2 text-xs text-neutral-200">
            <label className="flex items-center gap-2 rounded bg-black/30 px-2 py-2">
              <input type="checkbox" checked={grayscaleCompression} onChange={(e) => setGrayscaleCompression(e.target.checked)} />
              Convert pages to grayscale
            </label>
            <label className="flex items-center gap-2 rounded bg-black/30 px-2 py-2">
              <input type="checkbox" checked={stripMetadata} onChange={(e) => setStripMetadata(e.target.checked)} />
              Strip metadata fields
            </label>
          </div>

          <button className="neon-btn mt-3 w-full rounded-lg px-3 py-2 text-sm" onClick={compressPdf}>
            {loading ? "Compressing..." : "Compress PDF"}
          </button>
          <button className="neon-btn mt-2 w-full rounded-lg px-3 py-2 text-sm" onClick={downloadResult} disabled={!resultBytes}>
            Download Compressed PDF
          </button>
        </aside>

        <section className="glass rounded-2xl p-4">
          <h2 className="text-lg font-semibold">Compression Details</h2>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <div className="rounded-lg bg-black/30 p-3 text-sm text-neutral-200">
              <p className="text-xs text-neutral-400">Source file</p>
              <p className="mt-1 font-medium">{sourceName}</p>
              <p className="mt-1 text-xs text-neutral-400">Levels are lossy image-based compression for maximum reduction.</p>
            </div>
            <div className="rounded-lg bg-black/30 p-3 text-sm text-neutral-200">
              <p className="text-xs text-neutral-400">Output file</p>
              <p className="mt-1 font-medium">{resultBytes ? resultName : "Not generated yet"}</p>
              <p className="mt-1 text-xs text-neutral-400">Download is enabled after compression completes.</p>
            </div>
          </div>

          <div className="mt-3 rounded-lg bg-black/35 p-3 text-sm text-neutral-200">
            <p>Status: {status}</p>
          </div>

          <div className="mt-4 rounded-lg border border-white/10 bg-black/25 p-3 text-xs text-neutral-300">
            <p className="mb-2 font-semibold text-white">Compression Notes</p>
            <p>Light: best readability, lowest reduction.</p>
            <p>Balanced: good default for most files.</p>
            <p>Strong: better size savings with visible quality tradeoff.</p>
            <p>Extreme: smallest files, strongest quality loss.</p>
          </div>
        </section>
      </section>
    </main>
  );
}
