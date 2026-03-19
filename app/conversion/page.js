"use client";

import { useRef, useState } from "react";
import dynamic from "next/dynamic";
import JSZip from "jszip";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import mammoth from "mammoth";
import * as XLSX from "xlsx";
import { PDFDocument } from "pdf-lib";
import { downloadBytes, fileToBytes, loadPdfJsLib } from "../lib/pdfClient";

const ReactQuill = dynamic(() => import("react-quill"), { ssr: false });

const QUILL_MODULES = {
  toolbar: [
    [{ header: [1, 2, 3, false] }],
    ["bold", "italic", "underline", "strike"],
    [{ color: [] }, { background: [] }],
    [{ list: "ordered" }, { list: "bullet" }],
    [{ align: [] }],
    ["blockquote", "code-block"],
    ["clean"]
  ]
};

const QUILL_FORMATS = [
  "header",
  "bold",
  "italic",
  "underline",
  "strike",
  "color",
  "background",
  "list",
  "bullet",
  "align",
  "blockquote",
  "code-block"
];

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function textToRichHtml(value) {
  const lines = String(value || "").split("\n");
  return lines.map((line) => `<p>${escapeHtml(line) || "<br/>"}</p>`).join("");
}

export default function ConversionPage() {
  const [pdfBytes, setPdfBytes] = useState(null);
  const [images, setImages] = useState([]);
  const [textValue, setTextValue] = useState("Type text for Text to PDF");
  const [richHtml, setRichHtml] = useState(textToRichHtml("Type text for Text to PDF"));
  const [excelFile, setExcelFile] = useState(null);
  const [pptxFile, setPptxFile] = useState(null);
  const [status, setStatus] = useState("Ready");
  const editorWrapRef = useRef(null);

  function setEditorFromPlainText(value) {
    const safe = String(value || "");
    setTextValue(safe);
    setRichHtml(textToRichHtml(safe));
  }

  async function uploadFiles(fileList) {
    const items = Array.from(fileList || []);
    const pdf = items.find((f) => f.name.toLowerCase().endsWith(".pdf"));
    if (pdf) setPdfBytes(await fileToBytes(pdf));

    const imgs = items.filter((f) => f.type.startsWith("image/"));
    if (imgs.length) setImages((prev) => [...prev, ...imgs]);

    const txt = items.find((f) => f.name.toLowerCase().endsWith(".txt"));
    if (txt) setEditorFromPlainText(await txt.text());

    const docx = items.find((f) => /\.docx?$/.test(f.name.toLowerCase()));
    if (docx) {
      if (docx.name.toLowerCase().endsWith(".docx")) {
        const result = await mammoth.extractRawText({ arrayBuffer: await docx.arrayBuffer() });
        setEditorFromPlainText(result.value);
      } else {
        setEditorFromPlainText(await docx.text());
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
      setRichHtml(textToRichHtml(fullText.trim()));
      downloadBytes(new TextEncoder().encode(fullText), "pdf-text.txt", "text/plain");
      setStatus("PDF to text completed");
    } catch (error) {
      setStatus(`Failed: ${error.message}`);
    }
  }

  async function textToPdf() {
    const editorNode = editorWrapRef.current?.querySelector(".ql-editor");
    const html = editorNode ? editorNode.innerHTML : richHtml;
    await exportRichHtmlToPdf(html, "text-to-pdf-rich.pdf");
  }

  async function exportRichHtmlToPdf(html, fileName) {
    try {
      const safeHtml = String(html || "").trim();
      if (!safeHtml) throw new Error("Editor is empty");

      const renderHost = document.createElement("div");
      renderHost.style.position = "fixed";
      renderHost.style.left = "-10000px";
      renderHost.style.top = "0";
      renderHost.style.width = "794px";
      renderHost.style.background = "#ffffff";
      renderHost.style.padding = "24px";
      renderHost.style.boxSizing = "border-box";
      renderHost.style.zIndex = "-1";
      renderHost.setAttribute("data-rich-pdf-host", "1");
      renderHost.innerHTML = `<div class="ql-editor" style="min-height:auto">${safeHtml}</div>`;
      document.body.appendChild(renderHost);

      const editorNode = renderHost.querySelector(".ql-editor");
      if (!editorNode) throw new Error("Rich editor content missing");

      setStatus("Rendering rich text to PDF...");

      const sourceCanvas = await html2canvas(editorNode, {
        scale: 2,
        backgroundColor: "#ffffff",
        useCORS: true,
        logging: false
      });

      const pdf = new jsPDF("p", "mm", "a4");
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 10;
      const usableWidth = pageWidth - margin * 2;
      const usableHeight = pageHeight - margin * 2;

      const pageCanvasHeightPx = Math.max(1, Math.floor((usableHeight * sourceCanvas.width) / usableWidth));

      let offsetPx = 0;
      let pageIndex = 0;
      while (offsetPx < sourceCanvas.height) {
        const sliceHeightPx = Math.min(pageCanvasHeightPx, sourceCanvas.height - offsetPx);
        const pageCanvas = document.createElement("canvas");
        pageCanvas.width = sourceCanvas.width;
        pageCanvas.height = sliceHeightPx;
        const ctx = pageCanvas.getContext("2d");
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
        ctx.drawImage(sourceCanvas, 0, offsetPx, sourceCanvas.width, sliceHeightPx, 0, 0, sourceCanvas.width, sliceHeightPx);

        const imgData = pageCanvas.toDataURL("image/png");
        const drawnHeightMm = (sliceHeightPx * usableWidth) / sourceCanvas.width;
        if (pageIndex > 0) pdf.addPage();
        pdf.addImage(imgData, "PNG", margin, margin, usableWidth, drawnHeightMm);

        offsetPx += sliceHeightPx;
        pageIndex += 1;
      }

      const bytes = pdf.output("arraybuffer");
      const outBytes = new Uint8Array(bytes);
      setPdfBytes(outBytes);
      downloadBytes(outBytes, fileName, "application/pdf");
      setStatus(`Text to PDF completed (${pageIndex} page${pageIndex > 1 ? "s" : ""})`);
    } catch (error) {
      setStatus(`Failed: ${error.message}`);
    } finally {
      const staleHosts = Array.from(document.querySelectorAll("div[data-rich-pdf-host='1']"));
      staleHosts.forEach((node) => node.remove());
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

      const cleanText = combined.trim();
      setEditorFromPlainText(cleanText);
      await exportRichHtmlToPdf(textToRichHtml(cleanText), "excel-to-pdf-rich.pdf");
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

      const cleanText = text.trim();
      setEditorFromPlainText(cleanText);
      await exportRichHtmlToPdf(textToRichHtml(cleanText), "pptx-to-pdf-rich.pdf");
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
            Rich Text to PDF
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

        <div className="mt-3 rounded-lg border border-white/15 bg-white p-2 text-black" ref={editorWrapRef}>
          <ReactQuill
            theme="snow"
            value={richHtml}
            onChange={(html, _delta, _source, editor) => {
              setRichHtml(html);
              setTextValue(editor.getText());
            }}
            modules={QUILL_MODULES}
            formats={QUILL_FORMATS}
            placeholder="Write and format your content here..."
          />
        </div>

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
