import React, { useCallback, useEffect, useState } from "react";
import { PenLine, RefreshCw } from "lucide-react";
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
  <span className="text-signal font-semibold tabular-nums">{children}</span>
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
        {!profile && (
          <p className="p-6 bg-surface border border-edge rounded-2xl text-[15px] text-ink-3">
            {t("insights.noProfile")}
          </p>
        )}
      </section>
    </div>
  );
};
