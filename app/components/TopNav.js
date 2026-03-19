import Link from "next/link";

const ITEMS = [
  { href: "/", label: "Home" },
  { href: "/merge-compress", label: "Merge + Pages" },
  { href: "/compression", label: "Compression" },
  { href: "/present", label: "Present" },
  { href: "/edit", label: "Edit" },
  { href: "/edit/watermark", label: "Add Watermark" },
  { href: "/conversion", label: "Conversion" }
];

export default function TopNav() {
  return (
    <header className="sticky top-0 z-30 border-b border-red-500/30 bg-black/50 backdrop-blur-xl">
      <div className="mx-auto flex max-w-[1400px] flex-col gap-2 px-3 py-3 md:flex-row md:flex-wrap md:items-center md:px-5">
        <div className="rounded-md border border-red-500/40 bg-red-500/15 px-2 py-1 text-center text-xs font-semibold text-red-200 md:mr-2">
          PDF Toolkit
        </div>
        <div className="-mx-1 flex w-full gap-2 overflow-x-auto px-1 pb-1 md:mx-0 md:w-auto md:flex-wrap md:overflow-visible md:px-0 md:pb-0">
          {ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="whitespace-nowrap rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-neutral-200 hover:border-red-500/60 hover:text-white"
            >
              {item.label}
            </Link>
          ))}
        </div>
        <div className="rounded-md border border-emerald-400/35 bg-emerald-500/15 px-2 py-1 text-center text-xs text-emerald-100 md:ml-auto">
          On-device processing: your documents stay local
        </div>
      </div>
    </header>
  );
}
