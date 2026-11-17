import React, { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { DailyActivity } from "@/bindings";
import { dayKey, formatCount, formatDuration } from "@/lib/utils/measures";

const MAX_WEEKS = 53;
const MIN_WEEKS = 8;
const LEVELS = 4;
/** Square sizes the grid may use; it shows as many weeks as fit at the smallest. */
const MIN_CELL = 14;
const MAX_CELL = 20;
const GAP = 4;
/** Room on the left for the weekday names. */
const DAY_LABELS_WIDTH = 34;
/** Months closer than this many weeks would print over each other. */
const MONTH_LABEL_SPACING = 3;

/** Signal yellow let through the surface: the stronger, the longer the day. */
const LEVEL_COLORS = [
  "var(--color-surface-raised)",
  "var(--color-heat-1)",
  "var(--color-heat-2)",
  "var(--color-heat-3)",
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

const noon = (date: Date) => {
  const copy = new Date(date);
  copy.setHours(12, 0, 0, 0);
  return copy;
};

/** The last `weekCount` weeks, one column per week from Monday, up to today. */
const buildWeeks = (activity: DailyActivity[], weekCount: number): Cell[][] => {
  const byDay = new Map(activity.map((day) => [day.date, day]));
  const today = noon(new Date());
  const start = new Date(today);
  start.setDate(
    today.getDate() - ((today.getDay() + 6) % 7) - (weekCount - 1) * 7,
  );

  const weeks: Cell[][] = [];
  for (let week = 0; week < weekCount; week++) {
    const days: Cell[] = [];
    for (let day = 0; day < 7; day++) {
      const date = new Date(start);
      date.setDate(start.getDate() + week * 7 + day);
      if (date > today) break;
      const key = dayKey(date);
      days.push({ key, date, activity: byDay.get(key), level: 0 });
    }
    weeks.push(days);
  }

  // Intensity is relative to the busiest day on screen, not of all time.
  const longest = Math.max(
    1,
    ...weeks.flat().map((cell) => cell.activity?.duration_ms ?? 0),
  );
  for (const cell of weeks.flat()) {
    const duration = cell.activity?.duration_ms ?? 0;
    cell.level =
      duration > 0 ? Math.max(1, Math.ceil((duration / longest) * LEVELS)) : 0;
  }
  return weeks;
};

/** Days in a row with a dictation, ending today or yesterday. */
export const currentStreak = (activity: DailyActivity[]): number => {
  const active = new Set(
    activity.filter((day) => day.dictation_count > 0).map((day) => day.date),
  );
  const cursor = noon(new Date());
  if (!active.has(dayKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  let streak = 0;
  while (active.has(dayKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
};

const Figure: React.FC<{
  label: string;
  value: string;
  note?: string;
}> = ({ label, value, note }) => (
  <div className="flex-[1_1_140px] flex flex-col gap-1">
    <span className="text-[13px] text-ink-3">{label}</span>
    <span className="text-[22px] leading-tight font-bold tracking-tight measure tabular-nums">
      {value}
    </span>
    {note && (
      <span className="text-[13px] text-ink-3 first-letter:capitalize">
        {note}
      </span>
    )}
  </div>
);

export const Heatmap: React.FC<{ activity: DailyActivity[] }> = ({
  activity,
}) => {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const frameRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [hovered, setHovered] = useState<Hovered | null>(null);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const observer = new ResizeObserver(([entry]) =>
      setWidth(entry.contentRect.width),
    );
    observer.observe(frame);
    return () => observer.disconnect();
  }, []);

  // As many weeks as fit without scrolling, then squares grown to fill the row.
  const room = Math.max(0, width - DAY_LABELS_WIDTH);
  const weekCount = Math.min(
    MAX_WEEKS,
    Math.max(MIN_WEEKS, Math.floor((room + GAP) / (MIN_CELL + GAP))),
  );
  const cell = Math.min(
    MAX_CELL,
    Math.max(MIN_CELL, (room - (weekCount - 1) * GAP) / weekCount),
  );

  const weeks = useMemo(
    () => buildWeeks(activity, weekCount),
    [activity, weekCount],
  );

  const formats = useMemo(
    () => ({
      full: new Intl.DateTimeFormat(locale, {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      }),
      month: new Intl.DateTimeFormat(locale, { month: "short" }),
      weekday: new Intl.DateTimeFormat(locale, { weekday: "short" }),
      day: new Intl.DateTimeFormat(locale, {
        weekday: "long",
        day: "numeric",
        month: "long",
      }),
    }),
    [locale],
  );

  // A month is named over the first week that starts in it.
  const monthLabels = useMemo(() => {
    const labels: { week: number; text: string }[] = [];
    weeks.forEach((days, week) => {
      const first = days[0];
      if (!first) return;
      const previous = weeks[week - 1]?.[0];
      const changed =
        !previous || previous.date.getMonth() !== first.date.getMonth();
      const last = labels[labels.length - 1];
      if (changed && (!last || week - last.week >= MONTH_LABEL_SPACING)) {
        labels.push({ week, text: formats.month.format(first.date) });
      }
    });
    return labels;
  }, [weeks, formats]);

  const shown = weeks.flat();
  const activeDays = shown.filter(
    (day) => (day.activity?.dictation_count ?? 0) > 0,
  );
  const best = activeDays.reduce<Cell | null>(
    (top, day) =>
      !top ||
      (day.activity?.duration_ms ?? 0) > (top.activity?.duration_ms ?? 0)
        ? day
        : top,
    null,
  );
  const streak = useMemo(() => currentStreak(activity), [activity]);

  const describe = (day: Cell) =>
    day.activity
      ? t("insights.dayTooltip", {
          duration: formatDuration(day.activity.duration_ms),
          words: formatCount(day.activity.word_count, locale),
        })
      : t("insights.noActivity");

  const step = cell + GAP;
  // Monday, Wednesday and Friday name their rows; the rest stay quiet.
  const labelledRows = [0, 2, 4];

  return (
    <div
      ref={panelRef}
      data-theme="fir"
      className="relative flex flex-col gap-6 p-6 bg-surface border border-edge rounded-2xl"
    >
      <div ref={frameRef} className="w-full">
        {width > 0 && (
          <div
            role="img"
            aria-label={t("insights.heatmapLabel")}
            onMouseLeave={() => setHovered(null)}
          >
            <div
              className="relative h-5 text-[12px] text-ink-3"
              style={{ marginLeft: DAY_LABELS_WIDTH }}
            >
              {monthLabels.map((label) => (
                <span
                  key={label.week}
                  className="absolute top-0 first-letter:capitalize"
                  style={{ left: label.week * step }}
                >
                  {label.text}
                </span>
              ))}
            </div>
            <div className="flex">
              <div
                className="relative shrink-0 text-[12px] text-ink-3"
                style={{ width: DAY_LABELS_WIDTH }}
              >
                {labelledRows.map((row) => (
                  <span
                    key={row}
                    className="absolute start-0 first-letter:capitalize"
                    style={{
                      top: row * step,
                      height: cell,
                      lineHeight: `${cell}px`,
                    }}
                  >
                    {weeks[0]?.[row]
                      ? formats.weekday.format(weeks[0][row].date)
                      : ""}
                  </span>
                ))}
              </div>
              <div className="flex" style={{ gap: GAP }}>
                {weeks.map((days, index) => (
                  <div
                    key={index}
                    className="flex flex-col"
                    style={{ gap: GAP }}
                  >
                    {days.map((day) => (
                      <span
                        key={day.key}
                        className="rounded-[4px]"
                        style={{
                          width: cell,
                          height: cell,
                          background: LEVEL_COLORS[day.level],
                        }}
                        onMouseEnter={(event) => {
                          const box =
                            event.currentTarget.getBoundingClientRect();
                          const frame =
                            panelRef.current?.getBoundingClientRect();
                          setHovered({
                            cell: day,
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
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-x-8 gap-y-4 pt-5 border-t border-edge">
        <Figure
          label={t("insights.activeDays")}
          value={formatCount(activeDays.length, locale)}
          note={t("insights.overWeeks", { weeks: weekCount })}
        />
        <Figure
          label={t("insights.bestDay")}
          value={
            best?.activity ? formatDuration(best.activity.duration_ms) : "–"
          }
          note={best ? formats.day.format(best.date) : undefined}
        />
        <Figure
          label={t("insights.streak")}
          value={formatCount(streak, locale)}
          note={t("insights.streakNote")}
        />
      </div>

      {hovered && (
        <div
          role="tooltip"
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full flex flex-col gap-0.5 px-3.5 py-2.5 rounded-[10px] bg-text text-background text-[13px] whitespace-nowrap shadow-lg"
          style={{ left: hovered.x, top: hovered.y - 8 }}
        >
          <span className="font-semibold first-letter:capitalize">
            {formats.full.format(hovered.cell.date)}
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
