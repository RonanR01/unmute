/** A duration as people say it: "45 s", "12 min", "3 h 05 min". */
export const formatDuration = (ms: number): string => {
  const totalSeconds = Math.round(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds} s`;
  const totalMinutes = Math.round(totalSeconds / 60);
  if (totalMinutes < 60) return `${totalMinutes} min`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = String(totalMinutes % 60).padStart(2, "0");
  return `${hours} h ${minutes} min`;
};

export const formatCount = (value: number, locale: string): string =>
  new Intl.NumberFormat(locale).format(value);

/** A local calendar day as `YYYY-MM-DD`, the key the backend groups by. */
export const dayKey = (date: Date): string => {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
};
