import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { readFile } from "@tauri-apps/plugin-fs";
import { Check, Copy, Pause, Play } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  commands,
  events,
  type DictationStats,
  type HistoryEntry,
} from "@/bindings";
import { useOsType } from "@/hooks/useOsType";
import { notify } from "@/stores/noticeStore";
import { dayKey, formatCount, formatDuration } from "@/lib/utils/measures";
import { TopoLines } from "../shared/TopoLines";
import { copyToClipboard } from "../settings/history/clipboard";

const PAGE_SIZE = 50;
/** How long "Copied" stays on a button. */
const COPIED_MS = 1600;

/** What the user dictated; transcribed files and failed takes aren't shown. */
const isDictation = (entry: HistoryEntry) =>
  !entry.source_name && entry.transcription_text.trim() !== "";

const entryText = (entry: HistoryEntry) =>
  entry.post_processed_text?.trim() || entry.transcription_text;

const StatCard: React.FC<{ label: string; value: string; unit?: string }> = ({
  label,
  value,
  unit,
}) => (
  <div className="flex flex-col gap-1.5 p-5 bg-surface border border-edge rounded-[14px]">
    <span className="text-sm text-ink-3">{label}</span>
    <span className="text-[32px] leading-tight font-bold tracking-tight text-signal tabular-nums">
      {value}
      {unit && (
        <span className="ms-2 text-sm font-medium tracking-normal text-ink-3">
          {unit}
        </span>
      )}
    </span>
  </div>
);

const ICON_BUTTON =
  "size-9 shrink-0 flex items-center justify-center rounded-[10px] text-ink-3 cursor-pointer transition-colors hover:text-text hover:bg-surface-raised focus-visible:outline-2 focus-visible:outline-text";

const DictationRow: React.FC<{
  entry: HistoryEntry;
  locale: string;
  playing: boolean;
  onTogglePlay: () => void;
}> = ({ entry, locale, playing, onTogglePlay }) => {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const text = entryText(entry);
  const time = new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(entry.timestamp * 1000));

  const copy = async () => {
    if (await copyToClipboard(text)) {
      setCopied(true);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(false), COPIED_MS);
    } else {
      notify({ title: t("dictations.copyFailed") });
    }
  };

  const playLabel = playing ? t("dictations.pause") : t("dictations.play");
  const copyLabel = copied ? t("dictations.copied") : t("dictations.copy");

  return (
    <article className="flex items-start gap-4 ps-5 pe-3 py-3.5 border-t border-edge first:border-t-0">
      <span className="w-11 shrink-0 pt-2 text-sm text-ink-3 tabular-nums">
        {time}
      </span>
      <p className="flex-1 min-w-0 pt-1.5 text-[15px] leading-relaxed select-text cursor-text whitespace-pre-wrap break-words">
        {text}
      </p>
      <div className="flex shrink-0">
        <button
          type="button"
          onClick={onTogglePlay}
          aria-label={playLabel}
          title={playLabel}
          className={`${ICON_BUTTON} ${playing ? "text-text bg-surface-raised" : ""}`}
        >
          {playing ? <Pause size={17} /> : <Play size={17} />}
        </button>
        <button
          type="button"
          onClick={copy}
          aria-label={copyLabel}
          title={copyLabel}
          className={`${ICON_BUTTON} ${copied ? "text-text" : ""}`}
        >
          {copied ? <Check size={17} /> : <Copy size={17} />}
        </button>
        <span aria-live="polite" className="sr-only">
          {copied ? t("dictations.copied") : ""}
        </span>
      </div>
    </article>
  );
};

export const DictationsScreen: React.FC = () => {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [stats, setStats] = useState<DictationStats | null>(null);
  const osType = useOsType();
  const [playingId, setPlayingId] = useState<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const loadingRef = useRef(false);
  const entriesRef = useRef<HistoryEntry[]>([]);
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    entriesRef.current = entries;
  }, [entries]);

  const loadStats = useCallback(async () => {
    const result = await commands.getDictationStats();
    if (result.status === "ok") setStats(result.data);
  }, []);

  const loadPage = useCallback(async (cursor?: number) => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    try {
      const result = await commands.getHistoryEntries(
        cursor ?? null,
        PAGE_SIZE,
      );
      if (result.status === "ok") {
        const { entries: page, has_more } = result.data;
        setEntries((prev) => {
          if (cursor === undefined) return page;
          const known = new Set(prev.map((entry) => entry.id));
          return [...prev, ...page.filter((entry) => !known.has(entry.id))];
        });
        setHasMore(has_more);
      }
    } catch (error) {
      console.error("Failed to load dictations:", error);
    } finally {
      setLoading(false);
      loadingRef.current = false;
    }
  }, []);

  useEffect(() => {
    loadPage();
    loadStats();
  }, [loadPage, loadStats]);

  useEffect(() => {
    const unlisten = events.historyUpdatePayload.listen(({ payload }) => {
      if (payload.action === "added") {
        setEntries((prev) => [
          payload.entry,
          ...prev.filter((entry) => entry.id !== payload.entry.id),
        ]);
      } else if (payload.action === "updated") {
        setEntries((prev) =>
          prev.map((entry) =>
            entry.id === payload.entry.id ? payload.entry : entry,
          ),
        );
      } else if (payload.action === "deleted") {
        setEntries((prev) => prev.filter((entry) => entry.id !== payload.id));
      }
      loadStats();
    });
    return () => {
      unlisten.then((stop) => stop());
    };
  }, [loadStats]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasMore) return;
    const observer = new IntersectionObserver(([first]) => {
      const last = entriesRef.current[entriesRef.current.length - 1];
      if (first.isIntersecting && last) loadPage(last.id);
    });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loadPage, entries.length]);

  // One recording at a time: starting another stops the one playing.
  const stopPlayback = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      if (audio.src.startsWith("blob:")) URL.revokeObjectURL(audio.src);
    }
    audioRef.current = null;
    setPlayingId(null);
  }, []);

  useEffect(() => stopPlayback, [stopPlayback]);

  const togglePlay = useCallback(
    async (entry: HistoryEntry) => {
      const wasPlaying = audioRef.current && playingId === entry.id;
      stopPlayback();
      if (wasPlaying) return;

      const unavailable = () => {
        stopPlayback();
        notify({ title: t("dictations.audioUnavailable") });
      };
      try {
        const result = await commands.getAudioFilePath(entry.file_name);
        if (result.status !== "ok") return unavailable();
        // Linux's webview can't read the asset protocol for audio.
        const source =
          osType === "linux"
            ? URL.createObjectURL(
                new Blob([await readFile(result.data)], { type: "audio/wav" }),
              )
            : convertFileSrc(result.data, "asset");
        const audio = new Audio(source);
        audio.onended = stopPlayback;
        audio.onerror = unavailable;
        audioRef.current = audio;
        setPlayingId(entry.id);
        await audio.play();
      } catch (error) {
        console.error("Failed to play the recording:", error);
        unavailable();
      }
    },
    [osType, playingId, stopPlayback, t],
  );

  const days = useMemo(() => {
    const today = dayKey(new Date());
    const yesterday = dayKey(new Date(Date.now() - 24 * 60 * 60 * 1000));
    const longDate = new Intl.DateTimeFormat(locale, {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
    const groups: { key: string; label: string; entries: HistoryEntry[] }[] =
      [];
    for (const entry of entries.filter(isDictation)) {
      const date = new Date(entry.timestamp * 1000);
      const key = dayKey(date);
      let group = groups[groups.length - 1];
      if (!group || group.key !== key) {
        const label =
          key === today
            ? t("dictations.today")
            : key === yesterday
              ? t("dictations.yesterday")
              : longDate.format(date);
        group = { key, label, entries: [] };
        groups.push(group);
      }
      group.entries.push(entry);
    }
    return groups;
  }, [entries, locale, t]);

  const placeholder = "–";

  return (
    <div className="relative flex flex-wrap w-full min-h-full">
      <TopoLines hill fade className="h-64" />

      <section
        aria-labelledby="dictations-title"
        className="relative flex-[999_1_420px] min-w-0 flex flex-col gap-7 px-8 py-8"
      >
        <div className="flex flex-col gap-1.5">
          <h1
            id="dictations-title"
            className="text-[28px] font-bold tracking-tight"
          >
            {t("dictations.title")}
          </h1>
          <p className="text-[15px] text-ink-3">{t("dictations.subtitle")}</p>
        </div>

        {!loading && days.length === 0 && (
          <p className="p-6 bg-surface border border-edge rounded-[14px] text-[15px] text-ink-3">
            {t("dictations.empty")}
          </p>
        )}

        {days.map((day) => (
          <div key={day.key} className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold text-ink-3 first-letter:capitalize">
              {day.label}
            </h2>
            <div className="flex flex-col bg-surface border border-edge rounded-[14px]">
              {day.entries.map((entry) => (
                <DictationRow
                  key={entry.id}
                  entry={entry}
                  locale={locale}
                  playing={playingId === entry.id}
                  onTogglePlay={() => togglePlay(entry)}
                />
              ))}
            </div>
          </div>
        ))}
        <div ref={sentinelRef} className="h-px" />
      </section>

      <aside
        aria-labelledby="dictations-stats-title"
        className="relative flex-[1_1_220px] max-w-80 flex flex-col gap-4 ps-8 lg:ps-0 pe-8 py-8"
      >
        <h2
          id="dictations-stats-title"
          className="pt-2.5 text-sm font-semibold text-ink-3"
        >
          {t("dictations.statsTitle")}
        </h2>
        <StatCard
          label={t("dictations.words")}
          value={stats ? formatCount(stats.word_count, locale) : placeholder}
        />
        <StatCard
          label={t("dictations.pace")}
          value={
            stats?.words_per_minute != null
              ? formatCount(Math.round(stats.words_per_minute), locale)
              : placeholder
          }
          unit={t("dictations.wordsPerMinute")}
        />
        <StatCard
          label={t("dictations.duration")}
          value={stats ? formatDuration(stats.duration_ms) : placeholder}
        />
      </aside>
    </div>
  );
};
