/** The tray icon, drawn like src-tauri/resources/tray_*.png; uses currentColor like a macOS template image. */
type TrayIconState = "idle" | "recording" | "transcribing";

const TrayIcon = ({
  state,
  size,
}: {
  state: TrayIconState;
  size: number | string;
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 28 28"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    aria-hidden="true"
    xmlns="http://www.w3.org/2000/svg"
  >
    <circle cx="14" cy="14" r="12" />
    {state === "idle" && (
      <>
        <path d="M5 12c3-3 5 2 9 0s6-3 9 0" />
        <path d="M6 17c3-2 5 2 8 0s5-2 8 0" />
      </>
    )}
    {state === "recording" && (
      <circle cx="14" cy="14" r="5.5" fill="currentColor" stroke="none" />
    )}
    {state === "transcribing" && (
      <g fill="currentColor" stroke="none">
        <circle cx="8.5" cy="14" r="1.8" />
        <circle cx="14" cy="14" r="1.8" />
        <circle cx="19.5" cy="14" r="1.8" />
      </g>
    )}
  </svg>
);

export default TrayIcon;
