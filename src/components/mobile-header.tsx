import { ArrowLeft, Church } from "lucide-react";
import Link from "next/link";

export function MobileHeader({ title }: { title: string }) {
  return (
    <header className="sticky top-0 z-30 -mx-4 mb-4 border-b border-[#e7ebe6] bg-white/95 px-4 py-3 backdrop-blur-lg sm:hidden">
      <div className="mx-auto flex max-w-6xl items-center gap-2.5">
        <Link
          href="/"
          aria-label="Kembali ke dashboard KPAR"
          className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#294d3c] text-white"
        >
          <Church size={19} />
        </Link>
        <div className="min-w-0 flex-1">
          <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-[#829083]">
            KPAR GKJW
          </p>
          <h1 className="truncate text-sm font-semibold text-[#35483a]">{title}</h1>
        </div>
        <Link
          href="/"
          aria-label="Dashboard"
          className="flex size-10 shrink-0 items-center justify-center rounded-xl text-[#728073] active:bg-[#f2f5f0]"
        >
          <ArrowLeft size={17} />
        </Link>
      </div>
    </header>
  );
}
