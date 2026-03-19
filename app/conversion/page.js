"use client";

import { useState } from "react";
import JSZip from "jszip";
import mammoth from "mammoth";
import * as XLSX from "xlsx";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { downloadBytes, fileToBytes, loadPdfJsLib } from "../lib/pdfClient";

export default function ConversionPage() {
  const [pdfBytes, setPdfBytes] = useState(null);
  const [images, setImages] = useState([]);
  const [textValue, setTextValue] = useState("Type text for Text to PDF");
  const [excelFile, setExcelFile] = useState(null);
  const [pptxFile, setPptxFile] = useState(null);
  const [status, setStatus] = useState("Ready");

  async function uploadFiles(fileList) {
    const items = Array.from(fileList || []);
    const pdf = items.find((f) => f.name.toLowerCase().endsWith(".pdf"));
    if (pdf) setPdfBytes(await fileToBytes(pdf));

    const imgs = items.filter((f) => f.type.startsWith("image/"));
    if (imgs.length) setImages((prev) => [...prev, ...imgs]);

    const txt = items.find((f) => f.name.toLowerCase().endsWith(".txt"));
    if (txt) setTextValue(await txt.text());

    const docx = items.find((f) => /\.docx?$/.test(f.name.toLowerCase()));
    if (docx) {
      if (docx.name.toLowerCase().endsWith(".docx")) {
        const result = await mammoth.extractRawText({ arrayBuffer: await docx.arrayBuffer() });
        setTextValue(result.value);
      } else {
        setTextValue(await docx.text());
      }
    }

    const excel = items.find((f) => /\.(xlsx|xls)$/i.test(f.name));
    if (excel) setExcelFile(excel);

    const ppt = items.find((f) => /\.(pptx|ppt)$/i.test(f.name));
    if (ppt) setPptxFile(ppt);
  }

  async function pdfToImages() {
    try {
      if (!pdfBytes) throw new Error("Upload a PDF first");
      setStatus("Converting PDF to images...");
      const pdfjs = await loadPdfJsLib();
      const doc = await pdfjs.getDocument({ data: pdfBytes }).promise;
      const zip = new JSZip();
      for (let i = 1; i <= doc.numPages; i += 1) {
        const page = await doc.getPage(i);
        const viewport = page.getViewport({ scale: 1.5 });
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        await page.render({ canvasContext: ctx, viewport }).promise;
        const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png", 1));
        zip.file(`page-${i}.png`, blob);
      }
      const out = await zip.generateAsync({ type: "uint8array" });
      downloadBytes(out, "pdf-images.zip", "application/zip");
      setStatus("PDF to images completed");
    } catch (error) {
      setStatus(`Failed: ${error.message}`);
    }
  }

  async function imagesToPdf() {
    try {
      if (!images.length) throw new Error("Upload images first");
      setStatus("Converting images to PDF...");
      const out = await PDFDocument.create();
      for (const imgFile of images) {
        const bytes = await imgFile.arrayBuffer();
        const image = imgFile.type.includes("png") ? await out.embedPng(bytes) : await out.embedJpg(bytes);
        const page = out.addPage([image.width, image.height]);
        page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });
      }
      const bytes = await out.save({ useObjectStreams: true });
      setPdfBytes(bytes);
      downloadBytes(bytes, "images-to-pdf.pdf");
      setStatus("Images to PDF completed");
    } catch (error) {
      setStatus(`Failed: ${error.message}`);
    }
  }

  async function pdfToText() {
    try {
      if (!pdfBytes) throw new Error("Upload a PDF first");
      setStatus("Extracting text from PDF...");
      const pdfjs = await loadPdfJsLib();
      const doc = await pdfjs.getDocument({ data: pdfBytes }).promise;
      let fullText = "";
      for (let i = 1; i <= doc.numPages; i += 1) {
        const page = await doc.getPage(i);
        const content = await page.getTextContent();
        fullText += `\n\n--- Page ${i} ---\n` + content.items.map((item) => item.str).join(" ");
      }
      setTextValue(fullText.trim());
      downloadBytes(new TextEncoder().encode(fullText), "pdf-text.txt", "text/plain");
      setStatus("PDF to text completed");
    } catch (error) {
      setStatus(`Failed: ${error.message}`);
    }
  }

  async function textToPdf() {
    try {
      setStatus("Converting text to PDF...");
      const out = await PDFDocument.create();
      const font = await out.embedFont(StandardFonts.Helvetica);
      const lines = (textValue || "").split("\n");
      let page = out.addPage([595, 842]);
      let y = 800;
      for (const line of lines) {
        if (y < 60) {
          page = out.addPage([595, 842]);
          y = 800;
        }
        page.drawText(line.slice(0, 110), { x: 40, y, size: 12, font, color: rgb(0, 0, 0) });
        y -= 18;
      }
      const bytes = await out.save({ useObjectStreams: true });
      setPdfBytes(bytes);
      downloadBytes(bytes, "text-to-pdf.pdf");
      setStatus("Text to PDF completed");
    } catch (error) {
      setStatus(`Failed: ${error.message}`);
    }
  }

  async function wordToPdf() {
    await textToPdf();
  }

  async function excelToPdf() {
    try {
      if (!excelFile) throw new Error("Upload .xlsx or .xls first");
      setStatus("Converting Excel to PDF (basic)...");

      const workbook = XLSX.read(await excelFile.arrayBuffer(), { type: "array" });
      let combined = "";

      workbook.SheetNames.forEach((sheetName) => {
        const sheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false });
        combined += `\n\n=== Sheet: ${sheetName} ===\n`;
        rows.forEach((row) => {
          const line = Array.isArray(row) ? row.join(" | ") : String(row);
          combined += line + "\n";
        });
      });

      setTextValue(combined.trim());
      await textToPdf();
      setStatus("Excel to PDF completed");
    } catch (error) {
      setStatus(`Failed: ${error.message}`);
    }
  }

  async function pptToPdf() {
    try {
      if (!pptxFile) throw new Error("Upload .pptx first (.ppt is not fully supported)");
      if (!/\.pptx$/i.test(pptxFile.name)) {
        throw new Error("For best results, convert .ppt to .pptx and upload .pptx");
      }

      setStatus("Converting PPTX to PDF (basic)...");
      const zip = await JSZip.loadAsync(await pptxFile.arrayBuffer());
      const slideNames = Object.keys(zip.files)
        .filter((name) => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

      if (!slideNames.length) throw new Error("No slides found");

      let text = "";
      for (let i = 0; i < slideNames.length; i += 1) {
        const xml = await zip.file(slideNames[i]).async("string");
        const parts = Array.from(xml.matchAll(/<a:t>(.*?)<\/a:t>/g)).map((m) => m[1]);
        text += `\n\n--- Slide ${i + 1} ---\n${parts.join(" ")}`;
      }

      setTextValue(text.trim());
      await textToPdf();
      setStatus("PPTX to PDF completed");
    } catch (error) {
      setStatus(`Failed: ${error.message}`);
    }
  }

  async function pdfToWord() {
    try {
      if (!pdfBytes) throw new Error("Upload a PDF first");
      setStatus("Converting PDF to Word (basic)...");
      const pdfjs = await loadPdfJsLib();
      const doc = await pdfjs.getDocument({ data: pdfBytes }).promise;
      let fullText = "";
      for (let i = 1; i <= doc.numPages; i += 1) {
        const page = await doc.getPage(i);
        const content = await page.getTextContent();
        fullText += content.items.map((item) => item.str).join(" ") + "\n\n";
      }
      const html = `<html><body><pre>${fullText.replace(/[<>&]/g, "")}</pre></body></html>`;
      downloadBytes(new TextEncoder().encode(html), "pdf-to-word.doc", "application/msword");
      setStatus("PDF to Word (basic) completed");
    } catch (error) {
      setStatus(`Failed: ${error.message}`);
    }
  }

  return (
    <main className="mx-auto max-w-[1400px] p-4 md:p-6">
      <section className="glass rounded-2xl p-4 md:p-5">
        <h1 className="text-xl font-semibold">Conversion Tools</h1>
        <p className="mt-1 text-xs text-neutral-300">All conversion runs on-device in your browser.</p>

        <input
          type="file"
          multiple
          accept=".pdf,.txt,.doc,.docx,.xlsx,.xls,.pptx,.ppt,image/*"
          className="mt-3 w-full rounded-lg p-2 text-xs"
          onChange={(e) => uploadFiles(e.target.files)}
        />

        <div className="mt-3 grid gap-2 md:grid-cols-3">
          <button className="neon-btn rounded-lg px-3 py-2" onClick={pdfToImages}>
            PDF to Images
          </button>
          <button className="neon-btn rounded-lg px-3 py-2" onClick={imagesToPdf}>
            Images to PDF
          </button>
          <button className="neon-btn rounded-lg px-3 py-2" onClick={pdfToText}>
            PDF to Text
          </button>
          <button className="neon-btn rounded-lg px-3 py-2" onClick={textToPdf}>
            Text to PDF
          </button>
          <button className="neon-btn rounded-lg px-3 py-2" onClick={wordToPdf}>
            Word to PDF (basic)
          </button>
          <button className="neon-btn rounded-lg px-3 py-2" onClick={pdfToWord}>
            PDF to Word (basic)
          </button>
          <button className="neon-btn rounded-lg px-3 py-2" onClick={excelToPdf}>
            Excel to PDF (basic)
          </button>
          <button className="neon-btn rounded-lg px-3 py-2" onClick={pptToPdf}>
            PPTX to PDF (basic)
          </button>
        </div>

        <textarea
          value={textValue}
          onChange={(e) => setTextValue(e.target.value)}
          className="mt-3 h-48 w-full rounded-lg p-3"
        />

        <div className="mt-2 rounded-lg bg-black/30 p-2 text-xs text-neutral-300">
          <p>Excel selected: {excelFile ? excelFile.name : "None"}</p>
          <p>PPT selected: {pptxFile ? pptxFile.name : "None"}</p>
          <p className="mt-1 text-neutral-400">Note: PPT conversion works best with .pptx files.</p>
        </div>

        <div className="mt-2 rounded-lg bg-black/35 p-2 text-xs text-neutral-300">Status: {status}</div>
      </section>
    </main>
  );
}
