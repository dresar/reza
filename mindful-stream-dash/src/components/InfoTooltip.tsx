import React, { useState } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface InfoTooltipProps {
  content: React.ReactNode;
  side?: "top" | "right" | "bottom" | "left";
  className?: string;
  title?: string;
}

export function InfoTooltip({
  content,
  side = "top",
  className = "",
  title = "Keterangan",
}: InfoTooltipProps) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setOpen((prev) => !prev);
          }}
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={() => setOpen(false)}
          className={`inline-flex items-center justify-center h-4 w-4 rounded-full text-[10px] font-bold font-mono transition-all duration-200 focus:outline-none shrink-0 cursor-pointer select-none ${
            open
              ? "bg-cyan-400 text-slate-950 shadow-[0_0_10px_rgba(0,212,255,0.8)] scale-110"
              : "bg-slate-800/90 hover:bg-cyan-500/20 text-cyan-400 hover:text-cyan-300 border border-slate-700/80 hover:border-cyan-500/50"
          } ${className}`}
          aria-label="Info deskripsi"
          title="Klik atau sentuh untuk melihat deskripsi"
        >
          !
        </button>
      </PopoverTrigger>
      <PopoverContent
        side={side}
        sideOffset={6}
        className="z-50 max-w-[280px] p-3 text-xs bg-[#0C1222]/95 border border-cyan-500/30 text-slate-200 rounded-xl shadow-[0_12px_35px_rgba(0,0,0,0.7)] backdrop-blur-md animate-in fade-in-0 zoom-in-95 pointer-events-auto"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
      >
        <div className="space-y-1">
          <div className="font-semibold text-cyan-300 text-[11px] flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 shadow-[0_0_6px_#00D4FF]" />
            {title}
          </div>
          <div className="text-[11px] text-slate-300 leading-relaxed">
            {content}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
