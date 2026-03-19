"use client";

import Link from "next/link";
import { motion } from "framer-motion";

const CARDS = [
  {
    title: "Merge and Page Tools",
    text: "Merge, split, extract, rotate, reorder, reverse, and duplicate PDF pages fully in browser.",
    href: "/merge-compress"
  },
  {
    title: "Compression Studio",
    text: "Dedicated compression section with Light, Balanced, Strong, and Extreme levels plus options.",
    href: "/compression"
  },
  {
    title: "PDF Presenter",
    text: "Present or teach from PDF with fullscreen, pen, highlighter, eraser, and laser tools.",
    href: "/present"
  },
  {
    title: "Edit",
    text: "Editor with brush, highlight, eraser, and text box on PDF pages.",
    href: "/edit"
  },
  {
    title: "Conversion",
    text: "PDF to images/text, images to PDF, text to PDF, and basic Word conversion tools.",
    href: "/conversion"
  },
  {
    title: "Watermark Studio",
    text: "Dedicated watermark page with controls for font, angle, color, opacity, and repeat count.",
    href: "/edit/watermark"
  }
];

const FEATURE_GROUPS = [
  {
    title: "Core PDF",
    features: [
      { label: "Merge multiple PDFs", href: "/merge-compress" },
      { label: "Split by range", href: "/merge-compress" },
      { label: "Extract selected pages", href: "/merge-compress" },
      { label: "Delete page list", href: "/merge-compress" },
      { label: "Rotate selected pages", href: "/merge-compress" },
      { label: "Reorder from-to", href: "/merge-compress" },
      { label: "Reverse page order", href: "/merge-compress" },
      { label: "Duplicate specific page", href: "/merge-compress" },
      { label: "Page count detection", href: "/merge-compress" },
      { label: "File size overview", href: "/merge-compress" },
      { label: "Result download", href: "/merge-compress" }
    ]
  },
  {
    title: "Compression Features",
    features: [
      { label: "Light compression level", href: "/compression" },
      { label: "Balanced compression level", href: "/compression" },
      { label: "Strong compression level", href: "/compression" },
      { label: "Extreme compression level", href: "/compression" },
      { label: "Per-page progress indicator", href: "/compression" },
      { label: "Before and after size stats", href: "/compression" },
      { label: "Optional grayscale compression", href: "/compression" },
      { label: "Metadata stripping option", href: "/compression" },
      { label: "Compress active file directly", href: "/compression" },
      { label: "Dedicated compression route", href: "/compression" }
    ]
  },
  {
    title: "Presentation Tools",
    features: [
      { label: "Open PDF for teaching", href: "/present" },
      { label: "Fullscreen presentation", href: "/present" },
      { label: "Pen annotation while teaching", href: "/present" },
      { label: "Highlighter during explanation", href: "/present" },
      { label: "Eraser for live cleanup", href: "/present" },
      { label: "Laser pointer focus", href: "/present" },
      { label: "Page jump in class", href: "/present" },
      { label: "Prev next slide style control", href: "/present" },
      { label: "Zoom controls", href: "/present" },
      { label: "Touch and pen support", href: "/present" }
    ]
  },
  {
    title: "Editing",
    features: [
      { label: "Brush drawing on page", href: "/edit" },
      { label: "Highlight mode", href: "/edit" },
      { label: "Text placement by click", href: "/edit" },
      { label: "Eraser tool", href: "/edit" },
      { label: "Brush color control", href: "/edit" },
      { label: "Brush size control", href: "/edit" },
      { label: "Highlight opacity control", href: "/edit" },
      { label: "Undo overlay action", href: "/edit" },
      { label: "Redo overlay action", href: "/edit" },
      { label: "Clear overlay instantly", href: "/edit" }
    ]
  },
  {
    title: "Conversion",
    features: [
      { label: "PDF to image ZIP", href: "/conversion" },
      { label: "Images to PDF", href: "/conversion" },
      { label: "PDF to text", href: "/conversion" },
      { label: "Text to PDF", href: "/conversion" },
      { label: "Word to PDF basic", href: "/conversion" },
      { label: "PDF to Word basic", href: "/conversion" },
      { label: "Batch image import", href: "/conversion" },
      { label: "Text editor preview", href: "/conversion" },
      { label: "Download generated output", href: "/conversion" },
      { label: "Client-side conversion only", href: "/conversion" }
    ]
  },
  {
    title: "Watermark and UX",
    features: [
      { label: "Watermark text controls", href: "/edit/watermark" },
      { label: "Font selector", href: "/edit/watermark" },
      { label: "Angle control", href: "/edit/watermark" },
      { label: "Color and opacity", href: "/edit/watermark" },
      { label: "Repeat count", href: "/edit/watermark" },
      { label: "Apply all pages/one page", href: "/edit/watermark" },
      { label: "On-device processing", href: "/" },
      { label: "No backend required", href: "/" },
      { label: "Responsive mobile layout", href: "/" },
      { label: "Neon glass theme", href: "/" }
    ]
  }
];

const EXTRA_FEATURES = [
  { label: "Drag and drop upload", href: "/compression" },
  { label: "Multiple file upload", href: "/merge-compress" },
  { label: "Active file switcher", href: "/merge-compress" },
  { label: "Page jump control", href: "/edit" },
  { label: "Presentation fullscreen mode", href: "/present" },
  { label: "Laser teaching pointer", href: "/present" },
  { label: "Prev/next navigation", href: "/edit" },
  { label: "Result download button", href: "/merge-compress" },
  { label: "Status notifications", href: "/" },
  { label: "Loading indicators", href: "/" },
  { label: "Safe blob download helper", href: "/" },
  { label: "Stale cache resistant build flow", href: "/" },
  { label: "File type filtering", href: "/conversion" },
  { label: "Simple beginner UI", href: "/" },
  { label: "Readable operation labels", href: "/merge-compress" },
  { label: "Meaning help panel", href: "/merge-compress" },
  { label: "Compression quality presets", href: "/compression" },
  { label: "Compression feature checklist", href: "/compression" },
  { label: "Consistent route structure", href: "/" },
  { label: "Lightweight component structure", href: "/" }
];

export default function HomePage() {
  return (
    <main className="mx-auto max-w-[1450px] space-y-5 p-3 md:p-6">
      <section className="glass relative overflow-hidden rounded-2xl p-5 text-center md:p-10">
        <div className="pointer-events-none absolute -left-20 -top-24 h-72 w-72 rounded-full bg-red-500/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 right-0 h-72 w-72 rounded-full bg-red-600/20 blur-3xl" />

        <motion.h1
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45 }}
          className="relative mx-auto max-w-5xl text-4xl font-bold tracking-tight md:text-6xl"
        >
          All in one PDF Toolkit
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.08 }}
          className="relative mx-auto mt-3 max-w-3xl text-base text-neutral-300 md:text-lg"
        >
          Processed locally your documents are safe.
        </motion.p>

        <div className="relative mt-7 grid gap-3 text-left md:grid-cols-2">
          {CARDS.map((card, index) => (
            <motion.div
              key={card.href}
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: 0.15 + index * 0.08 }}
            >
              <Link
                href={card.href}
                className="group block rounded-xl border border-white/10 bg-white/5 p-4 transition hover:border-red-500/50 hover:bg-red-500/10 hover:shadow-neon"
              >
                <h2 className="text-lg font-semibold text-white group-hover:text-red-200">{card.title}</h2>
                <p className="mt-1 text-sm text-neutral-300">{card.text}</p>
              </Link>
            </motion.div>
          ))}
        </div>
      </section>

      <section className="glass rounded-2xl p-5 md:p-8">
        <h2 className="text-center text-2xl font-semibold md:text-3xl">Feature Library (50+)</h2>
        <p className="mx-auto mt-2 max-w-3xl text-center text-sm text-neutral-300">
          A long, complete feature showcase so you can quickly understand what the toolkit offers.
        </p>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          {FEATURE_GROUPS.map((group, groupIndex) => (
            <motion.div
              key={group.title}
              initial={{ opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.25 }}
              transition={{ duration: 0.35, delay: groupIndex * 0.06 }}
              className="rounded-xl border border-white/10 bg-black/25 p-4"
            >
              <h3 className="text-lg font-semibold text-red-200">{group.title}</h3>
              <ul className="mt-3 space-y-2 text-sm text-neutral-200">
                {group.features.map((feature) => (
                  <li key={feature.label} className="rounded-lg bg-white/5 px-3 py-2 hover:bg-white/10">
                    <Link href={feature.href} className="block">
                      {feature.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </motion.div>
          ))}
        </div>
      </section>

      <section className="glass rounded-2xl p-5 md:p-8">
        <h2 className="text-center text-2xl font-semibold md:text-3xl">More Capabilities</h2>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {EXTRA_FEATURES.map((feature, index) => (
            <motion.div
              key={feature.label}
              initial={{ opacity: 0, scale: 0.98 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true, amount: 0.2 }}
              transition={{ duration: 0.2, delay: (index % 8) * 0.03 }}
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-neutral-200"
            >
              <Link href={feature.href} className="block">
                {feature.label}
              </Link>
            </motion.div>
          ))}
        </div>

        <div className="mt-auto pt-8 text-center text-xs text-neutral-400">
          Made By Siddharth Jain
        </div>
      </section>
    </main>
  );
}
