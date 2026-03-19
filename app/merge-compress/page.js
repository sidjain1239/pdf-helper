"use client";

import { useState } from "react";
import { PDFDocument, degrees } from "pdf-lib";
import { bytesToHuman, downloadBytes, fileToBytes, parseList, parseRange } from "../lib/pdfClient";

export default function MergeCompressPage() {
  const [files, setFiles] = useState([]);
  const [activeBytes, setActiveBytes] = useState(null);
  const [activeName, setActiveName] = useState("No file selected");
  const [status, setStatus] = useState("Ready");
  const [loading, setLoading] = useState(false);

  const [rangeInput, setRangeInput] = useState("1-1");
  const [listInput, setListInput] = useState("1");
  const [rotateValue, setRotateValue] = useState(90);
  const [reorderInput, setReorderInput] = useState("2,1");
  const [duplicatePageInput, setDuplicatePageInput] = useState("1");

  async function handleUpload(fileList) {
    const next = [];
    for (const f of fileList) {
      if (f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf")) {
        next.push({ id: crypto.randomUUID(), name: f.name, size: f.size, bytes: await fileToBytes(f) });
      }
    }
    if (next.length) {
      const merged = [...files, ...next];
      setFiles(merged);
      if (!activeBytes) {
        setActiveBytes(next[0].bytes);
        setActiveName(next[0].name);
      }
    }
  }

  function setActive(file) {
    setActiveBytes(file.bytes);
    setActiveName(file.name);
  }

  async function run(name, fn) {
    try {
      setLoading(true);
      setStatus(`${name} in progress...`);
      await fn();
      setStatus(`${name} completed`);
    } catch (error) {
      setStatus(`${name} failed: ${error.message}`);
    } finally {
      setLoading(false);
    }
  }

  async function mergeAll() {
    await run("Merge", async () => {
      if (!files.length) throw new Error("Upload PDF files first");
      const out = await PDFDocument.create();
      for (const file of files) {
        const src = await PDFDocument.load(file.bytes);
        const pages = await out.copyPages(src, src.getPageIndices());
        pages.forEach((p) => out.addPage(p));
      }
      const bytes = await out.save({ useObjectStreams: true });
      setActiveBytes(bytes);
      setActiveName("merged.pdf");
    });
  }

  async function splitRange() {
    await run("Split", async () => {
      if (!activeBytes) throw new Error("Select a PDF first");
      const src = await PDFDocument.load(activeBytes);
      const idx = parseRange(rangeInput, src.getPageCount());
      if (!idx.length) throw new Error("Invalid range");
      const out = await PDFDocument.create();
      const pages = await out.copyPages(src, idx);
      pages.forEach((p) => out.addPage(p));
      const bytes = await out.save({ useObjectStreams: true });
      setActiveBytes(bytes);
      setActiveName("split.pdf");
    });
  }

  async function extractPages() {
    await run("Extract", async () => {
      if (!activeBytes) throw new Error("Select a PDF first");
      const src = await PDFDocument.load(activeBytes);
      const idx = parseList(listInput, src.getPageCount());
      if (!idx.length) throw new Error("Invalid page list");
      const out = await PDFDocument.create();
      const pages = await out.copyPages(src, idx);
      pages.forEach((p) => out.addPage(p));
      const bytes = await out.save({ useObjectStreams: true });
      setActiveBytes(bytes);
      setActiveName("extracted.pdf");
    });
  }

  async function deletePages() {
    await run("Delete pages", async () => {
      if (!activeBytes) throw new Error("Select a PDF first");
      const src = await PDFDocument.load(activeBytes);
      const toDelete = new Set(parseList(listInput, src.getPageCount()));
      const keep = src.getPageIndices().filter((i) => !toDelete.has(i));
      const out = await PDFDocument.create();
      const pages = await out.copyPages(src, keep);
      pages.forEach((p) => out.addPage(p));
      const bytes = await out.save({ useObjectStreams: true });
      setActiveBytes(bytes);
      setActiveName("deleted-pages.pdf");
    });
  }

  async function rotatePages() {
    await run("Rotate pages", async () => {
      if (!activeBytes) throw new Error("Select a PDF first");
      const src = await PDFDocument.load(activeBytes);
      const idx = parseList(listInput, src.getPageCount());
      const pages = src.getPages();
      const target = idx.length ? idx : src.getPageIndices();
      target.forEach((i) => pages[i].setRotation(degrees(Number(rotateValue) || 0)));
      const bytes = await src.save({ useObjectStreams: true });
      setActiveBytes(bytes);
      setActiveName("rotated.pdf");
    });
  }

  async function reorderPages() {
    await run("Reorder", async () => {
      if (!activeBytes) throw new Error("Select a PDF first");
      const [fromStr, toStr] = reorderInput.split(",").map((s) => s.trim());
      const from = Number(fromStr) - 1;
      const to = Number(toStr) - 1;
      const src = await PDFDocument.load(activeBytes);
      const count = src.getPageCount();
      if (from < 0 || to < 0 || from >= count || to >= count) throw new Error("Invalid from,to");
      const order = src.getPageIndices();
      const [moved] = order.splice(from, 1);
      order.splice(to, 0, moved);
      const out = await PDFDocument.create();
      const pages = await out.copyPages(src, order);
      pages.forEach((p) => out.addPage(p));
      const bytes = await out.save({ useObjectStreams: true });
      setActiveBytes(bytes);
      setActiveName("reordered.pdf");
    });
  }

  async function compress() {
    await run("Compress", async () => {
      if (!activeBytes) throw new Error("Select a PDF first");
      const src = await PDFDocument.load(activeBytes);
      src.setProducer("PDF Toolkit On-device");
      const bytes = await src.save({ useObjectStreams: true, addDefaultPage: false });
      setActiveBytes(bytes);
      setActiveName("compressed.pdf");
    });
  }

  async function reversePages() {
    await run("Reverse pages", async () => {
      if (!activeBytes) throw new Error("Select a PDF first");
      const src = await PDFDocument.load(activeBytes);
      const order = src.getPageIndices().reverse();
      const out = await PDFDocument.create();
      const pages = await out.copyPages(src, order);
      pages.forEach((p) => out.addPage(p));
      const bytes = await out.save({ useObjectStreams: true });
      setActiveBytes(bytes);
      setActiveName("reversed.pdf");
    });
  }

  async function duplicatePage() {
    await run("Duplicate page", async () => {
      if (!activeBytes) throw new Error("Select a PDF first");
      const src = await PDFDocument.load(activeBytes);
      const count = src.getPageCount();
      const target = Number(duplicatePageInput) - 1;
      if (target < 0 || target >= count) throw new Error("Invalid page number");

      const order = src.getPageIndices();
      order.splice(target + 1, 0, target);
      const out = await PDFDocument.create();
      const pages = await out.copyPages(src, order);
      pages.forEach((p) => out.addPage(p));
      const bytes = await out.save({ useObjectStreams: true });
      setActiveBytes(bytes);
      setActiveName("duplicated-page.pdf");
    });
  }

  function downloadResult() {
    if (!activeBytes) return;
    downloadBytes(activeBytes, activeName.endsWith(".pdf") ? activeName : `${activeName}.pdf`);
  }

  return (
    <main className="mx-auto max-w-[1400px] p-4 md:p-6">
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
        <div className="glass rounded-2xl p-4">
          <h1 className="text-xl font-semibold">Merge + Compress</h1>
          <p className="mt-1 text-xs text-neutral-300">All processing is on-device for privacy.</p>

          <input
            type="file"
            accept=".pdf"
            multiple
            className="mt-3 w-full rounded-lg p-2 text-xs"
            onChange={(e) => handleUpload(e.target.files)}
          />

          <div className="mt-3 max-h-[40vh] overflow-auto rounded-lg bg-black/35 p-2">
            {files.map((file) => (
              <button
                key={file.id}
                onClick={() => setActive(file)}
                className="mb-1 block w-full truncate rounded bg-white/5 px-2 py-1 text-left text-xs hover:bg-white/10"
              >
                {file.name} ({bytesToHuman(file.size)})
              </button>
            ))}
          </div>

          <div className="mt-3 flex gap-2">
            <button className="neon-btn w-full rounded-lg px-3 py-2 text-sm" onClick={mergeAll}>
              Merge All
            </button>
            <button className="neon-btn w-full rounded-lg px-3 py-2 text-sm" onClick={compress}>
              Compress
            </button>
          </div>

          <div className="mt-2 grid grid-cols-2 gap-2">
            <button className="neon-btn rounded-lg px-3 py-2 text-sm" onClick={reversePages}>
              Reverse Pages
            </button>
            <div className="flex gap-2">
              <input
                type="number"
                min="1"
                value={duplicatePageInput}
                onChange={(e) => setDuplicatePageInput(e.target.value)}
                className="w-full rounded-lg p-2 text-xs"
                placeholder="Page#"
              />
              <button className="neon-btn rounded-lg px-3 py-2 text-xs" onClick={duplicatePage}>
                Duplicate
              </button>
            </div>
          </div>

          <button className="neon-btn mt-2 w-full rounded-lg px-3 py-2 text-sm" onClick={downloadResult}>
            Download Result
          </button>
        </div>

        <div className="glass rounded-2xl p-4">
          <div className="mb-3 flex items-center justify-between text-sm">
            <h2 className="font-semibold">Page Operations</h2>
            <span className="text-xs text-neutral-300">{loading ? "Processing..." : status}</span>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-xl bg-black/30 p-3">
              <label className="text-xs text-neutral-300">Split Range</label>
              <input
                value={rangeInput}
                onChange={(e) => setRangeInput(e.target.value)}
                className="mt-1 w-full rounded-lg p-2"
                placeholder="1-3"
              />
              <button className="neon-btn mt-2 w-full rounded-lg px-3 py-2" onClick={splitRange}>
                Split
              </button>
            </div>

            <div className="rounded-xl bg-black/30 p-3">
              <label className="text-xs text-neutral-300">Page List</label>
              <input
                value={listInput}
                onChange={(e) => setListInput(e.target.value)}
                className="mt-1 w-full rounded-lg p-2"
                placeholder="1,3,5"
              />
              <div className="mt-2 grid grid-cols-2 gap-2">
                <button className="neon-btn rounded-lg px-3 py-2" onClick={extractPages}>
                  Extract
                </button>
                <button className="neon-btn rounded-lg px-3 py-2" onClick={deletePages}>
                  Delete
                </button>
              </div>
            </div>

            <div className="rounded-xl bg-black/30 p-3">
              <label className="text-xs text-neutral-300">Rotate Value</label>
              <input
                type="number"
                value={rotateValue}
                onChange={(e) => setRotateValue(e.target.value)}
                className="mt-1 w-full rounded-lg p-2"
              />
              <button className="neon-btn mt-2 w-full rounded-lg px-3 py-2" onClick={rotatePages}>
                Rotate Pages
              </button>
            </div>

            <div className="rounded-xl bg-black/30 p-3">
              <label className="text-xs text-neutral-300">Reorder from,to</label>
              <input
                value={reorderInput}
                onChange={(e) => setReorderInput(e.target.value)}
                className="mt-1 w-full rounded-lg p-2"
                placeholder="2,1"
              />
              <button className="neon-btn mt-2 w-full rounded-lg px-3 py-2" onClick={reorderPages}>
                Reorder
              </button>
            </div>
          </div>

          <div className="mt-4 rounded-lg bg-black/35 p-3 text-xs text-neutral-300">
            Active file: <span className="font-semibold text-white">{activeName}</span>
          </div>

          <div className="mt-3 rounded-lg border border-white/10 bg-black/25 p-3 text-xs text-neutral-300">
            <p className="mb-2 font-semibold text-white">Meanings of terms</p>
            <p>Split Range: choose first and last page to keep. Example: 1-3 means pages 1 to 3.</p>
            <p>Page List: write specific pages with commas. Example: 1,4,7.</p>
            <p>Rotate Value: degrees to rotate selected pages. Common values: 90, 180, 270.</p>
            <p>Reorder from,to: move one page position to another. Example: 2,1 moves page 2 before page 1.</p>
            <p>Duplicate page: enter one page number to make one extra copy of that page.</p>
          </div>
        </div>
      </section>
    </main>
  );
}
