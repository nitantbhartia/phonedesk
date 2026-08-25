import React from "react";

type ArrowIconProps = {
  direction?: "up-right" | "down";
  className?: string;
};

export function ArrowIcon({ direction = "up-right", className }: ArrowIconProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      focusable="false"
      viewBox="0 0 16 16"
    >
      {direction === "down" ? (
        <path
          d="M8 2v11M3 9l5 5 5-5"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.5"
        />
      ) : (
        <path
          d="M3 13 13 3M5 3h8v8"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.5"
        />
      )}
    </svg>
  );
}
