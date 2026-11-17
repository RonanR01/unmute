import React, { useCallback, useEffect, useState } from "react";
import { PenLine, RefreshCw, Share2 } from "lucide-react";
import { Trans, useTranslation } from "react-i18next";
import {
  commands,
  events,
  type DailyActivity,
  type DictationStats,
  type PortraitProvider,
  type VoicePortrait,
  type VoiceProfile,
} from "@/bindings";
import { notify } from "@/stores/noticeStore";
import { formatCount, formatDuration } from "@/lib/utils/measures";
import { TopoLines } from "../shared/TopoLines";
import type { ShareCard } from "@/lib/shareCard";
import { ShareDialog } from "../share/ShareDialog";
import { Heatmap, HeatmapLegend } from "./Heatmap";

const KeyNumber: React.FC<{
  label: string;
  value: string;
  unit?: string;
  first?: boolean;
}> = ({ label, value, unit, first }) => (
  <div
    className={`flex-[1_1_200px] flex flex-col gap-2 p-7 ${first ? "" : "border-s border-edge"}`}
  >
    <span className="text-sm text-ink-3">{label}</span>
    <span className="text-[42px] leading-none font-bold tracking-tight measure tabular-nums">
      {value}
      {unit && (
        <span className="ms-2 text-[15px] font-medium tracking-normal text-ink-3">
          {unit}
        </span>
      )}
    </span>
  </div>
);

const ProfileCard: React.FC<{
  label: string;
  value: string;
  measured?: boolean;
  children?: React.ReactNode;
}> = ({ label, value, measured, children }) => (
  <div className="flex flex-col gap-2.5 p-6 bg-surface border border-edge rounded-2xl">
    <span className="text-sm text-ink-3">{label}</span>
    <span
      className={`text-[28px] leading-tight font-bold tracking-tight break-words ${measured ? "self-start measure" : ""}`}
    >
      {value}
    </span>
    <span className="text-sm text-ink-3">{children}</span>
  </div>
);

/** Why a portrait wasn't written, for the codes the backend sends. */
const PORTRAIT_ERRORS: Record<string, string> = {
  no_provider: "insights.portrait.noProvider",
  no_dictations: "insights.notEnoughData",
  bad_answer: "insights.portrait.badAnswer",
};

/** The written profile: an archetype and how the user dictates. */
const PortraitCard: React.FC<{
  locale: string;
  onChooseModel: () => void;
}> = ({ locale, onChooseModel }) => {
  const { t } = useTranslation();
  const [portrait, setPortrait] = useState<VoicePortrait | null>(null);
  const [provider, setProvider] = useState<PortraitProvider | null>(null);
  const [writing, setWriting] = useState(false);

  useEffect(() => {
    commands.getVoicePortrait().then((result) => {
      if (result.status === "ok") setPortrait(result.data);
    });
    commands.getVoicePortraitProvider().then((result) => {
      if (result.status === "ok") setProvider(result.data);
    });
  }, []);

  const write = async () => {
    setWriting(true);
    try {
      const result = await commands.refreshVoicePortrait();
      if (result.status === "ok") {
        setPortrait(result.data);
      } else {
        const known = PORTRAIT_ERRORS[result.error];
        notify({
          title: t("insights.portrait.failed"),
          detail: known ? t(known) : result.error,
        });
      }
    } finally {
      setWriting(false);
    }
  };

  const writtenOn =
    portrait &&
    new Intl.DateTimeFormat(locale, { dateStyle: "long" }).format(
      new Date(portrait.computed_at * 1000),
    );

  return (
    <div className="relative overflow-hidden flex flex-col gap-3 p-7 bg-surface border border-edge rounded-2xl">
      <TopoLines hill className="h-full" />
      <span className="relative text-sm text-ink-3">
        {t("insights.portrait.label")}
      </span>
      {portrait ? (
        <>
          <span className="relative text-[32px] leading-tight font-bold tracking-tight">
            {portrait.title}
          </span>
          <p className="relative max-w-2xl text-[15px] leading-relaxed text-text/85 select-text cursor-text">
            {portrait.description}
          </p>
          <span className="relative text-[13px] text-ink-3">
            {t("insights.portrait.writtenBy", {
              provider: portrait.provider_label,
              date: writtenOn,
            })}
          </span>
        </>
      ) : (
        <p className="relative max-w-2xl text-[15px] leading-relaxed text-ink-3">
          {t("insights.portrait.empty")}
        </p>
      )}
      <div className="relative flex flex-wrap items-center gap-x-4 gap-y-2 pt-1">
        <button
          type="button"
          onClick={provider ? write : onChooseModel}
          disabled={writing}
          className="min-h-11 px-4 flex items-center gap-2 rounded-[10px] border border-line-strong text-sm font-medium cursor-pointer transition-colors hover:bg-surface-raised disabled:opacity-50 disabled:cursor-default focus-visible:outline-2 focus-visible:outline-text"
        >
          <PenLine
            size={16}
            className={writing ? "animate-pulse" : undefined}
          />
          {writing
            ? t("insights.portrait.writing")
            : !provider
              ? t("insights.portrait.chooseModel")
              : portrait
                ? t("insights.portrait.rewrite")
                : t("insights.portrait.write")}
        </button>
        <span className="flex-1 min-w-52 text-[13px] text-ink-3">
          {!provider
            ? t("insights.portrait.noProvider")
            : provider.local
              ? t("insights.portrait.staysLocal", { provider: provider.label })
              : t("insights.portrait.sendsTo", { provider: provider.label })}
        </span>
      </div>
    </div>
  );
};

const Measured: React.FC<{ children?: React.ReactNode }> = ({ children }) => (
  <span className="measure font-semibold tabular-nums">{children}</span>
);

export const InsightsScreen: React.FC<{ onChooseModel: () => void }> = ({
  onChooseModel,
}) => {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const [stats, setStats] = useState<DictationStats | null>(null);
  const [activity, setActivity] = useState<DailyActivity[]>([]);
  const [profile, setProfile] = useState<VoiceProfile | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [sharing, setSharing] = useState<ShareCard | null>(null);

  const load = useCallback(async () => {
    const [statsResult, activityResult] = await Promise.all([
      commands.getDictationStats(),
      commands.getDailyActivity(),
    ]);
    if (statsResult.status === "ok") setStats(statsResult.data);
    if (activityResult.status === "ok") setActivity(activityResult.data);
  }, []);

  useEffect(() => {
    load();
    // Counting is quick and local: the profile is fresh every time the
    // screen opens, and the button recounts on demand.
    commands.refreshVoiceProfile().then((result) => {
      if (result.status === "ok") setProfile(result.data);
    });
  }, [load]);

  useEffect(() => {
    const unlisten = events.historyUpdatePayload.listen(() => load());
    return () => {
      unlisten.then((stop) => stop());
    };
  }, [load]);

  const refreshProfile = async () => {
    setRefreshing(true);
    try {
      const result = await commands.refreshVoiceProfile();
      if (result.status === "ok") setProfile(result.data);
      else notify({ title: t("insights.refreshFailed") });
    } finally {
      setRefreshing(false);
    }
  };

  const share = async () => {
    if (!stats) return;
    const board = await commands.getBadgeBoard();
    const standing = board.status === "ok" ? board.data.standing : null;
    const figures = [
      {
        label: t("dictations.words"),
        value: formatCount(stats.word_count, locale),
      },
      {
        label: t("insights.pace"),
        value:
          stats.words_per_minute != null
            ? formatCount(Math.round(stats.words_per_minute), locale)
            : "–",
        unit: t("dictations.wordsPerMinute"),
      },
      {
        label: t("dictations.duration"),
        value: formatDuration(stats.duration_ms),
      },
    ];
    const phrase = profile?.catchphrases[0];
    setSharing({
      kind: "insights",
      title: t("share.insightsTitle"),
      figures,
      catchphrase: phrase
        ? { label: t("insights.catchphrase"), text: phrase.text }
        : undefined,
      standing: standing
        ? t("share.dictatedWith", {
            belt: t(`badges.belts.${standing.belt}`),
            words: formatCount(standing.lifetime_words, locale),
          })
        : "",
    });
  };

  const placeholder = "–";
  const catchphrase = profile?.catchphrases[0];
  const topWord = profile?.top_words[0];
  const refreshedOn =
    profile &&
    new Intl.DateTimeFormat(locale, {
      dateStyle: "long",
      timeStyle: "short",
    }).format(new Date(profile.computed_at * 1000));

  return (
    <div className="flex flex-col w-full gap-8 px-8 py-8">
      <ShareDialog
        card={sharing}
        fileName="unwrite-insights"
        onClose={() => setSharing(null)}
      />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-[28px] font-bold tracking-tight">
            {t("insights.title")}
          </h1>
          <p className="text-[15px] text-ink-3">{t("insights.subtitle")}</p>
        </div>
        <button
          type="button"
          onClick={share}
          disabled={!stats}
          className="min-h-11 px-4 flex items-center gap-2 rounded-[10px] border border-line-strong text-sm font-medium cursor-pointer transition-colors hover:bg-surface-raised disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-text"
        >
          <Share2 size={16} />
          {t("share.shareInsights")}
        </button>
      </div>

      <section
        aria-label={t("insights.keyNumbers")}
        data-theme="fir"
        className="relative overflow-hidden bg-surface border border-edge rounded-2xl"
      >
        <TopoLines className="h-full" />
        <div className="relative flex flex-wrap">
          <KeyNumber
            first
            label={t("dictations.duration")}
            value={stats ? formatDuration(stats.duration_ms) : placeholder}
          />
          <KeyNumber
            label={t("insights.pace")}
            value={
              stats?.words_per_minute != null
                ? formatCount(Math.round(stats.words_per_minute), locale)
                : placeholder
            }
            unit={t("dictations.wordsPerMinute")}
          />
          <KeyNumber
            label={t("dictations.words")}
            value={stats ? formatCount(stats.word_count, locale) : placeholder}
          />
        </div>
      </section>

      <section
        aria-labelledby="insights-activity"
        className="flex flex-col gap-4"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 id="insights-activity" className="text-lg font-semibold">
            {t("insights.activity")}
          </h2>
          <HeatmapLegend />
        </div>
        <Heatmap activity={activity} />
      </section>

      <section
        aria-labelledby="insights-profile"
        className="flex flex-col gap-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h2 id="insights-profile" className="text-lg font-semibold">
              {t("insights.voiceProfile")}
            </h2>
            <span className="text-[13px] text-ink-3">
              {refreshedOn
                ? t("insights.lastRefresh", { date: refreshedOn })
                : t("insights.neverRefreshed")}
            </span>
          </div>
          <button
            type="button"
            onClick={refreshProfile}
            disabled={refreshing}
            className="min-h-11 px-4 flex items-center gap-2 rounded-[10px] bg-signal text-on-signal text-sm font-semibold cursor-pointer transition-opacity hover:opacity-90 disabled:opacity-60 disabled:cursor-default focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text"
          >
            <RefreshCw
              size={16}
              className={refreshing ? "animate-spin" : undefined}
            />
            {t("insights.refresh")}
          </button>
        </div>

        <PortraitCard locale={locale} onChooseModel={onChooseModel} />

        {profile && (
          <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4">
            <ProfileCard
              label={t("insights.catchphrase")}
              value={catchphrase ? `« ${catchphrase.text} »` : placeholder}
            >
              {catchphrase ? (
                <Trans
                  i18nKey="insights.saidTimes"
                  values={{ n: formatCount(catchphrase.count, locale) }}
                  components={{ m: <Measured /> }}
                />
              ) : (
                t("insights.notEnoughData")
              )}
            </ProfileCard>
            <ProfileCard
              label={t("insights.topWord")}
              value={topWord ? topWord.text : placeholder}
            >
              {topWord ? (
                <Trans
                  i18nKey="insights.usedTimes"
                  values={{ n: formatCount(topWord.count, locale) }}
                  components={{ m: <Measured /> }}
                />
              ) : (
                t("insights.notEnoughData")
              )}
            </ProfileCard>
            <ProfileCard
              measured
              label={t("insights.englishShare")}
              value={
                profile.english_share != null
                  ? `${Math.round(profile.english_share * 100)} %`
                  : placeholder
              }
            >
              {profile.english_share != null
                ? t("insights.ofMyWords")
                : t("insights.languageUnknown")}
            </ProfileCard>
          </div>
        )}
        {profile && profile.top_words.length > 0 && (
          <div className="flex flex-col gap-4 p-6 bg-surface border border-edge rounded-2xl">
            <div className="flex flex-col gap-1">
              <h3 className="text-[15px] font-semibold">
                {t("insights.topWords")}
              </h3>
              <span className="text-[13px] text-ink-3">
                {t("insights.topWordsNote")}
              </span>
            </div>
            <ol className="grid grid-flow-col grid-rows-[repeat(30,auto)] gap-x-10 gap-y-1.5 lg:grid-rows-[repeat(15,auto)] 2xl:grid-rows-[repeat(10,auto)]">
              {profile.top_words.map((word, index) => (
                <li
                  key={word.text}
                  className="flex items-center gap-3 text-[14px]"
                >
                  <span className="w-5 shrink-0 text-end text-[12px] text-ink-3 tabular-nums">
                    {index + 1}
                  </span>
                  <span className="w-28 shrink-0 truncate" title={word.text}>
                    {word.text}
                  </span>
                  <span
                    aria-hidden="true"
                    className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-gauge-track"
                  >
                    <span
                      className="block h-full rounded-full bg-signal"
                      style={{
                        width: `${(word.count / profile.top_words[0].count) * 100}%`,
                      }}
                    />
                  </span>
                  <span className="w-9 shrink-0 text-end font-semibold text-signal-ink tabular-nums">
                    {formatCount(word.count, locale)}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        )}
        {!profile && (
          <p className="p-6 bg-surface border border-edge rounded-2xl text-[15px] text-ink-3">
            {t("insights.noProfile")}
          </p>
        )}
      </section>
    </div>
  );
};
