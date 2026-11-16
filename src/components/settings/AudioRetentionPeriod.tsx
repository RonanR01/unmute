import React from "react";
import { useTranslation } from "react-i18next";
import { Dropdown } from "../ui/Dropdown";
import { SettingContainer } from "../ui/SettingContainer";
import { useSettings } from "../../hooks/useSettings";
import type { AudioRetentionPeriod } from "@/bindings";

interface AudioRetentionPeriodProps {
  descriptionMode?: "inline" | "tooltip";
  grouped?: boolean;
}

/** How long a dictation's recording is kept, apart from its text. */
export const AudioRetentionPeriodSelector: React.FC<AudioRetentionPeriodProps> =
  React.memo(({ descriptionMode = "tooltip", grouped = false }) => {
    const { t } = useTranslation();
    const { getSetting, updateSetting, isUpdating } = useSettings();
    const selected = getSetting("audio_retention_period") || "same_as_history";

    const options: { value: AudioRetentionPeriod; label: string }[] = [
      {
        value: "same_as_history",
        label: t("settings.debug.audioRetention.sameAsHistory"),
      },
      { value: "days_3", label: t("settings.debug.recordingRetention.days3") },
      {
        value: "weeks_2",
        label: t("settings.debug.recordingRetention.weeks2"),
      },
      {
        value: "months_3",
        label: t("settings.debug.recordingRetention.months3"),
      },
    ];

    return (
      <SettingContainer
        title={t("settings.debug.audioRetention.title")}
        description={t("settings.debug.audioRetention.description")}
        descriptionMode={descriptionMode}
        grouped={grouped}
      >
        <Dropdown
          options={options}
          selectedValue={selected}
          onSelect={(period) =>
            updateSetting(
              "audio_retention_period",
              period as AudioRetentionPeriod,
            )
          }
          placeholder={t("settings.debug.recordingRetention.placeholder")}
          disabled={isUpdating("audio_retention_period")}
        />
      </SettingContainer>
    );
  });

AudioRetentionPeriodSelector.displayName = "AudioRetentionPeriodSelector";
