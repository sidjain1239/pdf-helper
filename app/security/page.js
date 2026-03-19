"use client";

import { useState } from "react";
import { PDFDocument } from "pdf-lib";
import { downloadBytes, fileToBytes } from "../lib/pdfClient";

export default function SecurityPage() {
  const [pdfBytes, setPdfBytes] = useState(null);
  const [pdfName, setPdfName] = useState("document.pdf");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("Ready");

  const LOCK_PREFIX = "toolkit-lock:";

  async function sha256Hex(text) {
    const data = new TextEncoder().encode(text);
    const digest = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  async function onUpload(fileList) {
    const files = Array.from(fileList || []);
    const pdf = files.find((f) => f.name.toLowerCase().endsWith(".pdf"));
    if (pdf) {
      setPdfBytes(await fileToBytes(pdf));
      setPdfName(pdf.name);
      setStatus("PDF loaded");
    }
  }

  async function addPassword() {
    try {
      if (!pdfBytes) throw new Error("Upload PDF first");
      if (!password) throw new Error("Enter password");

      setStatus("Adding password marker...");
      const pdf = await PDFDocument.load(pdfBytes);
      const hash = await sha256Hex(password);
      const lockMarker = `${LOCK_PREFIX}${hash}`;
      pdf.setSubject(lockMarker);
      pdf.setKeywords([lockMarker, "toolkit-protected"]);
      pdf.setTitle(lockMarker);
      pdf.setAuthor("PDF Toolkit Local Lock");
      pdf.setProducer("PDF Toolkit On-device Security");
      const outBytes = await pdf.save({ useObjectStreams: true });
      const outName = pdfName.replace(/\.pdf$/i, "") + "-protected.pdf";
      setPdfBytes(outBytes);
      setPdfName(outName);
      downloadBytes(outBytes, outName, "application/pdf");
      setStatus("Password added and saved as PDF");
    } catch (error) {
      setStatus(`Failed: ${error.message}`);
    }
  }

  async function removePassword() {
    try {
      if (!pdfBytes) throw new Error("Upload PDF first");
      if (!password) throw new Error("Enter password");

      setStatus("Removing password marker...");
      const pdf = await PDFDocument.load(pdfBytes);
      const subject = pdf.getSubject() || "";
      const keywordMarker = (pdf.getKeywords() || []).find((k) => k.startsWith(LOCK_PREFIX)) || "";
      const title = pdf.getTitle() || "";
      const current = subject.startsWith(LOCK_PREFIX)
        ? subject
        : keywordMarker || (title.startsWith(LOCK_PREFIX) ? title : "");
      if (!current) {
        throw new Error("This PDF was not locked by this toolkit");
      }
      const savedHash = current.slice(LOCK_PREFIX.length);
      const inputHash = await sha256Hex(password);
      if (savedHash !== inputHash) {
        throw new Error("Wrong password");
      }

      pdf.setSubject("");
      pdf.setTitle("");
      pdf.setKeywords((pdf.getKeywords() || []).filter((k) => !k.startsWith(LOCK_PREFIX) && k !== "toolkit-protected"));
      const outBytes = await pdf.save({ useObjectStreams: true });
      const outName = pdfName.replace(/-protected\.pdf$/i, "") + "-unlocked.pdf";
      setPdfBytes(outBytes);
      setPdfName(outName);
      downloadBytes(outBytes, outName, "application/pdf");
      setStatus("Password removed and PDF saved");
    } catch (error) {
      setStatus(`Failed: ${error.message}`);
    }
  }

  return (
    <main className="mx-auto max-w-[1200px] p-4 md:p-6">
      <section className="glass rounded-2xl p-4 md:p-6">
        <h1 className="text-xl font-semibold">Security</h1>
        <p className="mt-1 text-xs text-neutral-300">On-device password marker mode. Files never leave your browser.</p>

        <input
          type="file"
          multiple
          accept=".pdf"
          className="mt-3 w-full rounded-lg p-2 text-xs"
          onChange={(e) => onUpload(e.target.files)}
        />

        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Enter password"
          className="mt-3 w-full rounded-lg p-2"
        />

        <div className="mt-3 grid gap-2 md:grid-cols-2">
          <button className="neon-btn rounded-lg px-3 py-2" onClick={addPassword}>
            Add Password (PDF)
          </button>
          <button className="neon-btn rounded-lg px-3 py-2" onClick={removePassword}>
            Remove Password (PDF)
          </button>
        </div>

        <div className="mt-3 rounded-lg bg-black/35 p-2 text-xs text-neutral-300">Status: {status}</div>
      </section>
    </main>
  );
}
