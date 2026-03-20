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

function resolveZipPath(baseFilePath, targetPath) {
  const baseDir = baseFilePath.replace(/[^/]+$/, "");
  const baseUrl = new URL(`https://pptx.local/${baseDir}`);
  return new URL(String(targetPath || "").replace(/\\/g, "/"), baseUrl).pathname.replace(/^\//, "");
}

function mimeFromPath(path) {
  const lower = String(path || "").toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".webp")) return "image/webp";
  return "";
}

function loadBrowserImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Image decode failed"));
    img.src = src;
  });
}

function normalizeHexColor(input) {
  if (!input) return undefined;
  const v = String(input).trim();
  if (/^#[0-9a-f]{6}$/i.test(v)) return v;
  if (/^#[0-9a-f]{3}$/i.test(v)) {
    return `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`;
  }
  const rgbMatch = v.match(/^rgba?\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (rgbMatch) {
    const r = Number(rgbMatch[1]).toString(16).padStart(2, "0");
    const g = Number(rgbMatch[2]).toString(16).padStart(2, "0");
    const b = Number(rgbMatch[3]).toString(16).padStart(2, "0");
    return `#${r}${g}${b}`;
  }
  return undefined;
}

function mapQuillSize(size) {
  if (size === "small") return 10;
  if (size === "large") return 16;
  if (size === "huge") return 20;
  const parsed = Number(String(size || "").replace(/px$/i, ""));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function quillDeltaToLines(delta) {
  const ops = Array.isArray(delta?.ops) ? delta.ops : [];
  const lines = [];
  let currentLine = { segments: [], attrs: {} };

  for (const op of ops) {
    const attrs = op.attributes || {};

    if (typeof op.insert !== "string") continue;
    const parts = op.insert.split("\n");

    for (let i = 0; i < parts.length; i += 1) {
      const part = parts[i];
      if (part) {
        currentLine.segments.push({ text: part, attrs });
      }
      if (i < parts.length - 1) {
        currentLine.attrs = attrs;
        lines.push(currentLine);
        currentLine = { segments: [], attrs: {} };
      }
    }
  }

  if (currentLine.segments.length) lines.push(currentLine);

  return lines;
}

function parseHexColorToRgb(hex) {
  const normalized = normalizeHexColor(hex);
  if (!normalized) return null;
  return [
    Number.parseInt(normalized.slice(1, 3), 16),
    Number.parseInt(normalized.slice(3, 5), 16),
    Number.parseInt(normalized.slice(5, 7), 16)
  ];
}

function lineFontSize(lineAttrs, segments) {
  const header = Number(lineAttrs?.header || 0);
  if (header === 1) return 26;
  if (header === 2) return 22;
  if (header === 3) return 18;

  let maxInline = 12;
  segments.forEach((seg) => {
    const s = mapQuillSize(seg?.attrs?.size);
    if (s && s > maxInline) maxInline = s;
  });
  return maxInline;
}

function setPdfRunStyle(pdf, attrs, fallbackSize) {
  const bold = Boolean(attrs?.bold);
  const italic = Boolean(attrs?.italic);
  const style = bold && italic ? "bolditalic" : bold ? "bold" : italic ? "italic" : "normal";
  const size = mapQuillSize(attrs?.size) || fallbackSize;
  const color = parseHexColorToRgb(attrs?.color) || [17, 17, 17];

  pdf.setFont("helvetica", style);
  pdf.setFontSize(size);
  pdf.setTextColor(color[0], color[1], color[2]);
  return { size };
}

function drawWrappedPlainLine(pdf, text, options) {
  const { margin, yRef, contentWidth, pageHeight, lineHeight, align = "left" } = options;
  const chunks = pdf.splitTextToSize(text || " ", contentWidth);
  chunks.forEach((chunk) => {
    if (yRef.value > pageHeight - margin) {
      pdf.addPage();
      yRef.value = margin;
    }
    let x = margin;
    if (align === "center") {
      x = margin + (contentWidth - pdf.getTextWidth(chunk)) / 2;
    } else if (align === "right") {
      x = margin + contentWidth - pdf.getTextWidth(chunk);
    }
    pdf.text(chunk, x, yRef.value);
    yRef.value += lineHeight;
  });
}

function drawRichDeltaToJsPdf(pdf, delta) {
  const margin = 48;
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const contentWidth = pageWidth - margin * 2;
  const lines = quillDeltaToLines(delta);
  const yRef = { value: margin };

  if (!lines.length) {
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(12);
    pdf.setTextColor(17, 17, 17);
    pdf.text(" ", margin, yRef.value);
    return;
  }

  let orderedIndex = 1;

  lines.forEach((line) => {
    const lineAttrs = line.attrs || {};
    const baseSize = lineFontSize(lineAttrs, line.segments);
    const lineHeight = Math.max(16, Math.round(baseSize * 1.35));
    const align = lineAttrs.align || "left";

    let prefix = "";
    if (lineAttrs.list === "bullet") prefix = "• ";
    if (lineAttrs.list === "ordered") {
      prefix = `${orderedIndex}. `;
      orderedIndex += 1;
    }
    if (!lineAttrs.list) orderedIndex = 1;

    if (align !== "left" || lineAttrs.blockquote || lineAttrs["code-block"]) {
      const text = `${prefix}${line.segments.map((s) => s.text || "").join("")}`;
      pdf.setFont("helvetica", lineAttrs.blockquote ? "italic" : lineAttrs["code-block"] ? "normal" : "normal");
      pdf.setFontSize(baseSize);
      pdf.setTextColor(lineAttrs.blockquote ? 55 : 17, lineAttrs.blockquote ? 65 : 17, lineAttrs.blockquote ? 81 : 17);
      drawWrappedPlainLine(pdf, text, { margin, yRef, contentWidth, pageHeight, lineHeight, align });
      return;
    }

    let x = margin;
    if (prefix) {
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(baseSize);
      pdf.setTextColor(17, 17, 17);
      pdf.text(prefix, x, yRef.value);
      x += pdf.getTextWidth(prefix);
    }

    const segments = line.segments.length ? line.segments : [{ text: " " }];
    segments.forEach((seg) => {
      const attrs = seg.attrs || {};
      setPdfRunStyle(pdf, attrs, baseSize);
      const tokens = String(seg.text || "").split(/(\s+)/).filter((v) => v.length);

      tokens.forEach((token) => {
        const tokenWidth = pdf.getTextWidth(token);
        if (x + tokenWidth > margin + contentWidth && token.trim()) {
          yRef.value += lineHeight;
          if (yRef.value > pageHeight - margin) {
            pdf.addPage();
            yRef.value = margin;
          }
          x = margin;
        }
        pdf.text(token, x, yRef.value);
        x += tokenWidth;
      });
    });

    yRef.value += lineHeight;
    if (yRef.value > pageHeight - margin) {
      pdf.addPage();
      yRef.value = margin;
    }
  });
}

function tryXmlColorToCss(node, fallback = "#ffffff") {
  if (!node) return fallback;
  const srgb = node.getElementsByTagName("a:srgbClr")[0] || node.getElementsByTagName("srgbClr")[0];
  const val = srgb?.getAttribute("val") || "";
  return /^[0-9a-f]{6}$/i.test(val) ? `#${val}` : fallback;
}

export default function ConversionPage() {
  const [pdfBytes, setPdfBytes] = useState(null);
  const [images, setImages] = useState([]);
  const [textValue, setTextValue] = useState("Type text for Text to PDF");
  const [richHtml, setRichHtml] = useState(textToRichHtml("Type text for Text to PDF"));
  const [wordFile, setWordFile] = useState(null);
  const [excelFile, setExcelFile] = useState(null);
  const [pptxFile, setPptxFile] = useState(null);
  const [status, setStatus] = useState("Ready");
  const editorWrapRef = useRef(null);
  const quillRef = useRef(null);

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
      setWordFile(docx);
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
    const staleHosts = [];
    try {
      setStatus("Converting rich text to styled PDF...");
      const editor = quillRef.current?.getEditor?.();
      const delta = editor?.getContents?.() || { ops: [{ insert: textValue || "" }] };
      const editorHtml = editor?.root?.innerHTML || richHtml || textToRichHtml(textValue || "");

      const renderHost = document.createElement("div");
      renderHost.style.position = "fixed";
      renderHost.style.left = "-10000px";
      renderHost.style.top = "0";
      renderHost.style.width = "900px";
      renderHost.style.background = "#ffffff";
      renderHost.style.padding = "24px";
      renderHost.style.boxSizing = "border-box";
      renderHost.style.zIndex = "-1";
      renderHost.setAttribute("data-rich-pdf-host", "1");
      renderHost.innerHTML = `
        <style>
          .ql-editor { color: #111111; line-height: 1.45; font-family: Arial, sans-serif; }
          .ql-editor .ql-align-center { text-align: center; }
          .ql-editor .ql-align-right { text-align: right; }
          .ql-editor .ql-align-justify { text-align: justify; }
          .ql-editor h1 { font-size: 2em; margin: 0.5em 0; }
          .ql-editor h2 { font-size: 1.5em; margin: 0.5em 0; }
          .ql-editor h3 { font-size: 1.17em; margin: 0.4em 0; }
          .ql-editor blockquote { border-left: 4px solid #cccccc; margin: 0.5em 0; padding-left: 10px; color: #444444; }
          .ql-editor pre { background: #f4f4f4; padding: 8px; border-radius: 4px; }
        </style>
        <div class="ql-editor">${editorHtml}</div>
      `;
      document.body.appendChild(renderHost);
      staleHosts.push(renderHost);
      const rootNode = renderHost.querySelector(".ql-editor");
      if (!rootNode) throw new Error("Renderable content missing");

      const pdf = new jsPDF("p", "pt", "a4");

      // Prefer HTML rendering for richer style fidelity from Quill content.
      try {
        await Promise.race([
          pdf.html(rootNode, {
            x: 48,
            y: 48,
            width: pdf.internal.pageSize.getWidth() - 96,
            windowWidth: 900,
            autoPaging: "text",
            html2canvas: {
              scale: 1,
              backgroundColor: "#ffffff",
              useCORS: true,
              logging: false
            }
          }),
          new Promise((_, reject) => setTimeout(() => reject(new Error("HTML renderer timeout")), 30000))
        ]);
      } catch {
        // Fallback keeps conversion resilient when HTML rendering fails on some content.
        drawRichDeltaToJsPdf(pdf, delta);
      }

      const outBytes = new Uint8Array(pdf.output("arraybuffer"));
      setPdfBytes(outBytes);
      downloadBytes(outBytes, "text-to-pdf-rich.pdf", "application/pdf");
      setStatus("Rich Text to PDF completed");
    } catch (error) {
      setStatus(`Failed: ${error.message}`);
    } finally {
      staleHosts.forEach((node) => node.remove());
    }
  }

  async function exportRichHtmlToPdf(html, fileName) {
    await exportHtmlDocumentToPdf(html, fileName, { mode: "flow" });
  }

  async function exportHtmlDocumentToPdf(html, fileName, options = {}) {
    try {
      const safeHtml = String(html || "").trim();
      if (!safeHtml) throw new Error("Editor is empty");

      const mode = options.mode || "flow";
      const orientation = options.orientation || "p";
      const rootClass = options.rootClass || "ql-editor";

      const renderHost = document.createElement("div");
      renderHost.style.position = "fixed";
      renderHost.style.left = "-10000px";
      renderHost.style.top = "0";
      renderHost.style.width = options.width || "960px";
      renderHost.style.background = "#ffffff";
      renderHost.style.padding = "24px";
      renderHost.style.boxSizing = "border-box";
      renderHost.style.zIndex = "-1";
      renderHost.setAttribute("data-rich-pdf-host", "1");
      renderHost.innerHTML = `<div class="${rootClass}" style="min-height:auto">${safeHtml}</div>`;
      document.body.appendChild(renderHost);

      const rootNode = renderHost.querySelector(`.${rootClass}`);
      if (!rootNode) throw new Error("Renderable content missing");

      setStatus("Rendering rich text to PDF...");

      const pdf = new jsPDF(orientation, "mm", "a4");
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 10;
      const usableWidth = pageWidth - margin * 2;
      const usableHeight = pageHeight - margin * 2;

      if (mode === "slides") {
        const slideNodes = Array.from(rootNode.querySelectorAll(".ppt-slide"));
        if (!slideNodes.length) throw new Error("No slides found to render");

        for (let i = 0; i < slideNodes.length; i += 1) {
          const canvas = await html2canvas(slideNodes[i], {
            scale: 2,
            backgroundColor: "#ffffff",
            useCORS: true,
            logging: false
          });
          if (i > 0) pdf.addPage();
          const drawnHeightMm = (canvas.height * usableWidth) / canvas.width;
          const imgData = canvas.toDataURL("image/png");
          pdf.addImage(imgData, "PNG", margin, margin, usableWidth, Math.min(usableHeight, drawnHeightMm));
        }
      } else {
        const sourceCanvas = await html2canvas(rootNode, {
          scale: 2,
          backgroundColor: "#ffffff",
          useCORS: true,
          logging: false
        });

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
      }

      const bytes = pdf.output("arraybuffer");
      const outBytes = new Uint8Array(bytes);
      setPdfBytes(outBytes);
      downloadBytes(outBytes, fileName, "application/pdf");
      setStatus(`${fileName} generated`);
    } catch (error) {
      setStatus(`Failed: ${error.message}`);
    } finally {
      const staleHosts = Array.from(document.querySelectorAll("div[data-rich-pdf-host='1']"));
      staleHosts.forEach((node) => node.remove());
    }
  }

  async function wordToPdf() {
    try {
      if (!wordFile) throw new Error("Upload .docx or .doc first");
      setStatus("Converting Word to PDF with document formatting...");

      if (/\.docx$/i.test(wordFile.name)) {
        const result = await mammoth.convertToHtml(
          { arrayBuffer: await wordFile.arrayBuffer() },
          {
            includeDefaultStyleMap: true,
            styleMap: [
              "p[style-name='Title'] => h1:fresh",
              "p[style-name='Heading 1'] => h1:fresh",
              "p[style-name='Heading 2'] => h2:fresh",
              "p[style-name='Heading 3'] => h3:fresh"
            ]
          }
        );

        const docsBody = String(result.value || "")
          .replace(/<table/gi, '<table style="border-collapse:collapse; width:100%; margin:8px 0"')
          .replace(/<td/gi, '<td style="border:1px solid #d1d5db; padding:6px 8px; vertical-align:top"')
          .replace(/<th/gi, '<th style="border:1px solid #9ca3af; background:#f3f4f6; padding:6px 8px; text-align:left"');

        const html = `
          <div class="word-doc" style="background:#f1f3f4; padding:24px 0; color:#202124; font-family:Arial, Helvetica, sans-serif;">
            <div style="width:816px; margin:0 auto; background:#fff; box-shadow:0 1px 4px rgba(0,0,0,0.18); border:1px solid #e5e7eb; padding:72px 64px; box-sizing:border-box; font-family:Calibri, Arial, sans-serif; font-size:12pt; line-height:1.5; color:#202124;">
              ${docsBody}
            </div>
          </div>
        `;
        setRichHtml(docsBody);
        await exportHtmlDocumentToPdf(html, "word-to-pdf.pdf", { mode: "flow", rootClass: "word-doc", width: "980px" });
      } else {
        const plain = await wordFile.text();
        const html = `
          <div class="word-doc" style="background:#f1f3f4; padding:24px 0; color:#202124; font-family:Arial, Helvetica, sans-serif;">
            <div style="width:816px; margin:0 auto; background:#fff; box-shadow:0 1px 4px rgba(0,0,0,0.18); border:1px solid #e5e7eb; padding:72px 64px; box-sizing:border-box; font-family:'Times New Roman', serif; font-size:12pt; line-height:1.5; color:#202124; white-space:pre-wrap;">${escapeHtml(plain)}</div>
          </div>
        `;
        setEditorFromPlainText(plain);
        await exportHtmlDocumentToPdf(html, "word-to-pdf.pdf", { mode: "flow", rootClass: "word-doc", width: "980px" });
      }

      setStatus("Word to PDF completed");
    } catch (error) {
      setStatus(`Failed: ${error.message}`);
    }
  }

  async function excelToPdf() {
    try {
      if (!excelFile) throw new Error("Upload .xlsx or .xls first");
      setStatus("Converting Excel to PDF with sheet formatting...");

      const workbook = XLSX.read(await excelFile.arrayBuffer(), {
        type: "array",
        cellStyles: true,
        cellNF: true,
        cellDates: true,
        dense: false
      });

      const sheetsHtml = workbook.SheetNames.map((sheetName, idx) => {
        const sheet = workbook.Sheets[sheetName];
        const tableHtml = XLSX.utils.sheet_to_html(sheet, {
          id: `sheet-${idx}`,
          editable: false,
          header: "",
          footer: ""
        });

        return `
          <section style="margin-bottom:24px; page-break-inside:avoid; background:#fff; border:1px solid #e5e7eb;">
            <div style="padding:10px 12px; border-bottom:1px solid #e5e7eb; background:#f8f9fa; font-family:Calibri, Arial, sans-serif; font-size:14px; font-weight:600; color:#111827;">${escapeHtml(sheetName)}</div>
            <div style="padding:8px; overflow:hidden;">
              ${tableHtml}
            </div>
          </section>
        `;
      }).join("");

      const html = `
        <div class=\"excel-doc\" style=\"background:#fff; color:#111;\">
          <style>
            .excel-doc table { border-collapse: collapse; width: max-content; min-width: 100%; font-family: Calibri, Arial, sans-serif; font-size: 12px; }
            .excel-doc td, .excel-doc th { border: 1px solid #d1d5db; padding: 6px 8px; vertical-align: middle; white-space: pre-wrap; }
            .excel-doc tr:nth-child(1) td { font-weight: 600; background: #f8fafc; }
          </style>
          ${sheetsHtml}
        </div>
      `;
      await exportHtmlDocumentToPdf(html, "excel-to-pdf.pdf", { mode: "flow", rootClass: "excel-doc", width: "1200px" });
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

      setStatus("Converting PPTX slides to PDF (image preserve mode)...");
      const zip = await JSZip.loadAsync(await pptxFile.arrayBuffer());
      const slideNames = Object.keys(zip.files)
        .filter((name) => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

      if (!slideNames.length) throw new Error("No slides found");

      const presentationXml = await zip.file("ppt/presentation.xml")?.async("string");
      let slideWidthPx = 960;
      let slideHeightPx = 540;
      if (presentationXml) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(presentationXml, "application/xml");
        const sizeNode = doc.getElementsByTagName("p:sldSz")[0] || doc.getElementsByTagName("sldSz")[0];
        if (sizeNode) {
          const cx = Number(sizeNode.getAttribute("cx") || 0);
          const cy = Number(sizeNode.getAttribute("cy") || 0);
          if (cx > 0 && cy > 0) {
            slideWidthPx = Math.round((cx / 914400) * 96);
            slideHeightPx = Math.round((cy / 914400) * 96);
          }
        }
      }

      const pdf = new jsPDF({
        orientation: slideWidthPx >= slideHeightPx ? "l" : "p",
        unit: "px",
        format: [slideWidthPx, slideHeightPx]
      });

      for (let i = 0; i < slideNames.length; i += 1) {
        const slidePath = slideNames[i];
        setStatus(`Rendering slide ${i + 1}/${slideNames.length}...`);

        const xml = await zip.file(slidePath).async("string");
        const parser = new DOMParser();
        const doc = parser.parseFromString(xml, "application/xml");
        const canvas = document.createElement("canvas");
        canvas.width = slideWidthPx;
        canvas.height = slideHeightPx;
        const ctx = canvas.getContext("2d");

        const relPath = slidePath.replace("ppt/slides/", "ppt/slides/_rels/") + ".rels";
        const relXml = await zip.file(relPath)?.async("string");
        const relDoc = relXml ? parser.parseFromString(relXml, "application/xml") : null;
        const relNodes = relDoc
          ? Array.from(relDoc.getElementsByTagName("Relationship")).concat(Array.from(relDoc.getElementsByTagName("rel:Relationship")))
          : [];
        const relMap = {};
        relNodes.forEach((relNode) => {
          const id = relNode.getAttribute("Id") || relNode.getAttribute("r:Id");
          const target = relNode.getAttribute("Target") || "";
          if (id && target) relMap[id] = resolveZipPath(relPath, target);
        });

        const bgPr = doc.getElementsByTagName("p:bgPr")[0] || doc.getElementsByTagName("bgPr")[0];
        const bgSolid = bgPr?.getElementsByTagName("a:solidFill")[0] || bgPr?.getElementsByTagName("solidFill")[0];
        const bgColor = tryXmlColorToCss(bgSolid, "#ffffff");
        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        const bgBlip = bgPr?.getElementsByTagName("a:blip")[0] || bgPr?.getElementsByTagName("blip")[0];
        const bgEmbedId = bgBlip?.getAttribute("r:embed") || bgBlip?.getAttribute("embed") || "";
        const bgTarget = bgEmbedId ? relMap[bgEmbedId] : "";
        if (bgTarget) {
          const bgMime = mimeFromPath(bgTarget);
          const bgMedia = zip.file(bgTarget);
          if (bgMime && bgMedia) {
            try {
              const b64 = await bgMedia.async("base64");
              const img = await loadBrowserImage(`data:${bgMime};base64,${b64}`);
              ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            } catch {
              // Keep solid background if image decode fails.
            }
          }
        }

        const picNodes = Array.from(doc.getElementsByTagName("p:pic")).concat(Array.from(doc.getElementsByTagName("pic")));
        let drawnAny = false;

        for (const pic of picNodes) {
          const blip = pic.getElementsByTagName("a:blip")[0] || pic.getElementsByTagName("blip")[0];
          const embedId = blip?.getAttribute("r:embed") || blip?.getAttribute("embed");
          const target = embedId ? relMap[embedId] : "";
          if (!target) continue;

          const mime = mimeFromPath(target);
          if (!mime) continue;
          const mediaFile = zip.file(target);
          if (!mediaFile) continue;

          const xfrm = pic.getElementsByTagName("a:xfrm")[0] || pic.getElementsByTagName("xfrm")[0];
          const off = xfrm?.getElementsByTagName("a:off")[0] || xfrm?.getElementsByTagName("off")[0];
          const ext = xfrm?.getElementsByTagName("a:ext")[0] || xfrm?.getElementsByTagName("ext")[0];

          const x = Number(off?.getAttribute("x") || 0);
          const y = Number(off?.getAttribute("y") || 0);
          const cx = Number(ext?.getAttribute("cx") || 914400);
          const cy = Number(ext?.getAttribute("cy") || 914400);

          const left = (x / 914400) * 96;
          const top = (y / 914400) * 96;
          const width = Math.max(1, (cx / 914400) * 96);
          const height = Math.max(1, (cy / 914400) * 96);

          const base64 = await mediaFile.async("base64");
          const src = `data:${mime};base64,${base64}`;
          try {
            const img = await loadBrowserImage(src);
            ctx.drawImage(img, left, top, width, height);
            drawnAny = true;
          } catch {
            // Ignore a single image decode failure and continue with other slide elements.
          }
        }

        if (!drawnAny) {
          // Fallback text placement when image layers are not available.
          const textParts = Array.from(xml.matchAll(/<a:t>(.*?)<\/a:t>/g)).map((m) => m[1]).filter(Boolean);
          ctx.fillStyle = "#111111";
          ctx.font = "28px Calibri, Arial, sans-serif";
          ctx.fillText(`Slide ${i + 1}`, 40, 56);
          ctx.font = "18px Calibri, Arial, sans-serif";
          const text = textParts.join(" ") || "(No previewable image layer found in this slide)";
          const words = text.split(/\s+/);
          let line = "";
          let y = 96;
          for (const word of words) {
            const next = `${line}${word} `;
            if (ctx.measureText(next).width > slideWidthPx - 80) {
              ctx.fillText(line.trim(), 40, y);
              y += 28;
              line = `${word} `;
            } else {
              line = next;
            }
            if (y > slideHeightPx - 40) break;
          }
          if (line.trim() && y <= slideHeightPx - 20) ctx.fillText(line.trim(), 40, y);
        }

        const pngData = canvas.toDataURL("image/png");
        if (i > 0) pdf.addPage([slideWidthPx, slideHeightPx], slideWidthPx >= slideHeightPx ? "l" : "p");
        pdf.addImage(pngData, "PNG", 0, 0, slideWidthPx, slideHeightPx);
      }

      const outBytes = new Uint8Array(pdf.output("arraybuffer"));
      setPdfBytes(outBytes);
      downloadBytes(outBytes, "pptx-to-pdf.pdf", "application/pdf");
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
            Word to PDF 
          </button>
          <button className="neon-btn rounded-lg px-3 py-2" onClick={pdfToWord}>
            PDF to Word 
          </button>
          <button className="neon-btn rounded-lg px-3 py-2" onClick={excelToPdf}>
            Excel to PDF 
          </button>
        </div>

        <div className="mt-3 rounded-lg border border-white/15 bg-white p-2 text-black" ref={editorWrapRef}>
          <ReactQuill
            ref={quillRef}
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
          <p>Word selected: {wordFile ? wordFile.name : "None"}</p>
          <p>Excel selected: {excelFile ? excelFile.name : "None"}</p>
          <p>PPT selected: {pptxFile ? pptxFile.name : "None"}</p>
          <p className="mt-1 text-neutral-400">Note: For highest fidelity, use .docx, .xlsx and .pptx files.</p>
        </div>

        <div className="mt-2 rounded-lg bg-black/35 p-2 text-xs text-neutral-300">Status: {status}</div>
      </section>
    </main>
  );
}
