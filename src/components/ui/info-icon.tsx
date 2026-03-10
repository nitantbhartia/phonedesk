import { Info } from "lucide-react";

export function InfoIcon({
  text,
  className = "",
}: {
  text: string;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex h-4 w-4 items-center justify-center rounded-full text-paw-brown/40 transition-colors hover:text-paw-brown/70 ${className}`}
      title={text}
      aria-label={text}
    >
      <Info className="h-3.5 w-3.5" />
    </span>
  );
}
