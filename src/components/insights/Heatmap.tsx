import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { DailyActivity } from "@/bindings";
import { dayKey, formatCount, formatDuration } from "@/lib/utils/measures";

const WEEKS = 53;
const LEVELS = 4;

/** Signal yellow let through the surface: the stronger, the longer the day. */
const LEVEL_COLORS = [
  "var(--color-surface-raised)",
  "color-mix(in srgb, var(--color-signal) 25%, var(--color-surface))",
  "color-mix(in srgb, var(--color-signal) 50%, var(--color-surface))",
  "color-mix(in srgb, var(--color-signal) 75%, var(--color-surface))",
  "var(--color-signal)",
];

interface Cell {
  key: string;
  date: Date;
  activity?: DailyActivity;
  level: number;
}

interface Hovered {
  cell: Cell;
  x: number;
  y: number;
}

/** The last year, one square per day, one column per week from Monday. */
const buildWeeks = (activity: DailyActivity[]): Cell[][] => {
  const byDay = new Map(activity.map((day) => [day.date, day]));
  const longest = Math.max(1, ...activity.map((day) => day.duration_ms));
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const mondayOffset = (today.getDay() + 6) % 7;
  const start = new Date(today);
  start.setDate(today.getDate() - mondayOffset - (WEEKS - 1) * 7);

  const weeks: Cell[][] = [];
  for (let week = 0; week < WEEKS; week++) {
    const days: Cell[] = [];
    for (let day = 0; day < 7; day++) {
      const date = new Date(start);
      date.setDate(start.getDate() + week * 7 + day);
      if (date > today) break;
      const key = dayKey(date);
      const found = byDay.get(key);
      const level =
        found && found.duration_ms > 0
          ? Math.max(1, Math.ceil((found.duration_ms / longest) * LEVELS))
          : 0;
      days.push({ key, date, activity: found, level });
    }
    weeks.push(days);
  }
  return weeks;
};

export const Heatmap: React.FC<{ activity: DailyActivity[] }> = ({
  activity,
}) => {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const [hovered, setHovered] = useState<Hovered | null>(null);
  const weeks = useMemo(() => buildWeeks(activity), [activity]);
  const dateFormat = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      }),
    [locale],
  );

  const describe = (cell: Cell) =>
    cell.activity
      ? t("insights.dayTooltip", {
          duration: formatDuration(cell.activity.duration_ms),
          words: formatCount(cell.activity.word_count, locale),
        })
      : t("insights.noActivity");

  return (
    <div className="relative p-6 bg-surface border border-edge rounded-2xl">
      <div className="overflow-x-auto">
        <div
          role="img"
          aria-label={t("insights.heatmapLabel")}
          className="flex gap-1 w-max"
          onMouseLeave={() => setHovered(null)}
        >
          {weeks.map((days, index) => (
            <div key={index} className="flex flex-col gap-1">
              {days.map((cell) => (
                <span
                  key={cell.key}
                  className="size-[13px] rounded-[3px]"
                  style={{ background: LEVEL_COLORS[cell.level] }}
                  onMouseEnter={(event) => {
                    const box = event.currentTarget.getBoundingClientRect();
                    const frame =
                      event.currentTarget.offsetParent?.getBoundingClientRect();
                    setHovered({
                      cell,
                      x: box.left + box.width / 2 - (frame?.left ?? 0),
                      y: box.top - (frame?.top ?? 0),
                    });
                  }}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
      {hovered && (
        <div
          role="tooltip"
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full flex flex-col gap-0.5 px-3.5 py-2.5 rounded-[10px] bg-text text-background text-[13px] whitespace-nowrap shadow-lg"
          style={{ left: hovered.x, top: hovered.y - 8 }}
        >
          <span className="font-semibold first-letter:capitalize">
            {dateFormat.format(hovered.cell.date)}
          </span>
          <span>{describe(hovered.cell)}</span>
        </div>
      )}
    </div>
  );
};

export const HeatmapLegend: React.FC = () => {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-2 text-[13px] text-ink-3">
      <span>{t("insights.less")}</span>
      {LEVEL_COLORS.map((color) => (
        <span
          key={color}
          className="size-[13px] rounded-[3px]"
          style={{ background: color }}
        />
      ))}
      <span>{t("insights.more")}</span>
    </div>
  );
};
