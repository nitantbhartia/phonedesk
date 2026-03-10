import Image from "next/image";
import Link from "next/link";

type BrandLogoProps = {
  href?: string;
  className?: string;
  priority?: boolean;
  mobileWidth?: number;
  desktopWidth?: number;
};

export function BrandLogo({
  href = "/",
  className = "",
  priority = false,
  mobileWidth = 144,
  desktopWidth = 216,
}: BrandLogoProps) {
  const logo = (
    <span className={`inline-flex w-full max-w-full items-center ${className}`.trim()}>
      <span className="relative inline-flex">
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-90"
          style={{
            backgroundColor: "#c7ab77",
            clipPath: "inset(16% 0 14% 64%)",
            maskImage: "url('/ringpaw-logo.png')",
            WebkitMaskImage: "url('/ringpaw-logo.png')",
            maskRepeat: "no-repeat",
            WebkitMaskRepeat: "no-repeat",
            maskPosition: "center",
            WebkitMaskPosition: "center",
            maskSize: "contain",
            WebkitMaskSize: "contain",
          }}
        />
        <Image
          src="/ringpaw-logo.png"
          alt="RingPaw AI"
          width={desktopWidth}
          height={Math.round((desktopWidth * 527) / 2303)}
          priority={priority}
          className="h-auto w-auto max-w-full object-contain"
          sizes={`(max-width: 640px) ${mobileWidth}px, ${desktopWidth}px`}
        />
      </span>
    </span>
  );

  return href ? (
    <Link href={href} aria-label="RingPaw AI home" className="inline-flex max-w-full">
      {logo}
    </Link>
  ) : (
    logo
  );
}
