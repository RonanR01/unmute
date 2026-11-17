import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ArrowRight, Check, Copy } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  commands,
  events,
  type BadgeBoard,
  type BadgeStatus,
  type DailyActivity,
  type HistoryEntry,
} from "@/bindings";
import { useOsType } from "@/hooks/useOsType";
import { useSettings } from "@/hooks/useSettings";
import { notify } from "@/stores/noticeStore";
import { dayKey, formatCount, formatDuration } from "@/lib/utils/measures";
import { BadgeEmblem } from "../badges/BadgeEmblem";
import { entryText, isDictation } from "../dictations/DictationsScreen";
import { currentStreak } from "../insights/Heatmap";
import { copyToClipboard } from "../settings/history/clipboard";
import { Keycaps } from "../shared/Keycaps";
import { TopoLines } from "../shared/TopoLines";
import type { Screen } from "../Sidebar";

/** How many of the latest dictations the screen shows. */
const RECENT = 3;
/** How long "Copied" stays on a button. */
const COPIED_MS = 1600;

const LINK =
  "self-start min-h-9 px-3 flex items-center gap-2 rounded-[10px] border border-line-strong text-[13px] font-medium cursor-pointer transition-colors hover:bg-surface-raised focus-visible:outline-2 focus-visible:outline-text";

const Figure: React.FC<{ label: string; value: string; note?: string }> = ({
  label,
  value,
  note,
}) => (
  <div className="relative flex-[1_1_200px] flex flex-col gap-2 p-7 border-s border-edge first:border-s-0">
    <span className="text-sm text-ink-3">{label}</span>
    <span className="text-[42px] leading-none font-bold tracking-tight measure tabular-nums">
      {value}
    </span>
    {note && <span className="text-[13px] text-ink-3">{note}</span>}
  </div>
);

const Meter: React.FC<{ value: number; label: string }> = ({
  value,
  label,
}) => (
  <div
    role="progressbar"
    aria-label={label}
    aria-valuemin={0}
    aria-valuemax={100}
    aria-valuenow={Math.round(value * 100)}
    className="h-1.5 w-full overflow-hidden rounded-full bg-gauge-track"
  >
    <div
      className="h-full rounded-full bg-signal"
      style={{ width: `${Math.min(100, Math.max(0, value * 100))}%` }}
    />
  </div>
);

const RecentRow: React.FC<{ entry: HistoryEntry; locale: string }> = ({
  entry,
  locale,
}) => {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const text = entryText(entry);
  const when = new Date(entry.timestamp * 1000);
  // Yesterday's dictations need their day; today's only their time.
  const sameDay = dayKey(when) === dayKey(new Date());
  const time = new Intl.DateTimeFormat(
    locale,
    sameDay
      ? { hour: "2-digit", minute: "2-digit" }
      : { day: "numeric", month: "short" },
  ).format(when);

  const copy = async () => {
    if (await copyToClipboard(text)) {
      setCopied(true);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(false), COPIED_MS);
    } else {
      notify({ title: t("dictations.copyFailed") });
    }
  };
  const copyLabel = copied ? t("dictations.copied") : t("dictations.copy");

  return (
    <article className="flex items-start gap-4 ps-5 pe-3 py-3.5 border-t border-edge first:border-t-0">
      <span className="w-14 shrink-0 pt-2 text-sm text-ink-3 tabular-nums">
        {time}
      </span>
      <p className="flex-1 min-w-0 pt-1.5 text-[15px] leading-relaxed line-clamp-2 select-text cursor-text break-words">
        {text}
      </p>
      <button
        type="button"
        onClick={copy}
        aria-label={copyLabel}
        title={copyLabel}
        className={`size-9 shrink-0 flex items-center justify-center rounded-[10px] cursor-pointer transition-colors hover:text-text hover:bg-surface-raised focus-visible:outline-2 focus-visible:outline-text ${copied ? "text-text" : "text-ink-3"}`}
      >
        {copied ? <Check size={17} /> : <Copy size={17} />}
      </button>
    </article>
  );
};

/** The badge closest to being earned, among those that count something. */
const nearestBadge = (badges: BadgeStatus[]): BadgeStatus | null =>
  badges
    .filter(
      (badge) =>
        badge.available &&
        badge.earned_at == null &&
        badge.category !== "secret" &&
        badge.progress != null &&
        badge.progress.target > 0,
    )
    .reduce<BadgeStatus | null>((best, badge) => {
      const ratio = (candidate: BadgeStatus) =>
        (candidate.progress?.current ?? 0) / (candidate.progress?.target ?? 1);
      return !best || ratio(badge) > ratio(best) ? badge : best;
    }, null);

interface TodayScreenProps {
  onNavigate: (screen: Screen) => void;
}

/** The home screen: today's figures, the latest dictations, the next goal. */
export const TodayScreen: React.FC<TodayScreenProps> = ({ onNavigate }) => {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const osType = useOsType();
  const { settings } = useSettings();
  const [activity, setActivity] = useState<DailyActivity[]>([]);
  const [board, setBoard] = useState<BadgeBoard | null>(null);
  const [recent, setRecent] = useState<HistoryEntry[]>([]);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    const [days, badges, history] = await Promise.all([
      commands.getDailyActivity(),
      commands.getBadgeBoard(),
      // A few more than shown: files and failed takes are left out.
      commands.getHistoryEntries(null, RECENT * 4),
    ]);
    if (days.status === "ok") setActivity(days.data);
    if (badges.status === "ok") setBoard(badges.data);
    if (history.status === "ok") {
      setRecent(history.data.entries.filter(isDictation).slice(0, RECENT));
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    load();
    const unlisten = events.historyUpdatePayload.listen(() => load());
    return () => {
      unlisten.then((stop) => stop());
    };
  }, [load]);

  const today = useMemo(
    () => activity.find((day) => day.date === dayKey(new Date())),
    [activity],
  );
  const streak = useMemo(() => currentStreak(activity), [activity]);
  const next = useMemo(
    () => (board ? nearestBadge(board.badges) : null),
    [board],
  );

  const standing = board?.standing;
  const nextBelt =
    standing?.next_belt_words != null
      ? {
          name: t(`badges.belts.${standing.belt + 1}`),
          ratio:
            (standing.lifetime_words - standing.belt_words) /
            (standing.next_belt_words - standing.belt_words),
          remaining: standing.next_belt_words - standing.lifetime_words,
        }
      : null;

  const date = new Intl.DateTimeFormat(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date());
  const binding = settings?.bindings?.transcribe?.current_binding;
  const firstTime = loaded && recent.length === 0;

  return (
    <div className="flex w-full flex-col gap-8 px-8 py-8">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-[28px] font-bold tracking-tight">
          {t("today.title")}
        </h1>
        <p className="text-[15px] text-ink-3 first-letter:capitalize">{date}</p>
      </div>

      <section
        aria-label={t("today.figures")}
        data-theme="fir"
        className="relative overflow-hidden bg-surface border border-edge rounded-2xl"
      >
        <TopoLines hill className="h-full" />
        {firstTime ? (
          <div className="relative flex flex-col gap-3 p-7">
            <span className="text-[28px] leading-tight font-bold tracking-tight">
              {t("today.welcome")}
            </span>
            <p className="max-w-xl text-[15px] leading-relaxed text-ink-3">
              {t("dictations.empty")}
            </p>
          </div>
        ) : (
          <div className="relative flex flex-wrap">
            <Figure
              label={t("today.wordsToday")}
              value={formatCount(today?.word_count ?? 0, locale)}
            />
            <Figure
              label={t("today.durationToday")}
              value={formatDuration(today?.duration_ms ?? 0)}
            />
            <Figure
              label={t("insights.streak")}
              value={formatCount(streak, locale)}
              note={t("insights.streakNote")}
            />
          </div>
        )}
      </section>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(320px,1fr))] gap-8">
        <section aria-labelledby="today-recent" className="flex flex-col gap-4">
          <h2 id="today-recent" className="text-lg font-semibold">
            {t("today.recent")}
          </h2>
          {recent.length > 0 ? (
            <div className="flex flex-col bg-surface border border-edge rounded-[14px]">
              {recent.map((entry) => (
                <RecentRow key={entry.id} entry={entry} locale={locale} />
              ))}
            </div>
          ) : (
            <p className="p-6 bg-surface border border-edge rounded-[14px] text-[15px] text-ink-3">
              {t("today.noRecent")}
            </p>
          )}
          <button
            type="button"
            onClick={() => onNavigate("dictations")}
            className={LINK}
          >
            {t("today.allDictations")}
            <ArrowRight size={15} />
          </button>
        </section>

        <section aria-labelledby="today-next" className="flex flex-col gap-4">
          <h2 id="today-next" className="text-lg font-semibold">
            {t("today.nextUp")}
          </h2>
          <div className="flex flex-col gap-5 p-5 bg-surface border border-edge rounded-[14px]">
            {next?.progress && (
              <div className="flex gap-4">
                <BadgeEmblem id={next.id} earned={false} />
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <span className="text-[15px] font-semibold leading-snug">
                    {t(`badges.items.${next.id}.name`)}
                  </span>
                  <span className="text-[13px] leading-snug text-ink-3">
                    {t(`badges.items.${next.id}.description`)}
                  </span>
                  <div className="flex flex-col gap-1.5 pt-1">
                    <Meter
                      value={next.progress.current / next.progress.target}
                      label={t(`badges.items.${next.id}.name`)}
                    />
                    <span className="text-[12px] text-ink-3 tabular-nums">
                      <span className="measure font-semibold">
                        {formatCount(Math.floor(next.progress.current), locale)}
                      </span>
                      {` / ${formatCount(next.progress.target, locale)}`}
                    </span>
                  </div>
                </div>
              </div>
            )}
            {standing && (
              <div
                className={`flex flex-col gap-2 ${next?.progress ? "pt-5 border-t border-edge" : ""}`}
              >
                <span className="text-[15px] font-semibold">
                  {t(`badges.belts.${standing.belt}`)}
                </span>
                {nextBelt ? (
                  <>
                    <Meter value={nextBelt.ratio} label={nextBelt.name} />
                    <span className="text-[13px] text-ink-3">
                      {t("badges.nextBelt", {
                        words: formatCount(nextBelt.remaining, locale),
                        belt: nextBelt.name,
                      })}
                    </span>
                  </>
                ) : (
                  <span className="text-[13px] text-ink-3">
                    {t("badges.topBelt")}
                  </span>
                )}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => onNavigate("badges")}
            className={LINK}
          >
            {t("today.allBadges")}
            <ArrowRight size={15} />
          </button>
        </section>
      </div>

      {binding && (
        <p className="flex flex-wrap items-center gap-2 text-[13px] text-ink-3">
          {t("today.hintBefore")}
          <Keycaps binding={binding} osType={osType} size="line" />
          {t("today.hintAfter")}
        </p>
      )}
    </div>
  );
};
