import React, { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Trans, useTranslation } from "react-i18next";
import {
  commands,
  events,
  type DailyActivity,
  type DictationStats,
  type VoiceProfile,
} from "@/bindings";
import { notify } from "@/stores/noticeStore";
import { formatCount, formatDuration } from "@/lib/utils/measures";
import { TopoLines } from "../shared/TopoLines";
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
    <span className="text-[42px] leading-none font-bold tracking-tight text-signal tabular-nums">
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
      className={`text-[28px] leading-tight font-bold tracking-tight break-words ${measured ? "text-signal" : ""}`}
    >
      {value}
    </span>
    <span className="text-sm text-ink-3">{children}</span>
  </div>
);

const Measured: React.FC<{ children?: React.ReactNode }> = ({ children }) => (
  <span className="text-signal font-semibold tabular-nums">{children}</span>
);

export const InsightsScreen: React.FC = () => {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const [stats, setStats] = useState<DictationStats | null>(null);
  const [activity, setActivity] = useState<DailyActivity[]>([]);
  const [profile, setProfile] = useState<VoiceProfile | null>(null);
  const [refreshing, setRefreshing] = useState(false);

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
    commands.getVoiceProfile().then((result) => {
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
      <div className="flex flex-col gap-1.5">
        <h1 className="text-[28px] font-bold tracking-tight">
          {t("insights.title")}
        </h1>
        <p className="text-[15px] text-ink-3">{t("insights.subtitle")}</p>
      </div>

      <section
        aria-label={t("insights.keyNumbers")}
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
            className="min-h-11 px-4 flex items-center gap-2 rounded-[10px] bg-text text-background text-sm font-semibold cursor-pointer transition-opacity hover:opacity-90 disabled:opacity-60 disabled:cursor-default focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text"
          >
            <RefreshCw
              size={16}
              className={refreshing ? "animate-spin" : undefined}
            />
            {t("insights.refresh")}
          </button>
        </div>

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
                ? t("insights.ofMyDictations")
                : t("insights.languageUnknown")}
            </ProfileCard>
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
