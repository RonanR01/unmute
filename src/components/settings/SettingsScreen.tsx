import React from "react";
import { useTranslation } from "react-i18next";
import { SECTIONS_CONFIG, type SidebarSection } from "../Sidebar";
import { useSettings } from "../../hooks/useSettings";

interface SettingsScreenProps {
  section: SidebarSection;
  onSectionChange: (section: SidebarSection) => void;
  children: React.ReactNode;
}

/** Settings: Handy's sections as tabs, the active one below. */
export const SettingsScreen: React.FC<SettingsScreenProps> = ({
  section,
  onSectionChange,
  children,
}) => {
  const { t } = useTranslation();
  const { settings } = useSettings();
  const sections = (Object.keys(SECTIONS_CONFIG) as SidebarSection[]).filter(
    (id) => SECTIONS_CONFIG[id].enabled(settings),
  );

  return (
    <div
      className={`flex flex-col w-full gap-5 ${section === "models" ? "h-full" : ""}`}
    >
      <div className="flex flex-col gap-4 px-6 pt-5">
        <h1 className="text-[28px] font-bold tracking-tight">
          {t("sidebar.settings")}
        </h1>
        <div
          role="tablist"
          aria-label={t("sidebar.settings")}
          className="flex flex-wrap gap-1 border-b border-edge pb-3"
        >
          {sections.map((id) => {
            const isActive = id === section;
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => onSectionChange(id)}
                className={`min-h-9 px-3 rounded-[10px] text-sm cursor-pointer transition-colors focus-visible:outline-2 focus-visible:outline-text ${
                  isActive
                    ? "bg-surface-raised text-text font-semibold"
                    : "text-ink-3 font-medium hover:text-text hover:bg-surface"
                }`}
              >
                {t(SECTIONS_CONFIG[id].labelKey)}
              </button>
            );
          })}
        </div>
      </div>
      <div
        className={`flex flex-col items-center px-4 pb-4 gap-4 ${section === "models" ? "flex-1 min-h-0" : ""}`}
      >
        {children}
      </div>
    </div>
  );
};
