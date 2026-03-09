"use client";

import { Info } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export function InfoIcon({
  text,
  className = "",
}: {
  text: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open || !ref.current) return;

    function updatePos() {
      if (!ref.current) return;
      const rect = ref.current.getBoundingClientRect();
      setPos({
        top: rect.top + window.scrollY,
        left: rect.left + rect.width / 2 + window.scrollX,
      });
    }

    updatePos();
    window.addEventListener("scroll", updatePos, true);
    window.addEventListener("resize", updatePos);
    return () => {
      window.removeEventListener("scroll", updatePos, true);
      window.removeEventListener("resize", updatePos);
    };
  }, [open]);

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

  const tooltip =
    mounted && open
      ? createPortal(
          <span
            className="pointer-events-none fixed z-[9999] w-64 -translate-x-1/2 -translate-y-full rounded-2xl bg-paw-brown px-4 py-3 text-xs font-medium text-paw-cream shadow-xl leading-relaxed"
            style={{ top: pos.top - 10, left: pos.left }}
          >
            {text}
            <span className="absolute left-1/2 top-full -translate-x-1/2 border-[5px] border-transparent border-t-paw-brown" />
          </span>,
          document.body
        )
      : null;

  return (
    <>
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
      </span>
      {tooltip}
    </>
  );
}
