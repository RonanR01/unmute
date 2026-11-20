import React from "react";

interface MarkProps {
  size?: number;
  width?: number | string;
  height?: number | string;
  className?: string;
}

/** Tysta's mark: two sound waves in a ring. Drawn in the current color. */
export const TystaMark: React.FC<MarkProps> = ({
  size = 28,
  width,
  height,
  className,
}) => (
  <svg
    width={width ?? size}
    height={height ?? size}
    viewBox="0 0 28 28"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.5}
    strokeLinecap="round"
    aria-hidden="true"
    className={className}
  >
    <circle cx="14" cy="14" r="13" />
    <path d="M5 12c3-3 5 2 9 0s6-3 9 0" />
    <path d="M6 17c3-2 5 2 8 0s5-2 8 0" />
  </svg>
);

/** The name as the logo writes it; a brand, never translated. */
const WORDMARK = "tysta";

interface LogoProps {
  /** Height of the mark in px; the wordmark scales with it. */
  size?: number;
  className?: string;
}

/** The mark beside the wordmark. */
export const TystaLogo: React.FC<LogoProps> = ({ size = 28, className }) => (
  <span
    className={`inline-flex items-center gap-2.5 text-text ${className ?? ""}`}
  >
    <TystaMark size={size} />
    <span
      className="font-bold tracking-tight"
      style={{ fontSize: size * 0.72, lineHeight: 1 }}
    >
      {WORDMARK}
    </span>
  </span>
);

export default TystaLogo;
