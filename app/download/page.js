import Link from "next/link";

export default function DownloadPage() {
  return (
    <main className="mx-auto max-w-[1000px] p-4 md:p-6">
      <section className="glass rounded-2xl p-5 md:p-8">
        <h1 className="text-2xl font-semibold md:text-3xl">Download and How to Use</h1>
        <p className="mt-2 text-sm text-neutral-300">
          This page combines download, about, and full usage instructions in one place.
        </p>

        <a
          href="/all-in-one-pdf-toolkit_0.1.0_x64_en-US.msi"
          download
          className="neon-btn mt-5 inline-block rounded-lg px-4 py-2"
        >
          Download for Windows (.msi)
        </a>

        <div className="mt-4 rounded-lg border border-amber-400/40 bg-amber-500/10 p-3 text-sm text-amber-100">
          Note: In the Windows app, the PDF will be automatically saved in the Downloads folder.
        </div>

        <div className="mt-7 rounded-lg border border-white/10 bg-black/25 p-4">
          <h2 className="text-lg font-semibold">About This Toolkit</h2>
          <p className="mt-2 text-sm text-neutral-300">
            This is an all-in-one PDF toolkit built for practical daily tasks. You can merge files, split pages,
            compress PDFs, add watermarks, edit content overlays, convert between formats, and present files during
            teaching. The core design focuses on local processing so your files stay on your device.
          </p>
        </div>

        <div className="mt-4 rounded-lg border border-white/10 bg-black/25 p-4">
          <h2 className="text-lg font-semibold">Detailed How to Use</h2>

          <h3 className="mt-3 text-sm font-semibold text-red-200">1. Start With the Right Tool</h3>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-neutral-300">
            <li>Use Merge + Pages for combining files and page operations (split, reorder, rotate, duplicate).</li>
            <li>Use Compression for file size reduction with quality presets.</li>
            <li>Use Edit for brush, highlight, eraser, and text replacement on editable PDFs.</li>
            <li>Use Watermark Studio for custom text watermarks and repeat patterns.</li>
            <li>Use Conversion for PDF to images/text and text or images to PDF workflows.</li>
            <li>Use Present for classroom or meeting-style fullscreen presentation with annotation tools.</li>
          </ul>

          <h3 className="mt-4 text-sm font-semibold text-red-200">2. Upload and Verify</h3>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-neutral-300">
            <li>Upload your file from the input on each tool page.</li>
            <li>Confirm page count, preview, or selected file name before applying operations.</li>
            <li>For best text editing results, use PDFs with selectable text (not scanned image-only pages).</li>
          </ul>

          <h3 className="mt-4 text-sm font-semibold text-red-200">3. Apply Operations Carefully</h3>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-neutral-300">
            <li>In merge/split tools, double-check page ranges before exporting.</li>
            <li>In compression, start with Balanced and then test Strong if quality still looks acceptable.</li>
            <li>In watermark, tune angle, opacity, and repeat count to avoid cluttering readable content.</li>
            <li>In edit mode, select the exact text box and review color match before final replacement.</li>
          </ul>

          <h3 className="mt-4 text-sm font-semibold text-red-200">4. Download Output</h3>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-neutral-300">
            <li>Use the tool-specific Download button after operation completes.</li>
            <li>Keep original and edited versions both, especially for important documents.</li>
            <li>For Windows app installer output, PDFs are saved automatically to Downloads.</li>
          </ul>

          <h3 className="mt-4 text-sm font-semibold text-red-200">5. Troubleshooting Tips</h3>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-neutral-300">
            <li>If text is not editable, the PDF may be image-based. Use OCR externally first if needed.</li>
            <li>If output is too large, apply compression after editing or watermarking.</li>
            <li>If layout differs in conversion, prefer clean source files (.docx, .xlsx) and test once.</li>
            <li>If a setting looks wrong, reset values and apply changes in smaller steps.</li>
          </ul>
        </div>

        <div className="mt-5 text-sm text-neutral-300">
          Quick access: go back to <Link href="/" className="text-red-300 underline">Home</Link> to open any tool.
        </div>

        <div className="mt-8 text-center text-sm text-neutral-300">Created by Siddharth Jain</div>
      </section>
    </main>
  );
}
