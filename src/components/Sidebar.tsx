import React from "react";
import { useTranslation } from "react-i18next";
import {
  BarChart3,
  BookOpen,
  Cog,
  Cpu,
  FlaskConical,
  History,
  Info,
  Mic,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";
import { UnmuteLogo } from "./icons/UnmuteLogo";
import {
  GeneralSettings,
  AdvancedSettings,
  HistorySettings,
  AboutSettings,
  PostProcessingSettings,
  ModelsSettings,
} from "./settings";

interface IconProps {
  width?: number | string;
  height?: number | string;
  size?: number | string;
  className?: string;
  [key: string]: any;
}

/** The four screens of the app, in menu order. */
export const SCREENS = {
  dictations: { labelKey: "sidebar.dictations", icon: Mic },
  insights: { labelKey: "sidebar.insights", icon: BarChart3 },
  dictionary: { labelKey: "sidebar.dictionary", icon: BookOpen },
  settings: { labelKey: "sidebar.settings", icon: SlidersHorizontal },
} as const satisfies Record<
  string,
  { labelKey: string; icon: React.ComponentType<IconProps> }
>;

export type Screen = keyof typeof SCREENS;

interface SectionConfig {
  labelKey: string;
  icon: React.ComponentType<IconProps>;
  /** `null` when App renders the section itself (Debug, with its handlers). */
  component: React.ComponentType | null;
  enabled: (settings: any) => boolean;
}

/** The tabs of the Settings screen. */
export const SECTIONS_CONFIG = {
  general: {
    labelKey: "sidebar.general",
    icon: Cog,
    component: GeneralSettings,
    enabled: () => true,
  },
  models: {
    labelKey: "sidebar.models",
    icon: Cpu,
    component: ModelsSettings,
    enabled: () => true,
  },
  advanced: {
    labelKey: "sidebar.advanced",
    icon: SlidersHorizontal,
    component: AdvancedSettings,
    enabled: () => true,
  },
  postprocessing: {
    labelKey: "sidebar.postProcessing",
    icon: Sparkles,
    component: PostProcessingSettings,
    enabled: (settings) => settings?.post_process_enabled ?? false,
  },
  history: {
    labelKey: "sidebar.history",
    icon: History,
    component: HistorySettings,
    enabled: () => true,
  },
  debug: {
    labelKey: "sidebar.debug",
    icon: FlaskConical,
    component: null,
    enabled: (settings) => settings?.debug_mode ?? false,
  },
  about: {
    labelKey: "sidebar.about",
    icon: Info,
    component: AboutSettings,
    enabled: () => true,
  },
} as const satisfies Record<string, SectionConfig>;

export type SidebarSection = keyof typeof SECTIONS_CONFIG;

interface SidebarProps {
  activeScreen: Screen;
  onScreenChange: (screen: Screen) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeScreen,
  onScreenChange,
}) => {
  const { t } = useTranslation();

  return (
    <nav
      aria-label={t("sidebar.navigation")}
      data-tauri-drag-region
      className="flex flex-col w-52 shrink-0 h-full px-3 pb-6 pt-[calc(var(--titlebar-inset)+20px)] gap-7"
    >
      <UnmuteLogo className="px-3" />
      <div className="flex flex-col gap-1">
        {(Object.keys(SCREENS) as Screen[]).map((id) => {
          const { labelKey, icon: Icon } = SCREENS[id];
          const isActive = activeScreen === id;
          return (
            <button
              key={id}
              type="button"
              aria-current={isActive ? "page" : undefined}
              onClick={() => onScreenChange(id)}
              className={`flex items-center gap-3 min-h-11 px-3 rounded-[10px] text-start text-[15px] cursor-pointer transition-colors focus-visible:outline-2 focus-visible:outline-text ${
                isActive
                  ? "bg-surface-raised text-text font-semibold"
                  : "text-ink-3 font-medium hover:text-text hover:bg-surface"
              }`}
            >
              <Icon size={18} strokeWidth={1.75} className="shrink-0" />
              <span className="truncate">{t(labelKey)}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
