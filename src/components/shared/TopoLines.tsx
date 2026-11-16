import React from "react";

interface TopoLinesProps {
  /** Adds a small hill of contour lines on the right. */
  hill?: boolean;
  /** Fades the lines out toward the bottom, for use above content. */
  fade?: boolean;
  className?: string;
}

const FLOWS = [
  "M-20 22c90-30 150 16 236 6s128-40 222-20 140 44 232 22 160-40 250-14 90 20 140 6",
  "M-20 52c70-18 140 28 226 14s134-46 224-24 132 50 226 26 166-34 248-14 84 12 136 2",
  "M-20 84c96-34 152 20 232 8s118-30 210-10 160 46 242 22 144-48 232-20 98 28 164 12",
  "M-20 116c74-20 144 24 224 10s140-40 228-16 128 34 220 14 172-38 254-12 88 16 134 4",
  "M-20 150c88-28 148 22 230 10s122-34 214-12 150 40 236 20 154-42 240-16 96 22 160 8",
  "M-20 186c66-16 136 26 220 12s138-38 226-16 134 36 224 16 164-36 250-12 90 14 140 2",
  "M-20 224c92-30 146 18 228 8s126-32 216-12 146 38 232 18 158-40 244-14 94 20 160 6",
];

const HILL = [
  "M812 96c22-34 78-40 112-18s44 66 18 96-82 36-116 12-36-56-14-90z",
  "M836 110c16-22 54-26 78-12s30 44 12 64-56 24-80 8-26-38-10-60z",
  "M860 124c10-12 30-14 44-6s16 24 6 34-30 14-44 4-14-20-6-32z",
];

const FADE = "linear-gradient(to bottom, #000 35%, transparent 100%)";

/** Unmute's motif: thin, irregular topographic lines. Decoration only. */
export const TopoLines: React.FC<TopoLinesProps> = ({
  hill = false,
  fade = false,
  className = "",
}) => (
  <svg
    viewBox="0 0 1040 250"
    preserveAspectRatio="xMidYMin slice"
    fill="none"
    stroke="currentColor"
    strokeWidth={1}
    aria-hidden="true"
    className={`pointer-events-none absolute inset-x-0 top-0 w-full text-text opacity-[0.12] ${className}`}
    style={fade ? { maskImage: FADE, WebkitMaskImage: FADE } : undefined}
  >
    {FLOWS.map((d) => (
      <path key={d} d={d} />
    ))}
    {hill && HILL.map((d) => <path key={d} d={d} />)}
  </svg>
);
