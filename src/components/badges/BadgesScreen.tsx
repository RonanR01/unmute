import React, { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  commands,
  events,
  type BadgeBoard,
  type BadgeCategory,
  type BadgeStatus,
} from "@/bindings";
import { formatCount } from "@/lib/utils/measures";
import { TopoLines } from "../shared/TopoLines";
import { BadgeEmblem } from "./BadgeEmblem";

const CATEGORIES: BadgeCategory[] = [
  "volume",
  "style",
  "moments",
  "progress",
  "together",
  "secret",
];

const BELTS = 7;

/** A bar that fills in signal yellow: how far a count has come. */
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
    className="h-1.5 w-full overflow-hidden rounded-full bg-surface-raised"
  >
    <div
      className="h-full rounded-full bg-signal"
      style={{ width: `${Math.min(100, Math.max(0, value * 100))}%` }}
    />
  </div>
);

const BadgeTile: React.FC<{
  badge: BadgeStatus;
  locale: string;
  fresh: boolean;
}> = ({ badge, locale, fresh }) => {
  const { t } = useTranslation();
  const earned = badge.earned_at != null;
  const hidden = badge.category === "secret" && !earned;
  const name = hidden
    ? t("badges.secretName")
    : t(`badges.items.${badge.id}.name`);
  const description = hidden
    ? t("badges.secretDescription")
    : t(`badges.items.${badge.id}.description`);

  let status: React.ReactNode;
  if (earned) {
    status = (
      <span className="text-[13px] text-text">
        {t("badges.earnedOn", {
          date: new Intl.DateTimeFormat(locale, { dateStyle: "long" }).format(
            new Date((badge.earned_at ?? 0) * 1000),
          ),
        })}
      </span>
    );
  } else if (!badge.available) {
    status = (
      <span className="self-start rounded-full border border-edge px-2.5 py-0.5 text-[12px] text-ink-3">
        {t("badges.soon")}
      </span>
    );
  } else if (badge.progress) {
    const { current, target } = badge.progress;
    const count = `${formatCount(Math.floor(current), locale)} / ${formatCount(target, locale)}`;
    status = (
      <div className="flex flex-col gap-1.5">
        <Meter value={current / target} label={name} />
        <span className="text-[12px] text-ink-3 tabular-nums">
          <span className="text-signal font-semibold">
            {formatCount(Math.floor(current), locale)}
          </span>
          {count.slice(formatCount(Math.floor(current), locale).length)}
        </span>
      </div>
    );
  } else {
    status = (
      <span className="text-[13px] text-ink-3">{t("badges.toEarn")}</span>
    );
  }

  return (
    <li
      className={`flex gap-4 p-4 rounded-[14px] border ${earned ? "bg-surface border-edge" : "border-edge/70"} ${fresh ? "outline-2 outline-text" : ""}`}
    >
      <BadgeEmblem id={badge.id} earned={earned} hidden={hidden} size={60} />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span
          className={`text-[15px] font-semibold leading-snug ${earned ? "" : "text-text/80"}`}
        >
          {name}
          {fresh && (
            <span className="ms-2 rounded-full bg-text px-2 py-0.5 align-middle text-[11px] font-semibold text-background">
              {t("badges.newBadge")}
            </span>
          )}
        </span>
        <span className="text-[13px] leading-snug text-ink-3">
          {description}
        </span>
        <div className="pt-1">{status}</div>
      </div>
    </li>
  );
};

export const BadgesScreen: React.FC = () => {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const [board, setBoard] = useState<BadgeBoard | null>(null);
  // Earned while this screen was open: celebrated until the user leaves.
  const [fresh, setFresh] = useState<string[]>([]);

  const load = useCallback(async () => {
    const result = await commands.getBadgeBoard();
    if (result.status !== "ok") return;
    setBoard(result.data);
    if (result.data.newly_earned.length > 0) {
      setFresh((known) => [
        ...known,
        ...result.data.newly_earned.filter((id) => !known.includes(id)),
      ]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const unlisten = events.historyUpdatePayload.listen(({ payload }) => {
      if (payload.action === "added" || payload.action === "updated") load();
    });
    return () => {
      unlisten.then((stop) => stop());
    };
  }, [load]);

  const standing = board?.standing;
  const earnedCount =
    board?.badges.filter((badge) => badge.earned_at != null).length ?? 0;
  const beltName = standing ? t(`badges.belts.${standing.belt}`) : "";
  const nextBelt =
    standing?.next_belt_words != null
      ? {
          name: t(`badges.belts.${standing.belt + 1}`),
          progress:
            (standing.lifetime_words - standing.belt_words) /
            (standing.next_belt_words - standing.belt_words),
          remaining: standing.next_belt_words - standing.lifetime_words,
        }
      : null;

  return (
    <div className="flex w-full flex-col gap-8 px-8 py-8">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-[28px] font-bold tracking-tight">
          {t("badges.title")}
        </h1>
        <p className="text-[15px] text-ink-3">{t("badges.subtitle")}</p>
      </div>

      {standing && (
        <section
          aria-labelledby="badges-standing"
          className="relative overflow-hidden flex flex-col gap-5 p-7 bg-surface border border-edge rounded-2xl"
        >
          <TopoLines hill className="h-full" />
          <div className="relative flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
            <div className="flex flex-col gap-1.5">
              <span className="text-sm text-ink-3">{t("badges.status")}</span>
              <h2
                id="badges-standing"
                className="text-[30px] leading-tight font-bold tracking-tight"
              >
                {beltName}
              </h2>
            </div>
            <div className="flex gap-8">
              <div className="flex flex-col gap-1">
                <span className="text-[13px] text-ink-3">
                  {t("badges.lifetimeWords")}
                </span>
                <span className="text-[22px] font-bold tracking-tight text-signal tabular-nums">
                  {formatCount(standing.lifetime_words, locale)}
                </span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-[13px] text-ink-3">
                  {t("badges.earnedCount")}
                </span>
                <span className="text-[22px] font-bold tracking-tight text-signal tabular-nums">
                  {earnedCount}
                  <span className="text-sm font-medium text-ink-3">
                    {" "}
                    / {board?.badges.length}
                  </span>
                </span>
              </div>
            </div>
          </div>

          <ol
            aria-label={t("badges.beltsLabel")}
            className="relative flex gap-1.5"
          >
            {Array.from({ length: BELTS }, (_, belt) => (
              <li
                key={belt}
                title={t(`badges.belts.${belt}`)}
                aria-current={belt === standing.belt ? "step" : undefined}
                className={`h-2.5 flex-1 rounded-full ${
                  belt <= standing.belt ? "bg-text" : "bg-surface-raised"
                } ${belt === standing.belt ? "" : belt < standing.belt ? "opacity-45" : ""}`}
              />
            ))}
          </ol>

          <div className="relative flex flex-col gap-2">
            {nextBelt ? (
              <>
                <Meter value={nextBelt.progress} label={nextBelt.name} />
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
        </section>
      )}

      {board &&
        CATEGORIES.map((category) => {
          const badges = board.badges.filter(
            (badge) => badge.category === category,
          );
          if (badges.length === 0) return null;
          return (
            <section
              key={category}
              aria-labelledby={`badges-${category}`}
              className="flex flex-col gap-4"
            >
              <h2 id={`badges-${category}`} className="text-lg font-semibold">
                {t(`badges.categories.${category}`)}
              </h2>
              <ul className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3">
                {badges.map((badge) => (
                  <BadgeTile
                    key={badge.id}
                    badge={badge}
                    locale={locale}
                    fresh={fresh.includes(badge.id)}
                  />
                ))}
              </ul>
            </section>
          );
        })}
    </div>
  );
};
