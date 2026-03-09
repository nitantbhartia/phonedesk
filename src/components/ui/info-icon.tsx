"use client";

import { Info } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export function InfoIcon({
  text,
  className = "",
}: {
  text: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  return (
    <span
      ref={ref}
      className={`relative inline-flex h-4 w-4 items-center justify-center rounded-full text-paw-brown/40 transition-colors hover:text-paw-brown/70 cursor-pointer ${className}`}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setOpen((v) => !v);
      }}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      aria-label={text}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setOpen((v) => !v);
        }
        if (e.key === "Escape") setOpen(false);
      }}
    >
      <Info className="h-3.5 w-3.5" />
      {open && (
        <span className="absolute left-1/2 bottom-full mb-2 -translate-x-1/2 z-50 w-56 rounded-2xl bg-paw-brown px-4 py-3 text-xs font-medium text-paw-cream shadow-lg pointer-events-none leading-relaxed">
          {text}
          <span className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-paw-brown" />
        </span>
      )}
    </span>
  );
}
